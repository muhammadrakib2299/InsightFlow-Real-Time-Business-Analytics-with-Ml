"""API-key authentication for the ingest endpoint.

Keys are stored in Postgres (managed by the NestJS service) as
(prefix, argon2 hash, workspace_id, revoked_at). We hash the presented key
and look up by prefix; if the hash matches and revoked_at IS NULL, the key
is valid for that workspace.

Lookups are cached in Redis with a 60s TTL so a hot ingest pipeline doesn't
hammer Postgres.
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass
from typing import Any

import asyncpg
import structlog
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Header, HTTPException, status

from .settings import get_settings

logger = structlog.get_logger(__name__)


@dataclass(frozen=True, slots=True)
class ApiKeyContext:
    workspace_id: str
    key_id: str
    prefix: str


_hasher = PasswordHasher()
_pool: asyncpg.Pool | None = None
_pool_lock = asyncio.Lock()


async def _get_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        async with _pool_lock:
            if _pool is None:
                settings = get_settings()
                _pool = await asyncpg.create_pool(
                    settings.postgres_dsn,
                    min_size=1,
                    max_size=8,
                    command_timeout=5.0,
                )
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def _lookup_key(prefix: str) -> dict[str, Any] | None:
    pool = await _get_pool()
    row = await pool.fetchrow(
        """
        SELECT id, workspace_id, hash, revoked_at
        FROM api_keys
        WHERE prefix = $1 AND revoked_at IS NULL
        LIMIT 1
        """,
        prefix,
    )
    return dict(row) if row else None


async def require_api_key(
    x_api_key: str | None = Header(default=None, alias="X-Api-Key"),
    authorization: str | None = Header(default=None),
) -> ApiKeyContext:
    """FastAPI dependency: resolve an API key into a workspace context.

    Accepts either `X-Api-Key: ifk_live_xxx` or `Authorization: Bearer ifk_live_xxx`.
    """
    raw_key = x_api_key
    if not raw_key and authorization and authorization.lower().startswith("bearer "):
        raw_key = authorization.split(" ", 1)[1].strip()

    if not raw_key or not raw_key.startswith("ifk_"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "missing or malformed api key")

    prefix = raw_key[:12]
    row = await _lookup_key(prefix)
    if not row:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid api key")

    try:
        _hasher.verify(row["hash"], raw_key)
    except VerifyMismatchError as exc:
        logger.warning("api_key.hash_mismatch", prefix=prefix)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "invalid api key") from exc

    return ApiKeyContext(
        workspace_id=str(row["workspace_id"]),
        key_id=str(row["id"]),
        prefix=prefix,
    )


def serialize_context(ctx: ApiKeyContext) -> str:
    return json.dumps(
        {"workspace_id": ctx.workspace_id, "key_id": ctx.key_id, "prefix": ctx.prefix}
    )
