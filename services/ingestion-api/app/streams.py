from __future__ import annotations

import json
from typing import Any

import redis.asyncio as aioredis

from .config import get_settings

_settings = get_settings()
_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(_settings.redis_url, decode_responses=True)
    return _redis


async def publish(stream: str, payload: dict[str, Any], maxlen: int = 100_000) -> str:
    r = get_redis()
    flat = {k: (v if isinstance(v, str) else json.dumps(v, default=str)) for k, v in payload.items()}
    return await r.xadd(stream, flat, maxlen=maxlen, approximate=True)
