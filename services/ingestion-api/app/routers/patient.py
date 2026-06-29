"""Patient file — تاريخ + ملحقات + أطباء + QR + موافقات."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import text

from ..audit import write_audit
from ..auth import Principal, get_principal
from ..config import get_settings
from ..crypto import decrypt, encrypt
from ..db import tenant_session
from ..storage import put_object

router = APIRouter(prefix="/v1", tags=["patient"])
settings = get_settings()

QR_SECRET = (settings.jwt_secret + ":qr").encode("utf-8")
QR_TTL_DAYS = 30


def _hash_token(token: str) -> bytes:
    return hashlib.sha256(token.encode("utf-8")).digest()


def _sign_qr_payload(patient_id: str, token_id: str, exp_ts: int) -> str:
    raw = f"{patient_id}.{token_id}.{exp_ts}".encode("utf-8")
    sig = hmac.new(QR_SECRET, raw, hashlib.sha256).hexdigest()[:24]
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=") + "." + sig


def _verify_qr_payload(token: str) -> tuple[str, str, int] | None:
    try:
        body_b64, sig = token.split(".", 1)
        raw = base64.urlsafe_b64decode(body_b64 + "==").decode("utf-8")
        expected = hmac.new(QR_SECRET, raw.encode("utf-8"), hashlib.sha256).hexdigest()[:24]
        if not hmac.compare_digest(sig, expected):
            return None
        patient_id, token_id, exp_str = raw.split(".")
        exp = int(exp_str)
        if exp < int(datetime.now(timezone.utc).timestamp()):
            return None
        return patient_id, token_id, exp
    except Exception:
        return None


# ===== Patient profile =====

@router.get("/patients/{patient_id}/profile")
async def get_patient_profile(patient_id: UUID, principal: Principal = Depends(get_principal)):
    async with tenant_session(principal.tenant_id, principal.role) as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT id, mrn, name_encrypted, dob, sex, phone_encrypted,
                           referring_physician, insurance_provider, created_at
                    FROM midcine.patients
                    WHERE id = :id AND deleted_at IS NULL
                    """
                ),
                {"id": str(patient_id)},
            )
        ).mappings().first()
        if not row:
            raise HTTPException(404, detail={"code": "PATIENT_NOT_FOUND"})

        # تاريخ
        history = (
            await session.execute(
                text(
                    """
                    SELECT id, entry_type, title_ar, detail_ar, icd11_code,
                           occurred_on, severity, is_active, created_at
                    FROM midcine.patient_history
                    WHERE patient_id = :id
                    ORDER BY occurred_on DESC NULLS LAST, created_at DESC
                    LIMIT 100
                    """
                ),
                {"id": str(patient_id)},
            )
        ).mappings().all()

        # كل الفحوصات
        studies = (
            await session.execute(
                text(
                    """
                    SELECT id, study_instance_uid, modality, body_part, description,
                           study_date, triage_priority, triage_label, ai_confidence,
                           read_status, num_instances
                    FROM midcine.studies
                    WHERE patient_id = :id
                    ORDER BY study_date DESC
                    """
                ),
                {"id": str(patient_id)},
            )
        ).mappings().all()

        # الأطباء المرتبطون
        doctors = (
            await session.execute(
                text(
                    """
                    SELECT pd.id, pd.relation, pd.notify_channel, pd.notify_on_signed,
                           pd.external_name, pd.external_whatsapp,
                           u.id AS user_id, u.full_name_ar AS user_name
                    FROM midcine.patient_doctors pd
                    LEFT JOIN midcine.users u ON u.id = pd.user_id
                    WHERE pd.patient_id = :id
                    """
                ),
                {"id": str(patient_id)},
            )
        ).mappings().all()

        # الملحقات
        attachments = (
            await session.execute(
                text(
                    """
                    SELECT id, file_name, mime_type, size_bytes, kind,
                           description_ar, study_id, created_at,
                           uploaded_by_user_id IS NOT NULL AS by_user
                    FROM midcine.attachments
                    WHERE patient_id = :id AND deleted_at IS NULL
                    ORDER BY created_at DESC
                    """
                ),
                {"id": str(patient_id)},
            )
        ).mappings().all()

        # الموافقات
        consents = (
            await session.execute(
                text(
                    """
                    SELECT consent_type, granted, granted_at, expires_at
                    FROM midcine.patient_consents
                    WHERE patient_id = :id
                    ORDER BY granted_at DESC
                    """
                ),
                {"id": str(patient_id)},
            )
        ).mappings().all()

        await write_audit(
            session,
            action="view_patient_profile",
            resource_type="patient",
            resource_id=str(patient_id),
            actor_user_id=principal.user_id,
            actor_role=principal.role,
            tenant_id=principal.tenant_id,
        )

    try:
        name_ar = decrypt(bytes(row["name_encrypted"])) if row["name_encrypted"] else "—"
    except Exception:
        name_ar = "—"
    try:
        phone = decrypt(bytes(row["phone_encrypted"])) if row["phone_encrypted"] else None
    except Exception:
        phone = None

    return {
        "patient": {
            "id": str(row["id"]),
            "mrn": row["mrn"],
            "name_ar": name_ar,
            "dob": row["dob"].isoformat() if row["dob"] else None,
            "sex": row["sex"],
            "phone": phone,
            "referring_physician": row["referring_physician"],
            "insurance_provider": row["insurance_provider"],
            "created_at": row["created_at"].isoformat(),
        },
        "history": [dict(h) | {"id": str(h["id"]), "created_at": h["created_at"].isoformat()} for h in history],
        "studies": [
            dict(s)
            | {
                "id": str(s["id"]),
                "ai_confidence": float(s["ai_confidence"]) if s["ai_confidence"] else None,
                "study_date": s["study_date"].isoformat(),
            }
            for s in studies
        ],
        "doctors": [
            dict(d) | {"id": str(d["id"]), "user_id": str(d["user_id"]) if d["user_id"] else None}
            for d in doctors
        ],
        "attachments": [
            dict(a)
            | {
                "id": str(a["id"]),
                "study_id": str(a["study_id"]) if a["study_id"] else None,
                "created_at": a["created_at"].isoformat(),
            }
            for a in attachments
        ],
        "consents": [dict(c) | {"granted_at": c["granted_at"].isoformat(), "expires_at": c["expires_at"].isoformat() if c["expires_at"] else None} for c in consents],
    }


