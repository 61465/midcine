"""Ephemeral 'report session' storage.

Used by the New Blank Report → Generate flow. A session bundles:
- Uploaded reference reports (PDF/text/image)
- AI-extracted patient identity + medical history
- AI-composed critical-only report drafted in the style of the references

Persisted as one JSON per session under data/report_sessions/, plus the
uploaded files under data/docs/session__<sid>/ (reusing the existing intake
pipeline so build_dossier() picks them up).
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any

log = logging.getLogger("mcp-bridge.report_sessions")

BASE = Path(__file__).resolve().parent.parent
SESSIONS_DIR = Path(
    os.getenv("MIDCINE_REPORT_SESSIONS_DIR", str(BASE / "data" / "report_sessions"))
)
SESSIONS_DIR.mkdir(parents=True, exist_ok=True)


def new_session_id() -> str:
    """session__<12-char hex>  — safe as a folder name AND matches the
    'session__' prefix used elsewhere so intake helpers accept it."""
    return f"session__{uuid.uuid4().hex[:12]}"


def _path(sid: str) -> Path:
    return SESSIONS_DIR / f"{sid}.json"


def save_session(sid: str, payload: dict[str, Any]) -> None:
    payload = {**payload, "session_id": sid, "saved_at": time.time()}
    _path(sid).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def load_session(sid: str) -> dict | None:
    p = _path(sid)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        log.warning("load_session %s failed: %s", sid, e)
        return None


def list_sessions(limit: int = 50) -> list[dict]:
    out: list[dict] = []
    files = sorted(SESSIONS_DIR.glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    for f in files[:limit]:
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        out.append(
            {
                "session_id": data.get("session_id", f.stem),
                "saved_at": data.get("saved_at"),
                "patient_name": (data.get("patient") or {}).get("name"),
                "source_count": len(data.get("extracted_reports") or []),
                "title": (data.get("critical_report") or {}).get("title"),
            }
        )
    return out


def delete_session(sid: str) -> bool:
    p = _path(sid)
    if p.exists():
        try:
            p.unlink()
            return True
        except Exception as e:
            log.warning("delete_session %s failed: %s", sid, e)
    return False
