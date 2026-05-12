"""Per-API-key token-bucket rate limit, implemented in Redis.

Uses a Lua script for atomic refill + consume so we don't race between
checking the bucket and decrementing.
"""

from __future__ import annotations

from time import time

import redis.asyncio as aioredis

from .settings import get_settings

_LUA_TOKEN_BUCKET = """
local key       = KEYS[1]
local rate      = tonumber(ARGV[1])     -- tokens per second
local burst     = tonumber(ARGV[2])     -- max bucket size
local cost      = tonumber(ARGV[3])     -- tokens to consume
local now_ms    = tonumber(ARGV[4])     -- current time in ms

local data    = redis.call("HMGET", key, "tokens", "ts")
local tokens  = tonumber(data[1])
local ts_ms   = tonumber(data[2])

if tokens == nil then
    tokens = burst
    ts_ms  = now_ms
end

-- Refill based on elapsed time
local elapsed = math.max(0, now_ms - ts_ms) / 1000.0
tokens = math.min(burst, tokens + elapsed * rate)

local allowed = 0
if tokens >= cost then
    tokens = tokens - cost
    allowed = 1
end

redis.call("HSET", key, "tokens", tokens, "ts", now_ms)
-- Expire so cold keys don't pile up forever
redis.call("PEXPIRE", key, math.ceil((burst / rate) * 1000) + 60000)

return {allowed, tostring(tokens)}
"""


class RateLimiter:
    def __init__(self) -> None:
        settings = get_settings()
        self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        self._rate = settings.rate_limit_rps
        self._burst = settings.rate_limit_burst
        self._script = self._redis.register_script(_LUA_TOKEN_BUCKET)

    async def consume(self, identity: str, cost: int = 1) -> tuple[bool, float]:
        """Return (allowed, tokens_remaining)."""
        now_ms = int(time() * 1000)
        key = f"rl:ingest:{identity}"
        allowed, tokens = await self._script(
            keys=[key],
            args=[self._rate, self._burst, cost, now_ms],
        )
        return bool(int(allowed)), float(tokens)

    async def close(self) -> None:
        await self._redis.aclose()


_limiter: RateLimiter | None = None


def get_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        _limiter = RateLimiter()
    return _limiter


async def close_limiter() -> None:
    global _limiter
    if _limiter is not None:
        await _limiter.close()
        _limiter = None