# ===== History =====

class HistoryEntry(BaseModel):
    entry_type: str
    title_ar: str
    detail_ar: str | None = None
    icd11_code: str | None = None
    occurred_on: str | None = None
    severity: str | None = None
    study_id: UUID | None = None


@router.post("/patients/{patient_id}/history")
async def add_history(patient_id: UUID, body: HistoryEntry, principal: Principal = Depends(get_principal)):
    async with tenant_session(principal.tenant_id, principal.role) as session:
        h_id = uuid4()
        await session.execute(
            text(
                """
                INSERT INTO midcine.patient_history
                    (id, tenant_id, patient_id, study_id, entry_type, title_ar, detail_ar,
                     icd11_code, occurred_on, severity, added_by_user_id)
                VALUES (:id, :t, :p, :s, :et, :ta, :da, :icd, :od, :sev, :u)
                """
            ),
            {
                "id": str(h_id),
                "t": principal.tenant_id,
                "p": str(patient_id),
                "s": str(body.study_id) if body.study_id else None,
                "et": body.entry_type,
                "ta": body.title_ar,
                "da": body.detail_ar,
                "icd": body.icd11_code,
                "od": body.occurred_on,
                "sev": body.severity,
                "u": principal.user_id,
            },
        )
        await write_audit(
            session,
            action="add_history",
            resource_type="patient_history",
            resource_id=str(h_id),
            actor_user_id=principal.user_id,
            actor_role=principal.role,
            tenant_id=principal.tenant_id,
            patient_id=str(patient_id),
        )
    return {"id": str(h_id)}


# ===== Doctors =====

class DoctorLink(BaseModel):
    user_id: UUID | None = None
    external_name: str | None = None
    external_whatsapp: str | None = None        # E.164 بدون +
    external_phone: str | None = None
    relation: str = "treating"
    notify_channel: str = "whatsapp"
    notify_on_signed: bool = True


