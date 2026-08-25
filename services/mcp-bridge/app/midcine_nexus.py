"""midcine ↔ NEXUS bridge.

Instead of duplicating the 46 agent brains from `D:\\project\\suportagent`,
midcine consumes them at runtime. Two integration modes:

1. **In-process** (fast, requires `sys.path` insertion): imports
   `core.runner.run_agent` + `core.unified_brain.think` directly.

2. **Subprocess** (safer, isolates NEXUS deps): shells out to a Python that
   has NEXUS installed. Used when in-process import fails.

Domain adaptation: midcine wraps NEXUS calls with a MEDICAL SPECIALIST layer
that adds radiology-specific system prompt fragments on top of whatever
brain the NEXUS runner returns. This keeps midcine specialized while
consuming NEXUS's model routing + fallback chain + English enforcement.
"""

from __future__ import annotations

import json
import logging
import os
import sys
from pathlib import Path
from typing import Any

log = logging.getLogger("mcp-bridge.nexus")


# ---- Point midcine at NEXUS on the same machine --------------------------

NEXUS_ROOT = Path(os.getenv("MIDCINE_NEXUS_ROOT", r"D:\project\suportagent"))
_NEXUS_IMPORTS_OK: bool | None = None


def _ensure_nexus_imports() -> bool:
    """Insert NEXUS root into sys.path and try to import the runner.
    Cached — only fails/warns once."""
    global _NEXUS_IMPORTS_OK
    if _NEXUS_IMPORTS_OK is not None:
        return _NEXUS_IMPORTS_OK
    try:
        if str(NEXUS_ROOT) not in sys.path:
            sys.path.insert(0, str(NEXUS_ROOT))
        import config.agents  # noqa: F401
        import core.runner  # noqa: F401
        _NEXUS_IMPORTS_OK = True
        log.info("NEXUS imports OK from %s", NEXUS_ROOT)
    except Exception as e:  # noqa: BLE001
        _NEXUS_IMPORTS_OK = False
        log.warning("NEXUS import failed (%s) — bridge disabled, falling back to local Naraya", e)
    return _NEXUS_IMPORTS_OK


# ---- Medical specialization layer ----------------------------------------

# Domain-specific prompt fragments prepended to every midcine → NEXUS call.
MEDICAL_PREAMBLE = (
    "MIDCINE MEDICAL CONTEXT — READ FIRST:\n"
    "You are consulting on a radiology case for midcine (RIS/PACS platform). "
    "The user is a licensed radiologist. Your output feeds a real patient "
    "report. Follow these rules:\n\n"
    "1. LANGUAGE: clinical English ONLY, never Arabic, never any other language.\n"
    "2. ACCURACY: never fabricate findings. If uncertain, mark [UNCERTAIN].\n"
    "3. SAFETY: for critical findings (mass, hemorrhage, PE, dissection, "
    "cauda equina, bowel perf, tension pneumo, etc.) → explicitly flag with "
    "prefix 'CRITICAL:' + recommended immediate action.\n"
    "4. STRUCTURE: match the JSON schema the caller requests. Never emit prose "
    "outside the JSON.\n"
    "5. UNITS: SI + conventional both when relevant (e.g. HbA1c 8.4% [68 mmol/mol]).\n"
    "6. CITE guideline (ACR, ACC/AHA, NCCN, WHO, Fleischner, BI-RADS) by name "
    "when applicable.\n\n"
)


