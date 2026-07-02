"""Mock WhatsApp delivery for reports.

For demo: writes messages to data/whatsapp/YYYY-MM.jsonl and returns delivery
status. Real Baileys integration lives at services/whatsapp-bridge — this
module will be swapped for a client of that service in Sprint 5.
"""

from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field

from .audit import audit
from .report import FinalReport

BASE = Path(__file__).resolve().parent.parent
WA_DIR = Path(os.getenv("MIDCINE_WA_DIR", str(BASE / "data" / "whatsapp")))
WA_DIR.mkdir(parents=True, exist_ok=True)


class WhatsAppMessage(BaseModel):
    message_id: str
    hospital_id: str
    study_uid: str
    to_phone: str
    to_name: str
    kind: str = Field(description="report_to_doctor | report_to_patient | notification")
    ts: datetime
    status: str = "queued"
    impression_ar: str | None = None
    patient_name: str | None = None


class SendReportRequest(BaseModel):
    report: FinalReport
    to_phone: str
    to_name: str
    kind: str = "report_to_doctor"


def _month_file() -> Path:
    now = datetime.now(UTC)
    return WA_DIR / f"{now.year:04d}-{now.month:02d}.jsonl"


def _persist(msg: WhatsAppMessage) -> None:
    with _month_file().open("a", encoding="utf-8") as f:
        f.write(msg.model_dump_json() + "\n")


def send_report(req: SendReportRequest) -> WhatsAppMessage:
    """Enqueue a report delivery. Marks as 'delivered' immediately for demo."""
    msg = WhatsAppMessage(
        message_id=uuid4().hex,
        hospital_id=req.report.hospital_id,
        study_uid=req.report.study_uid,
        to_phone=req.to_phone,
        to_name=req.to_name,
        kind=req.kind,
        ts=datetime.now(UTC),
        status="delivered",
        impression_ar=req.report.impression_ar[:200] if req.report.impression_ar else None,
        patient_name=req.report.patient_name,
    )
    _persist(msg)
    audit(
        action="whatsapp.send",
        tenant=req.report.hospital_id,
        target={"type": "message", "id": msg.message_id},
        meta={"kind": req.kind, "study_uid": req.report.study_uid, "to_name": req.to_name},
    )
    return msg


def list_messages(hospital_id: str, limit: int = 50) -> list[dict[str, Any]]:
    """Read latest messages from JSONL files, newest first."""
    items: list[dict[str, Any]] = []
    files = sorted(WA_DIR.glob("*.jsonl"), reverse=True)
    for f in files:
        try:
            with f.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        obj = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    if obj.get("hospital_id") == hospital_id:
                        items.append(obj)
        except OSError:
            continue
        if len(items) >= limit * 2:
            break

    items.sort(key=lambda o: o.get("ts", ""), reverse=True)
    return items[:limit]