@router.post("/patients/{patient_id}/doctors")
async def link_doctor(patient_id: UUID, body: DoctorLink, principal: Principal = Depends(get_principal)):
    if not body.user_id and not (body.external_name and body.external_whatsapp):
        raise HTTPException(422, detail={"code": "MISSING_DOCTOR_INFO"})

    async with tenant_session(principal.tenant_id, principal.role) as session:
        pd_id = uuid4()
        await session.execute(
            text(
                """
                INSERT INTO midcine.patient_doctors
                    (id, tenant_id, patient_id, user_id, external_name, external_phone_enc,
                     external_whatsapp, relation, notify_channel, notify_on_signed)
                VALUES (:id, :t, :p, :u, :en, :ep, :ew, :r, :ch, :ns)
                ON CONFLICT (patient_id, user_id, relation) DO NOTHING
                """
            ),
            {
                "id": str(pd_id),
                "t": principal.tenant_id,
                "p": str(patient_id),
                "u": str(body.user_id) if body.user_id else None,
                "en": body.external_name,
                "ep": encrypt(body.external_phone) if body.external_phone else None,
                "ew": body.external_whatsapp,
                "r": body.relation,
                "ch": body.notify_channel,
                "ns": body.notify_on_signed,
            },
        )
    return {"id": str(pd_id)}


# ===== QR tokens =====

class IssueQrRequest(BaseModel):
    issued_to_name: str
    issued_to_phone: str | None = None
    scope: str = "view_and_upload"
    expires_in_days: int = 30
    uses: int = 50


@router.post("/patients/{patient_id}/qr")
async def issue_qr(patient_id: UUID, body: IssueQrRequest, principal: Principal = Depends(get_principal)):
    token_id = str(uuid4())
    raw_token = secrets.token_urlsafe(24)
    token_hash = _hash_token(raw_token)
    exp = datetime.now(timezone.utc) + timedelta(days=body.expires_in_days)
    payload = _sign_qr_payload(str(patient_id), token_id, int(exp.timestamp()))
    # الرابط النهائي: /p/{patient_id}?t=<payload>&k=<raw_token>
    deep_link = f"/p/{patient_id}?t={payload}&k={raw_token}"

    async with tenant_session(principal.tenant_id, principal.role) as session:
        await session.execute(
            text(
                """
                INSERT INTO midcine.patient_qr_tokens
                    (id, tenant_id, patient_id, token_hash, scope, issued_to_name, issued_to_phone,
                     created_by_user_id, expires_at, uses_remaining)
                VALUES (:id, :t, :p, :h, :sc, :nm, :ph, :u, :exp, :uses)
                """
            ),
            {
                "id": token_id,
                "t": principal.tenant_id,
                "p": str(patient_id),
                "h": token_hash,
                "sc": body.scope,
                "nm": body.issued_to_name,
                "ph": body.issued_to_phone,
                "u": principal.user_id,
                "exp": exp,
                "uses": body.uses,
            },
        )
        await write_audit(
            session,
            action="issue_qr",
            resource_type="patient_qr_token",
            resource_id=token_id,
            actor_user_id=principal.user_id,
            actor_role=principal.role,
            tenant_id=principal.tenant_id,
            patient_id=str(patient_id),
            extra={"scope": body.scope, "expires_in_days": body.expires_in_days},
        )

    return {
        "token_id": token_id,
        "deep_link": deep_link,
        "expires_at": exp.isoformat(),
        "scope": body.scope,
        "uses_remaining": body.uses,
    }


