"""Specialist client adapters. Each returns a normalised dict."""
from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pybreaker

from .config import settings
from .logging import get_logger

log = get_logger()

# Circuit breakers per specialist — fail fast after 3 errors, recover after 30s.
_BREAKERS: dict[str, pybreaker.CircuitBreaker] = {}


def _breaker(name: str) -> pybreaker.CircuitBreaker:
    if name not in _BREAKERS:
        _BREAKERS[name] = pybreaker.CircuitBreaker(fail_max=3, reset_timeout=30)
    return _BREAKERS[name]


SPECIALIST_URLS: dict[str, str] = {
    "torchxrayvision": settings.torchxrayvision_url,
    "monai_brain": settings.monai_brain_url,
    "segmentation": settings.segmentation_url,
    "vision_language": settings.vision_language_url,
    "clinical_llm": settings.clinical_llm_url,
}


async def call_specialist(
    client: httpx.AsyncClient, name: str, payload: dict[str, Any]
) -> dict[str, Any]:
    """Call one specialist. Returns {'model': name, 'ok': bool, 'data'|'error': ...}."""
    url = SPECIALIST_URLS.get(name)
    if not url:
        return {"model": name, "ok": False, "error": "unknown_specialist"}

    br = _breaker(name)
    try:
        response = await br.call_async(
            client.post, url, json=payload, timeout=settings.parallel_timeout_sec
        )
        response.raise_for_status()
        return {"model": name, "ok": True, "data": response.json()}
    except (pybreaker.CircuitBreakerError, httpx.HTTPError, asyncio.TimeoutError) as e:
        log.warning("specialist_failed", model=name, error=str(e))
        return {"model": name, "ok": False, "error": str(e)}


async def fan_out(
    client: httpx.AsyncClient, models: list[str], payload: dict[str, Any]
) -> list[dict[str, Any]]:
    """Invoke all specialists in parallel, returning results in order."""
    tasks = [call_specialist(client, m, payload) for m in models]
    return await asyncio.gather(*tasks)