def call_nexus_agent(
    agent_id: str,
    user_prompt: str,
    *,
    add_medical_context: bool = True,
    timeout: float = 60.0,
) -> dict[str, Any]:
    """Run a NEXUS agent by id, with medical specialization applied.

    agent_id: any id from `config.agents.AGENTS` — e.g. "architect",
              "code_reviewer", "algorithm_expert", "guardian", "research_agent".

    Returns:
        {"ok": bool, "text": str, "model": str, "agent": str, "error": str|None}
    """
    if not _ensure_nexus_imports():
        return {
            "ok": False,
            "text": "",
            "model": "",
            "agent": agent_id,
            "error": "NEXUS bridge unavailable — import failed",
        }

    try:
        from config.agents import AGENTS  # type: ignore
        from core.runner import run_agent  # type: ignore
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "text": "", "model": "", "agent": agent_id, "error": str(e)}

    agent = next((a for a in AGENTS if a.get("id") == agent_id), None)
    if not agent:
        return {
            "ok": False,
            "text": "",
            "model": "",
            "agent": agent_id,
            "error": f"unknown agent id: {agent_id}",
        }

    prompt = (MEDICAL_PREAMBLE + user_prompt) if add_medical_context else user_prompt

    try:
        result = run_agent(agent, prompt)
    except Exception as e:  # noqa: BLE001
        return {
            "ok": False,
            "text": "",
            "model": agent.get("model", ""),
            "agent": agent_id,
            "error": f"run_agent failed: {str(e)[:200]}",
        }

    ok = bool(result.get("ok"))
    # NEXUS runner returns key "response" (not "text"/"output")
    text = (
        result.get("response")
        or result.get("output")
        or result.get("text")
        or ""
    )
    return {
        "ok": ok,
        "text": text.strip() if isinstance(text, str) else str(text),
        "model": result.get("model_used") or result.get("model") or agent.get("model", ""),
        "agent": agent_id,
        "error": None if ok else (result.get("error") or text or "unknown"),
    }


def call_unified_brain(
    system_prompt: str,
    user_prompt: str,
    *,
    task_hint: str = "medical",
    add_medical_context: bool = True,
) -> dict[str, Any]:
    """Run the 5-model ensemble (unified brain) for high-stakes calls where
    accuracy matters more than latency. task_hint controls strategy weights.
    """
    if not _ensure_nexus_imports():
        return {"ok": False, "text": "", "error": "NEXUS bridge unavailable"}

    try:
        from core.unified_brain import think  # type: ignore
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "text": "", "error": str(e)}

    prefixed_system = (MEDICAL_PREAMBLE + system_prompt) if add_medical_context else system_prompt

    try:
        text = think(prefixed_system, user_prompt, task_hint=task_hint, verbose=False)
        return {"ok": True, "text": (text or "").strip(), "error": None}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "text": "", "error": str(e)[:200]}


# ---- Medical specialist mapping ------------------------------------------

# Maps midcine "tasks" → best-fit NEXUS agent id. Used by the analyze pipeline
# to route work to the specialist most likely to succeed at that sub-task.
MEDICAL_TASK_MAP: dict[str, str] = {
    # Radiology-specific
    "vision_synthesis": "algorithm_expert",     # image feature interpretation
    "guardian_scan": "guardian",                # safety / red-flag detection
    "differential_dx": "research_agent",        # broad knowledge for DDx
    "report_writing": "content_writer",         # clinical prose polish
    "critical_alert": "guardian",               # STAT triage
    "cite_evidence": "rag_specialist",          # PubMed / guideline retrieval
    # Support tasks
    "code_review": "code_reviewer",
    "architecture": "architect",
    "explain_to_patient": "content_writer",
}


def suggest_agent_for_task(task: str) -> str | None:
    """Look up which NEXUS agent handles a midcine task type."""
    return MEDICAL_TASK_MAP.get(task)


# ---- Health check --------------------------------------------------------


def health() -> dict[str, Any]:
    """Report NEXUS bridge state."""
    ok = _ensure_nexus_imports()
    info: dict[str, Any] = {
        "bridge_ready": ok,
        "nexus_root": str(NEXUS_ROOT),
        "medical_preamble_chars": len(MEDICAL_PREAMBLE),
        "task_map_entries": len(MEDICAL_TASK_MAP),
    }
    if ok:
        try:
            from config.agents import AGENTS  # type: ignore
            info["agents_available"] = len(AGENTS)
        except Exception:
            info["agents_available"] = "unknown"
    return info
