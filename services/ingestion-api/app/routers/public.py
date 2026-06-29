"""Public endpoints — يتاح الوصول إليها عبر QR token بدون JWT.

النطاق: قراءة ملف مريض محدد فقط (لا يكشف معلومات tenants أخرى).
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import text

from ..audit import write_audit
from ..auth import system_principal
from ..crypto import decrypt
from ..db import tenant_session

router = APIRouter(prefix="/v1/public", tags=["public"])


def _hash_token(token: str) -> bytes:
    return hashlib.sha256(token.encode("utf-8")).digest()


async def _verify_qr(qr_id: str, qr_token: str, patient_id: UUID) -> tuple[str, str]:
    """يرجع (tenant_id, scope) أو يرفع HTTPException."""
    p = system_principal()
    th = _hash_token(qr_token)
    async with tenant_session(p.tenant_id, p.role) as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT patient_id, tenant_id, scope, revoked_at, expires_at, uses_remaining
                    FROM midcine.patient_qr_tokens WHERE id = :id AND token_hash = :h
                    """
                ),
                {"id": qr_id, "h": th},
            )
        ).first()
    if not row:
        raise HTTPException(401, detail={"code": "INVALID_QR"})
    if str(row[0]) != str(patient_id):
        raise HTTPException(403, detail={"code": "QR_PATIENT_MISMATCH"})
    if row[3] or row[4] < datetime.now(timezone.utc) or row[5] <= 0:
        raise HTTPException(403, detail={"code": "QR_INVALID"})
    return str(row[1]), row[2]


@router.get("/patients/{patient_id}/profile")
async def public_profile(
    patient_id: UUID,
    qr_id: str = Query(...),
    qr_token: str = Query(...),
):
    tenant_id, scope = await _verify_qr(qr_id, qr_token, patient_id)
    async with tenant_session(tenant_id, "super_admin") as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT mrn, name_encrypted, dob, sex
                    FROM midcine.patients WHERE id = :id AND deleted_at IS NULL
                    """
                ),
                {"id": str(patient_id)},
            )
        ).mappings().first()
        if not row:
            raise HTTPException(404)
        studies = (
            await session.execute(
                text(
                    """
                    SELECT id, study_instance_uid, modality, body_part, description,
                           study_date, triage_priority, triage_label, read_status
                    FROM midcine.studies WHERE patient_id = :id ORDER BY study_date DESC
                    """
                ),
                {"id": str(patient_id)},
            )
        ).mappings().all()
        history = (
            await session.execute(
                text(
                    """
                    SELECT id, entry_type, title_ar, detail_ar, occurred_on, severity, created_at
                    FROM midcine.patient_history WHERE patient_id = :id
                    ORDER BY occurred_on DESC NULLS LAST, created_at DESC LIMIT 50
                    """
                ),
                {"id": str(patient_id)},
            )
        ).mappings().all()
        attachments = (
            await session.execute(
                text(
                    """
                    SELECT id, file_name, mime_type, size_bytes, kind, description_ar, created_at
                    FROM midcine.attachments
                    WHERE patient_id = :id AND deleted_at IS NULL ORDER BY created_at DESC
                    """
                ),
                {"id": str(patient_id)},
            )
        ).mappings().all()

        await write_audit(
            session,
            action="public_view_profile",
            resource_type="patient",
            resource_id=str(patient_id),
            actor_user_id=None,
            actor_role="qr_guest",
            tenant_id=tenant_id,
            auth_method="mtls",        # نحفظها كـ qr لكن enum يقبل mtls حالياً
            extra={"qr_id": qr_id},
        )

    try:
        name_ar = decrypt(bytes(row["name_encrypted"])) if row["name_encrypted"] else "—"
    except Exception:
        name_ar = "—"

    return {
        "patient": {
            "mrn": row["mrn"],
            "name_ar": name_ar,
            "dob": row["dob"].isoformat() if row["dob"] else None,
            "sex": row["sex"],
        },
        "studies": [
            dict(s) | {"id": str(s["id"]), "study_date": s["study_date"].isoformat()}
            for s in studies
        ],
        "history": [
            dict(h)
            | {
                "id": str(h["id"]),
                "occurred_on": h["occurred_on"].isoformat() if h["occurred_on"] else None,
                "created_at": h["created_at"].isoformat(),
            }
            for h in history
        ],
        "attachments": [
            dict(a) | {"id": str(a["id"]), "created_at": a["created_at"].isoformat()}
            for a in attachments
        ],
        "scope": scope,
    }
