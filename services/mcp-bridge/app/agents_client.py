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
# Bynara catalogue 2026-07-06 with current free tier:
#   FREE: mistral-large, mistral-medium-3-5, kimi-k2.7-code-free
#   PAID (requires upgrade): claude-opus-4.7/4.8, claude-sonnet-5, gpt-5.4/5.5, glm-*,
#         deepseek-v4-*, mimo-v2.5-*, qwen3.7-max, minimax-m3
# We use mistral-medium-3-5 (newer, better quality) with mistral-large as fallback.
# Set NARAYA_MODEL_* env vars to override per-task once the plan is upgraded.
NARAYA_MODEL = os.getenv("NARAYA_MODEL", "mistral-medium-3-5")
NARAYA_MODEL_IMPRESSION = os.getenv("NARAYA_MODEL_IMPRESSION", "mistral-medium-3-5")
NARAYA_MODEL_CRITICAL = os.getenv("NARAYA_MODEL_CRITICAL", "mistral-medium-3-5")
NARAYA_MODEL_COMPARE = os.getenv("NARAYA_MODEL_COMPARE", "mistral-medium-3-5")

# Per-agent role prompts. English only. Kept short so latency stays low.
_LANG_LOCK = (
    "LANGUAGE LOCK: Respond in clinical English ONLY. Never write Arabic or any "
    "other language. If input contains Arabic, understand it internally and "
    "reply in native clinical English. "
)
AGENT_ROLES: dict[str, str] = {
    "vision_ai": (
        _LANG_LOCK
        + "You are a radiology vision specialist. Given study metadata (modality, body part) "
        "and clinical context, produce ONE JSON object with keys: "
        "summary (clinical English, <=200 chars), findings (array of English strings), "
        "confidence (float 0-1). NO prose outside JSON. NO Arabic characters."
    ),
    "clinical_llm": (
        _LANG_LOCK
        + "You are a clinical LLM producing a structured English radiology report draft. "
        "Return ONE JSON object with keys: summary (English), impression (English), "
        "recommendations (array of English strings), confidence (float 0-1). "
        "NO prose outside JSON. NO Arabic characters."
    ),
    "guardian": (
        _LANG_LOCK
        + "You are a safety guardian. Check the study description for red flags "
        "(emergency findings, contrast allergy hints, pediatric considerations). "
        "Return ONE JSON: {summary: English, red_flags: array of English strings, confidence: float}. "
        "NO prose outside JSON. NO Arabic characters."
    ),
    "algorithm_expert": (
        _LANG_LOCK
        + "You are an algorithm expert. Score the case for likelihood of acute pathology "
        "requiring interruption of workflow. Return ONE JSON: "
        "{summary: English, urgency_score: float 0-1, rationale: English string, confidence: float}. "
        "NO prose outside JSON. NO Arabic characters."
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


OLLAMA_URL = os.getenv("OLLAMA_URL", "")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")


def _call_ollama_sync(system_prompt: str, user_prompt: str, timeout: float = 60.0) -> str:
    """Local LLM fallback via Ollama /api/chat. Only used when OLLAMA_URL is set
    AND Naraya has failed (permanent error or missing key)."""
    body = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
        "options": {"temperature": 0.2},
    }
    with httpx.Client(timeout=timeout) as client:
        r = client.post(f"{OLLAMA_URL.rstrip('/')}/api/chat", json=body)
        r.raise_for_status()
        data = r.json()
    msg = data.get("message") or {}
    text = msg.get("content", "")
    if not text:
        raise RuntimeError(f"Ollama empty message: {data}")
    return text


_GLOBAL_ENGLISH_PREAMBLE = (
    "You must respond in clinical English ONLY. Never write Arabic or any "
    "other language in your response — even if the user's input contains "
    "Arabic. Understand Arabic input internally, but always reply in native "
    "clinical English.\n\n"
)


def _call_naraya_sync(
    system_prompt: str,
    user_prompt: str,
    timeout: float = 45.0,
    model: str | None = None,
    max_tokens: int = 700,
    temperature: float = 0.2,
) -> str:
    """Sync httpx call — needed because pybreaker.call_async requires tornado (not installed).
    We wrap this in asyncio.to_thread() from the async caller to keep the event loop free.
    Concurrency is preserved because fan_out() gathers threads across agents.

    `model` overrides the default NARAYA_MODEL — used by high-stakes endpoints
    (Impression, Critical Alert, Compare) to pick claude-opus-4.7 / claude-sonnet-5.

    English enforcement: prepends a strong preamble unless the system prompt
    already contains "translate" or "Arabic" (the translate endpoint needs
    those to work).
    """
    sys_prompt = system_prompt
    lower = system_prompt.lower()
    if "translate" not in lower and "arabic" not in lower and "modern standard" not in lower:
        sys_prompt = _GLOBAL_ENGLISH_PREAMBLE + system_prompt
    body = {
        "model": model or NARAYA_MODEL,
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    headers = {
        "Authorization": f"Bearer {_naraya_key()}",
        "Content-Type": "application/json",
    }
    # Retry loop for transient 429 (per-minute rate limit) and 5xx errors.
    # Free-tier Naraya frequently 429s under bursty load (case-story + generate-
    # final-report both call within seconds). Honor Retry-After when present,
    # otherwise use exponential backoff. Cap total attempts to keep worst-case
    # latency bounded.
    MAX_ATTEMPTS = 4
    BACKOFF = [1.5, 3.0, 6.0]  # seconds between attempts
    last_err: Exception | None = None
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            with httpx.Client(timeout=timeout) as client:
                r = client.post(f"{NARAYA_BASE}/chat/completions", json=body, headers=headers)
            # Retryable status codes
            if r.status_code in (429, 502, 503, 504):
                if attempt < MAX_ATTEMPTS:
                    wait_s = BACKOFF[attempt - 1]
                    retry_after = r.headers.get("retry-after", "")
                    try:
                        ra = float(retry_after)
                        wait_s = min(30.0, max(wait_s, ra))
                    except (TypeError, ValueError):
                        pass
                    log.warning(
                        "Naraya %s (attempt %d/%d) — sleeping %.1fs then retrying",
                        r.status_code, attempt, MAX_ATTEMPTS, wait_s,
                    )
                    time.sleep(wait_s)
                    continue
                # Final attempt failed — raise a clean error
                r.raise_for_status()
            r.raise_for_status()
            data = r.json()
            choices = data.get("choices") or []
            if not choices:
                raise RuntimeError(f"Naraya empty choices: {data}")
            return choices[0]["message"]["content"]
        except httpx.HTTPError as e:
            last_err = e
            # Non-status HTTPErrors (timeouts, connection reset): retry too
            if attempt < MAX_ATTEMPTS and not isinstance(e, httpx.HTTPStatusError):
                wait_s = BACKOFF[attempt - 1]
                log.warning(
                    "Naraya HTTPError (attempt %d/%d): %s — sleeping %.1fs",
                    attempt, MAX_ATTEMPTS, str(e)[:120], wait_s,
                )
                time.sleep(wait_s)
                continue
            break
        except RuntimeError as e:
            last_err = e
            break

    # All retries exhausted — try Ollama fallback if configured, else raise
    if OLLAMA_URL:
        log.warning("Naraya exhausted (%s), trying Ollama fallback", last_err)
        return _call_ollama_sync(system_prompt, user_prompt, timeout)
    raise last_err or RuntimeError("Naraya call failed with no captured error")


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
