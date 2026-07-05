"""Call NEXUS agents. Current backend: Naraya (mistral-large) via direct HTTPS.

Later this will be replaced by a NEXUS MCP HTTP shim (Sprint 4).
The pybreaker circuit-breaker per agent isolates flaky agents from healthy ones.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any

import httpx
import pybreaker

from .schemas import AgentOutput

log = logging.getLogger("mcp-bridge.agents")

NARAYA_BASE = os.getenv("NARAYA_BASE", "https://router.bynara.id/v1")
NARAYA_MODEL = os.getenv("NARAYA_MODEL", "mistral-large")

# Per-agent role prompts. Kept short so latency stays low.
AGENT_ROLES: dict[str, str] = {
    "vision_ai": (
        "You are a radiology vision specialist. Given study metadata (modality, body part) "
        "and clinical context, produce ONE JSON object with keys: "
        "summary (string, Arabic, <=200 chars), findings (array of strings), "
        "confidence (float 0-1). NO prose outside JSON."
    ),
    "clinical_llm": (
        "You are a clinical LLM producing a structured Arabic radiology report draft. "
        "Return ONE JSON object with keys: summary (Arabic), impression (Arabic), "
        "recommendations (array of Arabic strings), confidence (float 0-1). "
        "NO prose outside JSON."
    ),
    "guardian": (
        "You are a safety guardian. Check the study description for red flags "
        "(emergency findings, contrast allergy hints, pediatric considerations). "
        "Return ONE JSON: {summary: Arabic, red_flags: array of Arabic strings, confidence: float}. "
        "NO prose outside JSON."
    ),
    "algorithm_expert": (
        "You are an algorithm expert. Score the case for likelihood of acute pathology "
        "requiring interruption of workflow. Return ONE JSON: "
        "{summary: Arabic, urgency_score: float 0-1, rationale: Arabic string, confidence: float}. "
        "NO prose outside JSON."
    ),
}


def _breaker_key(agent: str) -> str:
    return f"agent::{agent}"


_BREAKERS: dict[str, pybreaker.CircuitBreaker] = {}


def get_breaker(agent: str) -> pybreaker.CircuitBreaker:
    key = _breaker_key(agent)
    if key not in _BREAKERS:
        _BREAKERS[key] = pybreaker.CircuitBreaker(fail_max=3, reset_timeout=30)
    return _BREAKERS[key]


def _naraya_key() -> str:
    key = os.getenv("NARAYA_API_KEY") or ""
    if not key:
        raise RuntimeError(
            "NARAYA_API_KEY not set. Get it from `[System.Environment]::GetEnvironmentVariable('NARAYA_API_KEY','User')`"
        )
    return key


def _parse_agent_json(raw: str) -> tuple[dict[str, Any] | None, float | None, str | None]:
    """Try to pull a JSON object + confidence + summary from the agent's raw text."""
    if not raw:
        return None, None, None
    text = raw.strip()
    # Strip fenced code
    if text.startswith("```"):
        parts = text.split("```")
        for p in parts:
            p = p.strip()
            if p.startswith("json"):
                p = p[len("json") :].strip()
            if p.startswith("{"):
                text = p
                break
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        return None, None, text[:200]
    conf_raw = obj.get("confidence")
    conf = float(conf_raw) if isinstance(conf_raw, (int, float)) else None
    summary = obj.get("summary") or obj.get("impression") or ""
    return obj, conf, str(summary)[:400] if summary else None


def _call_naraya_sync(system_prompt: str, user_prompt: str, timeout: float = 45.0) -> str:
    """Sync httpx call — needed because pybreaker.call_async requires tornado (not installed).
    We wrap this in asyncio.to_thread() from the async caller to keep the event loop free.
    Concurrency is preserved because fan_out() gathers threads across agents."""
    body = {
        "model": NARAYA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": 700,
        "temperature": 0.2,
    }
    headers = {
        "Authorization": f"Bearer {_naraya_key()}",
        "Content-Type": "application/json",
    }
    with httpx.Client(timeout=timeout) as client:
        r = client.post(f"{NARAYA_BASE}/chat/completions", json=body, headers=headers)
        r.raise_for_status()
        data = r.json()
    choices = data.get("choices") or []
    if not choices:
        raise RuntimeError(f"Naraya empty choices: {data}")
    return choices[0]["message"]["content"]


async def call_agent(agent: str, user_prompt: str) -> AgentOutput:
    """Call a NEXUS agent via Naraya backend. Wrapped in per-agent circuit breaker.

    Uses `asyncio.to_thread(breaker.call, sync_func)` instead of `breaker.call_async`
    because pybreaker.call_async requires tornado.gen which is not installed
    (and adding tornado just for the coroutine helper is heavy — see the Debugger's
    recommendation logged in Sprint 1)."""
    role = AGENT_ROLES.get(agent)
    if not role:
        return AgentOutput(agent=agent, ok=False, error=f"unknown agent: {agent}", latency_ms=0.0)

    breaker = get_breaker(agent)
    started = time.perf_counter()
    try:
        raw = await asyncio.to_thread(breaker.call, _call_naraya_sync, role, user_prompt)
    except pybreaker.CircuitBreakerError as e:
        latency = (time.perf_counter() - started) * 1000
        return AgentOutput(agent=agent, ok=False, error=f"circuit_open: {e}", latency_ms=latency)
    except (TimeoutError, httpx.HTTPError, RuntimeError) as e:
        latency = (time.perf_counter() - started) * 1000
        log.warning("agent_failed agent=%s error=%s", agent, e)
        return AgentOutput(agent=agent, ok=False, error=str(e), latency_ms=latency)

    latency = (time.perf_counter() - started) * 1000
    obj, conf, summary = _parse_agent_json(raw)
    return AgentOutput(
        agent=agent,
        ok=True,
        data=obj or {"raw": raw[:1000]},
        latency_ms=latency,
        confidence=conf,
        summary=summary,
    )


async def fan_out(agents: list[str], user_prompt: str) -> list[AgentOutput]:
    """Invoke all agents in parallel."""
    if not agents:
        return []
    tasks = [call_agent(a, user_prompt) for a in agents]
    return await asyncio.gather(*tasks)


async def fan_out_stream(agents: list[str], user_prompt: str) -> asyncio.Queue[AgentOutput | None]:
    """Fire all agents in parallel and stream results as each finishes.

    Returns an asyncio.Queue that yields each AgentOutput as it becomes ready,
    then a final `None` sentinel. The caller drives the loop.
    """
    q: asyncio.Queue[AgentOutput | None] = asyncio.Queue()

    async def _run(agent: str) -> None:
        out = await call_agent(agent, user_prompt)
        await q.put(out)

    async def _driver() -> None:
        await asyncio.gather(*(_run(a) for a in agents))
        await q.put(None)  # sentinel

    # Retain a strong reference on the queue itself so the task survives GC.
    task = asyncio.create_task(_driver())
    q._midcine_driver = task  # type: ignore[attr-defined]
    return q


def _health_check_sync() -> bool:
    try:
        with httpx.Client(timeout=10) as client:
            r = client.get(
                f"{NARAYA_BASE}/models",
                headers={"Authorization": f"Bearer {_naraya_key()}"},
            )
        return r.status_code < 500
    except Exception:
        return False


async def health_check() -> bool:
    """Ping Naraya /models to confirm reachability (async wrapper around sync httpx)."""
    return await asyncio.to_thread(_health_check_sync)