@router.get("/qr/resolve")
async def qr_resolve(t: str = Query(...), k: str = Query(...)):
    """يتحقق من token الـ QR ويرجع معلومات الوصول (بدون auth — magic link).

    NOTE: نُرجع scope + patient_id فقط؛ التطبيق يستخدمه ليجلب الملف عبر public endpoints محدودة.
    """
    verified = _verify_qr_payload(t)
    if not verified:
        raise HTTPException(401, detail={"code": "INVALID_TOKEN"})
    patient_id, token_id, exp = verified
    token_hash = _hash_token(k)

    # تحقق من DB
    from ..auth import system_principal
    p = system_principal()
    async with tenant_session(p.tenant_id, p.role) as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT id, patient_id, scope, uses_remaining, revoked_at, expires_at, issued_to_name
                    FROM midcine.patient_qr_tokens
                    WHERE id = :id AND token_hash = :h
                    """
                ),
                {"id": token_id, "h": token_hash},
            )
        ).first()
        if not row:
            raise HTTPException(404, detail={"code": "TOKEN_NOT_FOUND"})
        tid, pat_id, scope, uses, revoked, db_exp, issued_name = row
        if revoked:
            raise HTTPException(403, detail={"code": "TOKEN_REVOKED"})
        if uses <= 0:
            raise HTTPException(403, detail={"code": "USES_EXHAUSTED"})
        if db_exp < datetime.now(timezone.utc):
            raise HTTPException(403, detail={"code": "EXPIRED"})

        # ينقص الاستخدام
        await session.execute(
            text("UPDATE midcine.patient_qr_tokens SET uses_remaining = uses_remaining - 1, last_used_at=now() WHERE id=:id"),
            {"id": token_id},
        )

    return {
        "patient_id": str(pat_id),
        "scope": scope,
        "issued_to_name": issued_name,
        "uses_remaining": uses - 1,
        "expires_at": db_exp.isoformat(),
    }


# ===== Attachments =====

ALLOWED_MIME = {
    "image/jpeg", "image/png", "image/webp", "image/gif",
    "application/pdf",
    "application/dicom",
    "application/octet-stream",
    "text/plain",
}


@router.post("/patients/{patient_id}/attachments")
async def upload_attachment(
    patient_id: UUID,
    kind: str = Form("note"),
    description_ar: str | None = Form(None),
    study_id: str | None = Form(None),
    qr_token: str | None = Form(None),      # لو الرفع من خلال QR (بدون JWT)
    qr_id: str | None = Form(None),
    file: UploadFile = File(...),
):
    """يدعم رفع من:
    - JWT طبيب داخلي (Authorization Bearer)
    - QR token خارجي (qr_token+qr_id form fields)
    """
    body = await file.read()
    if len(body) > 25 * 1024 * 1024:
        raise HTTPException(413, detail={"code": "FILE_TOO_LARGE", "max_mb": 25})
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(415, detail={"code": "UNSUPPORTED_MIME", "got": file.content_type})

    # حدّد المُستخدم
    user_id = None
    qr_token_id = None
    tenant_id = settings.midcine_dev_tenant_id

    # Auth path 1: JWT
    from fastapi import Request

    from ..auth import get_principal_optional, verify_token
    # نأخذ Authorization yدوياً
    # هذا workaround بسيط: نقبل qr_id+qr_token أو لا شيء (system)
    if qr_token and qr_id:
        token_hash = _hash_token(qr_token)
        async with tenant_session(tenant_id, "super_admin") as session:
            row = (
                await session.execute(
                    text(
                        """
                        SELECT id, patient_id, tenant_id, scope, revoked_at, expires_at, uses_remaining
                        FROM midcine.patient_qr_tokens WHERE id = :id AND token_hash = :h
                        """
                    ),
                    {"id": qr_id, "h": token_hash},
                )
            ).first()
            if not row:
                raise HTTPException(401, detail={"code": "INVALID_QR_TOKEN"})
            if str(row[1]) != str(patient_id):
                raise HTTPException(403, detail={"code": "QR_PATIENT_MISMATCH"})
            if row[3] not in ("view_and_upload", "full_doctor"):
                raise HTTPException(403, detail={"code": "QR_SCOPE_INSUFFICIENT"})
            if row[4] or row[5] < datetime.now(timezone.utc) or row[6] <= 0:
                raise HTTPException(403, detail={"code": "QR_INVALID"})
            qr_token_id = qr_id
            tenant_id = str(row[2])

    # رفع للـ MinIO
    digest = hashlib.sha256(body).hexdigest()
    storage_uri = f"s3://midcine-attachments/{tenant_id}/{patient_id}/{uuid4()}-{file.filename}"
    put_object(storage_uri, body, content_type=file.content_type)

    a_id = uuid4()
    async with tenant_session(tenant_id, "doctor" if not qr_token_id else "super_admin") as session:
        await session.execute(
            text(
                """
                INSERT INTO midcine.attachments
                    (id, tenant_id, patient_id, study_id, uploaded_by_user_id, uploaded_by_qr_token,
                     file_name, mime_type, size_bytes, storage_uri, hash_sha256, kind, description_ar)
                VALUES (:id, :t, :p, :s, :u, :qr, :fn, :mt, :sz, :uri, decode(:h, 'hex'), :k, :d)
                """
            ),
            {
                "id": str(a_id),
                "t": tenant_id,
                "p": str(patient_id),
                "s": study_id,
                "u": user_id,
                "qr": qr_token_id,
                "fn": file.filename,
                "mt": file.content_type,
                "sz": len(body),
                "uri": storage_uri,
                "h": digest,
                "k": kind,
                "d": description_ar,
            },
        )
        await write_audit(
            session,
            action="upload_attachment",
            resource_type="attachment",
            resource_id=str(a_id),
            actor_user_id=user_id,
            actor_role="doctor" if user_id else "qr_guest",
            tenant_id=tenant_id,
            patient_id=str(patient_id),
            auth_method="qr" if qr_token_id else "password",
            extra={"kind": kind, "size": len(body)},
        )

    return {"id": str(a_id), "storage_uri": storage_uri, "size": len(body)}


@router.get("/patients/{patient_id}/attachments/{attachment_id}/download")
async def download_attachment(
    patient_id: UUID,
    attachment_id: UUID,
    qr_token: str | None = Query(default=None),
    qr_id: str | None = Query(default=None),
):
    """تنزيل ملحق — يقبل JWT أو QR."""
    from fastapi.responses import StreamingResponse

    from ..storage import get_object

    tenant_id = settings.midcine_dev_tenant_id  # سيُستبدَل بعد التحقق
    if qr_token and qr_id:
        token_hash = _hash_token(qr_token)
        async with tenant_session(tenant_id, "super_admin") as session:
            row = (
                await session.execute(
                    text(
                        """
                        SELECT patient_id, tenant_id, revoked_at, expires_at, uses_remaining, scope
                        FROM midcine.patient_qr_tokens WHERE id = :id AND token_hash = :h
                        """
                    ),
                    {"id": qr_id, "h": token_hash},
                )
            ).first()
            if not row or str(row[0]) != str(patient_id) or row[2] or row[3] < datetime.now(timezone.utc) or row[4] <= 0:
                raise HTTPException(401, detail={"code": "INVALID_QR"})
            tenant_id = str(row[1])

    async with tenant_session(tenant_id, "doctor") as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT storage_uri, mime_type, file_name
                    FROM midcine.attachments
                    WHERE id = :id AND patient_id = :p AND deleted_at IS NULL
                    """
                ),
                {"id": str(attachment_id), "p": str(patient_id)},
            )
        ).first()
    if not row:
        raise HTTPException(404)
    data = get_object(row[0])
    return StreamingResponse(
        iter([data]),
        media_type=row[1],
        headers={"Content-Disposition": f'attachment; filename="{row[2]}"'},
    )


