"""Persistent store for signed reports so share links can retrieve them.

On sign, the FinalReport is written to `data/reports/{study_uid}.json`.
Share-link handlers read it back to render PDF / SR / viewer data.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from .report import FinalReport

log = logging.getLogger("reports-store")

BASE = Path(__file__).resolve().parent.parent
REPORTS_DIR = Path(os.getenv("MIDCINE_REPORTS_DIR", str(BASE / "data" / "reports")))
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def _safe_filename(study_uid: str) -> str:
    """Turn a study_uid into a safe filename (no slashes / colons / spaces)."""
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in study_uid)[:200]


def save_report(report: FinalReport) -> Path:
    """Write the report to reports/{study_uid}.json (atomic via tmp+rename)."""
    filename = _safe_filename(report.study_uid) + ".json"
    target = REPORTS_DIR / filename
    tmp = target.with_suffix(".tmp")
    data = report.model_dump_json(indent=2)
    with tmp.open("w", encoding="utf-8") as f:
        f.write(data)
    tmp.replace(target)
    log.info("reports: saved %s (%d bytes)", target.name, len(data.encode("utf-8")))
    return target


def load_report(study_uid: str) -> FinalReport | None:
    """Load a persisted report by study_uid, or None if not found."""
    filename = _safe_filename(study_uid) + ".json"
    target = REPORTS_DIR / filename
    if not target.exists():
        return None
    try:
        raw = json.loads(target.read_text(encoding="utf-8"))
        return FinalReport.model_validate(raw)
    except (OSError, json.JSONDecodeError, ValueError) as e:
        log.warning("reports: could not load %s: %s", target.name, e)
        return None
