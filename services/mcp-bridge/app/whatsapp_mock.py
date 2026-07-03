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
from .dicom_sr import encode_sr
from .pdf_report import build_pdf
from .report import FinalReport
from .share_links import issue_bundle

BASE = Path(__file__).resolve().parent.parent
WA_DIR = Path(os.getenv("MIDCINE_WA_DIR", str(BASE / "data" / "whatsapp")))
WA_DIR.mkdir(parents=True, exist_ok=True)


class WhatsAppAttachment(BaseModel):
    filename: str
    mime_type: str
    size_bytes: int
    kind: str  # "pdf" | "dicom_sr"
    # Base64 payload lives in a side-car file, not in the message log,
    # to keep JSONL compact. Path relative to WA_DIR.
    payload_path: str | None = None


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
    text_body: str | None = None
    attachments: list[WhatsAppAttachment] = Field(default_factory=list)
    share_links: dict[str, str] = Field(default_factory=dict)  # {pdf, viewer, sr} -> URL


class SendReportRequest(BaseModel):
    report: FinalReport
    to_phone: str
    to_name: str
    kind: str = "report_to_doctor"
    attach_pdf: bool = True
    attach_dicom_sr: bool = True
    include_share_links: bool = True
    base_url: str = "https://ame.tail19ddab.ts.net:8445"


def _month_file() -> Path:
    now = datetime.now(UTC)
    return WA_DIR / f"{now.year:04d}-{now.month:02d}.jsonl"


def _persist(msg: WhatsAppMessage) -> None:
    with _month_file().open("a", encoding="utf-8") as f:
        f.write(msg.model_dump_json() + "\n")


def _persist_attachment(message_id: str, filename: str, data: bytes) -> str:
    """Store attachment bytes next to the JSONL, return relative path."""
    att_dir = WA_DIR / "attachments" / message_id
    att_dir.mkdir(parents=True, exist_ok=True)
    path = att_dir / filename
    with path.open("wb") as f:
        f.write(data)
    return str(path.relative_to(WA_DIR))


def _build_text_body(req: SendReportRequest, links: dict[str, str]) -> str:
    """Build the WhatsApp text body — impression + short links + patient tag."""
    lines: list[str] = []
    if req.kind == "report_to_doctor":
        lines.append("📄 تقرير أشعة جديد جاهز للمراجعة")
    else:
        lines.append("📄 تقرير الأشعة الخاص بك")
    lines.append("")
    if req.report.patient_name:
        lines.append(f"المريض: {req.report.patient_name}")
    lines.append(f"الفحص: {req.report.modality} — {req.report.body_part}")
    lines.append("")
    if req.report.impression_ar:
        lines.append("الانطباع:")
        lines.append(req.report.impression_ar[:400])
        lines.append("")
    if links:
        lines.append("🔗 روابط:")
        if "pdf" in links:
            lines.append(f"  التقرير PDF: {links['pdf']}")
        if "viewer" in links:
            lines.append(f"  مشاهد الأشعة: {links['viewer']}")
    lines.append("")
    if req.report.signed_by:
        lines.append(f"الطبيب: {req.report.signed_by}")
    return "\n".join(lines)


def send_report(req: SendReportRequest) -> WhatsAppMessage:
    """Enqueue a report delivery. Attaches PDF + SR + signed links per request."""
    message_id = uuid4().hex
    attachments: list[WhatsAppAttachment] = []

    if req.attach_pdf:
        pdf_bytes = build_pdf(req.report)
        pdf_name = f"report-{req.report.study_uid[-12:]}.pdf"
        pdf_path = _persist_attachment(message_id, pdf_name, pdf_bytes)
        attachments.append(
            WhatsAppAttachment(
                filename=pdf_name,
                mime_type="application/pdf",
                size_bytes=len(pdf_bytes),
                kind="pdf",
                payload_path=pdf_path,
            )
        )

    if req.attach_dicom_sr:
        sr_bytes = encode_sr(req.report)
        sr_name = f"report-{req.report.study_uid[-12:]}.dcm"
        sr_path = _persist_attachment(message_id, sr_name, sr_bytes)
        attachments.append(
            WhatsAppAttachment(
                filename=sr_name,
                mime_type="application/dicom",
                size_bytes=len(sr_bytes),
                kind="dicom_sr",
                payload_path=sr_path,
            )
        )

    share_links: dict[str, str] = {}
    if req.include_share_links:
        recipient_tag = f"{req.kind}:{req.to_phone[-4:]}"
        share_links = issue_bundle(req.report.study_uid, recipient_tag, req.base_url)

    text_body = _build_text_body(req, share_links)

    msg = WhatsAppMessage(
        message_id=message_id,
        hospital_id=req.report.hospital_id,
        study_uid=req.report.study_uid,
        to_phone=req.to_phone,
        to_name=req.to_name,
        kind=req.kind,
        ts=datetime.now(UTC),
        status="delivered",
        impression_ar=req.report.impression_ar[:200] if req.report.impression_ar else None,
        patient_name=req.report.patient_name,
        text_body=text_body,
        attachments=attachments,
        share_links=share_links,
    )
    _persist(msg)
    audit(
        action="whatsapp.send",
        tenant=req.report.hospital_id,
        target={"type": "message", "id": msg.message_id},
        meta={
            "kind": req.kind,
            "study_uid": req.report.study_uid,
            "to_name": req.to_name,
            "attachments": [a.filename for a in attachments],
            "attachment_bytes": sum(a.size_bytes for a in attachments),
            "share_links_count": len(share_links),
        },
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