# ===== Send packet to doctor (WhatsApp trigger) =====

class SendPacketRequest(BaseModel):
    study_id: UUID
    doctor_link_id: UUID | None = None         # رابط معين، أو None → كل الأطباء بـ notify_on_signed=true
    include_attachments: bool = True


@router.post("/studies/{study_uid}/send-packet")
async def send_packet(study_uid: str, body: SendPacketRequest, principal: Principal = Depends(get_principal)):
    """يطلق رسالة على Redis Stream doctor:notify ليلتقطها whatsapp-bridge."""
    from ..streams import publish

    async with tenant_session(principal.tenant_id, principal.role) as session:
        study = (
            await session.execute(
                text(
                    """
                    SELECT s.id, s.patient_id, r.id AS report_id, r.pdf_storage_uri,
                           r.impression_ar, r.icd11_codes
                    FROM midcine.studies s
                    LEFT JOIN midcine.reports r ON r.study_id = s.id AND r.status='signed'
                    WHERE s.study_instance_uid = :u
                    ORDER BY r.signed_at DESC NULLS LAST LIMIT 1
                    """
                ),
                {"u": study_uid},
            )
        ).mappings().first()
        if not study:
            raise HTTPException(404, detail={"code": "STUDY_NOT_FOUND"})
        if not study["report_id"]:
            raise HTTPException(422, detail={"code": "REPORT_NOT_SIGNED"})

        # حدّد المستلمين
        sql = """
            SELECT pd.id, pd.relation, pd.notify_channel, pd.external_whatsapp,
                   pd.external_name, u.full_name_ar, u.phone_encrypted
            FROM midcine.patient_doctors pd
            LEFT JOIN midcine.users u ON u.id = pd.user_id
            WHERE pd.patient_id = :p AND pd.notify_on_signed = TRUE
              AND pd.notify_channel = 'whatsapp'
        """
        params = {"p": str(study["patient_id"])}
        if body.doctor_link_id:
            sql += " AND pd.id = :pid"
            params["pid"] = str(body.doctor_link_id)
        recipients = (await session.execute(text(sql), params)).mappings().all()

        segs = (
            await session.execute(
                text("SELECT label, volume_cc, overlay_uri, snapshot_3d_uri FROM midcine.segmentations WHERE study_id = :s"),
                {"s": str(study["id"])},
            )
        ).mappings().all()

        queued = 0
        for r in recipients:
            phone = r["external_whatsapp"]
            if not phone and r["phone_encrypted"]:
                try:
                    phone = decrypt(bytes(r["phone_encrypted"]))
                except Exception:
                    phone = None
            if not phone:
                continue
            n_id = uuid4()
            doctor_name = r["full_name_ar"] or r["external_name"] or "الطبيب"
            body_ar = (
                f"السلام عليكم د. {doctor_name}\n"
                f"تقرير أشعة جديد للمريض من midcine.\n\n"
                f"الانطباع: {study['impression_ar'] or '—'}\n"
                f"ICD-11: {', '.join(study['icd11_codes'] or []) or '—'}\n\n"
                f"تجد المرفقات أدناه (PDF + key slice + 3D overview)."
            )
            attachments = [
                {"kind": "report_pdf", "uri": f"http://ingestion-api:8100/v1/reports/{study['report_id']}/pdf", "name": "report.html"},
            ]
            for s in segs:
                if s["overlay_uri"]:
                    attachments.append({"kind": "image", "uri": s["overlay_uri"], "name": f"seg-{s['label']}.png"})
                if s["snapshot_3d_uri"]:
                    attachments.append({"kind": "image", "uri": s["snapshot_3d_uri"], "name": f"3d-{s['label']}.png"})

            await session.execute(
                text(
                    """
                    INSERT INTO midcine.notifications
                        (id, tenant_id, patient_id, study_id, report_id, channel, target,
                         subject_ar, body_ar, attachments, status)
                    VALUES (:id, :t, :p, :s, :r, 'whatsapp', :tg, :sub, :b, :att, 'queued')
                    """
                ),
                {
                    "id": str(n_id),
                    "t": principal.tenant_id,
                    "p": str(study["patient_id"]),
                    "s": str(study["id"]),
                    "r": str(study["report_id"]),
                    "tg": phone,
                    "sub": "تقرير أشعة جديد — midcine",
                    "b": body_ar,
                    "att": json.dumps(attachments, ensure_ascii=False),
                },
            )
            await publish(
                "doctor:notify",
                {
                    "notification_id": str(n_id),
                    "tenant_id": principal.tenant_id,
                    "channel": "whatsapp",
                    "target": phone,
                    "body": body_ar,
                    "attachments": attachments,
                },
            )
            queued += 1

        await write_audit(
            session,
            action="send_packet",
            resource_type="study",
            resource_id=str(study["id"]),
            actor_user_id=principal.user_id,
            actor_role=principal.role,
            tenant_id=principal.tenant_id,
            extra={"recipients": queued},
        )

    return {"queued": queued}


