"""Redis-backed forecast result cache. 24h TTL by default.

Keyed by (workspace_id, metric, horizon_days, model_kind, fitted_at) so
that a retrained model invalidates its own cache implicitly without us
needing to track a separate version counter.
"""

from __future__ import annotations

import json
from typing import Any

import redis.asyncio as aioredis

from ..settings import get_settings


def _key(workspace_id: str, metric: str, horizon_days: int, model_kind: str, fitted_at: str) -> str:
    return f"forecast:{workspace_id}:{metric}:{model_kind}:{horizon_days}:{fitted_at}"


class ForecastCache:
    def __init__(self) -> None:
        s = get_settings()
        self._redis = aioredis.from_url(s.redis_url, decode_responses=True)
        self._ttl = s.cache_ttl_seconds

    async def get(
        self, workspace_id: str, metric: str, horizon_days: int, model_kind: str, fitted_at: str
    ) -> dict[str, Any] | None:
        raw = await self._redis.get(_key(workspace_id, metric, horizon_days, model_kind, fitted_at))
        if not raw:
            return None
        return json.loads(raw)

    async def set(
        self,
        workspace_id: str,
        metric: str,
        horizon_days: int,
        model_kind: str,
        fitted_at: str,
        payload: dict[str, Any],
    ) -> None:
        await self._redis.set(
            _key(workspace_id, metric, horizon_days, model_kind, fitted_at),
            json.dumps(payload),
            ex=self._ttl,
        )

    async def close(self) -> None:
        await self._redis.aclose()


_cache: ForecastCache | None = None


def get_cache() -> ForecastCache:
    global _cache
    if _cache is None:
        _cache = ForecastCache()
    return _cache


async def close_cache() -> None:
    global _cache
    if _cache is not None:
        await _cache.close()
        _cache = None
