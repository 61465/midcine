"""Immutable audit log — JSONL append-only, monthly rotation.

Borrowed from D:\\project\\thawani-v2\\src\\audit-log.js and translated to Python.
Ported patterns:
  - Monthly-rotated JSONL files: audit/YYYY-MM.jsonl
  - actor/action/target schema (compliant with midcine RIS/PACS audit requirements)
  - retention cleanup
  - PHI-safe: PII fields are hashed/redacted BEFORE reaching this layer (caller responsibility)

Every mcp-bridge action that touches a study is logged. Aligns with:
  - HIPAA §164.312(b) audit controls
  - Sprint 4 "audit WORM" gate in [[project-midcine-plan-v3]]
"""

from __future__ import annotations

import json
import os
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

BASE = Path(__file__).resolve().parent.parent
AUDIT_DIR = Path(os.getenv("MIDCINE_AUDIT_DIR", str(BASE / "data" / "audit")))
AUDIT_DIR.mkdir(parents=True, exist_ok=True)

# Field names whose values must be redacted before writing (PHI-safe defensive)
_REDACT_KEYS = re.compile(
    r"password|token|apikey|api_key|secret|authorization|cookie|bearer",
    re.IGNORECASE,
)


def _redact(obj: Any) -> Any:
    """Best-effort scrub of secret-looking fields — cheap, sync, doesn't mutate original."""
    if isinstance(obj, dict):
        return {
            k: ("***REDACTED***" if _REDACT_KEYS.search(k) else _redact(v)) for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_redact(x) for x in obj]
    return obj


def _current_file() -> Path:
    now = datetime.now(UTC)
    return AUDIT_DIR / f"{now.year:04d}-{now.month:02d}.jsonl"


def audit(
    *,
    action: str,
    actor: dict[str, str] | None = None,
    target: dict[str, str] | None = None,
    tenant: str | None = None,
    ok: bool = True,
    trace_id: str | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    """Append one audit line. Never raises — audit failures must not break the request path."""
    try:
        line = {
            "ts": datetime.now(UTC).isoformat(),
            "tenant": tenant or "default",
            "trace_id": trace_id,
            "actor": actor or {"type": "system"},
            "action": action,
            "target": target,
            "ok": ok,
            "meta": _redact(meta) if meta else None,
        }
        with _current_file().open("a", encoding="utf-8") as f:
            f.write(json.dumps(line, ensure_ascii=False) + "\n")
    except Exception as e:
        # Best-effort stderr, no logger dependency
        print(f"[audit] write failed: {e}", flush=True)


def read_month(
    year_month: str,
    *,
    action_prefix: str | None = None,
    failed_only: bool = False,
    limit: int | None = None,
) -> list[dict]:
    """Read one month's audit lines with optional filtering."""
    f = AUDIT_DIR / f"{year_month}.jsonl"
    if not f.exists():
        return []
    entries: list[dict] = []
    with f.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    if action_prefix:
        entries = [e for e in entries if e.get("action", "").startswith(action_prefix)]
    if failed_only:
        entries = [e for e in entries if e.get("ok") is False]
    if limit is not None:
        entries = entries[-limit:]
    return entries


def cleanup(retention_months: int = 12) -> list[str]:
    """Delete audit files older than retention. Returns removed months."""
    now = datetime.now(UTC)
    # subtract months by manipulating year/month directly
    y, m = now.year, now.month - retention_months
    while m <= 0:
        m += 12
        y -= 1
    cutoff = f"{y:04d}-{m:02d}"
    removed: list[str] = []
    for p in AUDIT_DIR.glob("*.jsonl"):
        if p.stem < cutoff:
            p.unlink()
            removed.append(p.stem)
    return removed
