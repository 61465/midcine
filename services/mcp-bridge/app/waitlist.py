"""Simple waitlist store — persists to data/waitlist.json.

No fake data, no fabrication. Just an append-only list of {email, name, ts}.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

from pydantic import BaseModel

BASE = Path(__file__).resolve().parent.parent
WAITLIST_FILE = Path(os.getenv("MIDCINE_WAITLIST_FILE", str(BASE / "data" / "waitlist.json")))
WAITLIST_FILE.parent.mkdir(parents=True, exist_ok=True)


class WaitlistEntry(BaseModel):
    email: str
    name: str = ""
    role: str = ""  # e.g. "Radiologist", "Referring physician"
    country: str = ""
    ts: float = 0.0


def load_all() -> list[WaitlistEntry]:
    if not WAITLIST_FILE.exists():
        return []
    try:
        raw = json.loads(WAITLIST_FILE.read_text(encoding="utf-8"))
        return [WaitlistEntry(**e) for e in raw]
    except (OSError, json.JSONDecodeError, ValueError):
        return []


def add_entry(entry: WaitlistEntry) -> WaitlistEntry:
    entry.ts = time.time()
    items = load_all()
    # Reject duplicates by email
    items = [e for e in items if e.email.lower() != entry.email.lower()]
    items.append(entry)
    WAITLIST_FILE.write_text(
        json.dumps([e.model_dump() for e in items], indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return entry


def count() -> int:
    return len(load_all())