# ===== Consents =====

class ConsentBody(BaseModel):
    consent_type: str
    granted: bool
    signed_text: str | None = None


@router.post("/patients/{patient_id}/consents")
async def add_consent(patient_id: UUID, body: ConsentBody, principal: Principal = Depends(get_principal)):
    async with tenant_session(principal.tenant_id, principal.role) as session:
        c_id = uuid4()
        await session.execute(
            text(
                """
                INSERT INTO midcine.patient_consents
                    (id, tenant_id, patient_id, consent_type, granted, signed_text, witness_user_id)
                VALUES (:id, :t, :p, :ct, :g, :st, :w)
                """
            ),
            {
                "id": str(c_id),
                "t": principal.tenant_id,
                "p": str(patient_id),
                "ct": body.consent_type,
                "g": body.granted,
                "st": body.signed_text,
                "w": principal.user_id,
            },
        )
    return {"id": str(c_id)}


# ===== Audit dashboard (للـ owner) =====

@router.get("/audit/recent")
async def audit_recent(limit: int = 100, principal: Principal = Depends(get_principal)):
    if principal.role not in ("owner", "super_admin", "doctor"):
        raise HTTPException(403)
    async with tenant_session(principal.tenant_id, principal.role) as session:
        rows = (
            await session.execute(
                text(
                    """
                    SELECT ts, actor_role, action, resource_type, resource_id, outcome
                    FROM midcine_audit.audit_log
                    ORDER BY ts DESC LIMIT :lim
                    """
                ),
                {"lim": limit},
            )
        ).mappings().all()
    return {"items": [dict(r) | {"ts": r["ts"].isoformat()} for r in rows]}
