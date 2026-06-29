from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy import text

from .. import repo
from ..audit import write_audit
from ..auth import Principal, get_principal
from ..db import tenant_session
from ..streams import publish

router = APIRouter(prefix="/v1", tags=["reading"])


@router.get("/worklist")
async def worklist(
    status: str | None = Query(default="unread"),
    modality: str | None = Query(default=None),
    priority_max: int | None = Query(default=None, ge=1, le=5),
    limit: int = Query(default=50, ge=1, le=200),
    principal: Principal = Depends(get_principal),
):
    async with tenant_session(principal.tenant_id, principal.role) as session:
        items = await repo.worklist(
            session,
            status_=status,
            modality=modality,
            priority_max=priority_max,
            limit=limit,
        )
        await write_audit(
            session,
            action="view_worklist",
            resource_type="worklist",
            resource_id="-",
            actor_user_id=principal.user_id,
            actor_role=principal.role,
            tenant_id=principal.tenant_id,
            auth_method="password",
        )
    return {"items": items, "next_cursor": None, "limit": limit}


@router.get("/studies/{study_uid}")
async def get_study(study_uid: str, principal: Principal = Depends(get_principal)):
    async with tenant_session(principal.tenant_id, principal.role) as session:
        detail = await repo.study_detail(session, study_uid)
        if not detail:
            raise HTTPException(status_code=404, detail={"code": "STUDY_NOT_FOUND"})
        await write_audit(
            session,
            action="view_study",
            resource_type="study",
            resource_id=detail["study_id"],
            actor_user_id=principal.user_id,
            actor_role=principal.role,
            tenant_id=principal.tenant_id,
        )
    return detail


class ReportDraftPayload(BaseModel):
    technique_ar: str
    findings_ar: str
    impression_ar: str
    recommendations_ar: str
    icd11_codes: list[str] = []
    ai_acceptance: int | None = None
    base_version: int = 1


@router.put("/reports/{study_uid}/draft")
async def upsert_draft(
    study_uid: str,
    body: ReportDraftPayload,
    principal: Principal = Depends(get_principal),
):
    if principal.role not in ("doctor", "owner"):
        raise HTTPException(status_code=403, detail={"code": "NOT_AUTHORIZED"})
    import hashlib
    import json

    async with tenant_session(principal.tenant_id, principal.role) as session:
        study = (
            await session.execute(
                text("SELECT id FROM midcine.studies WHERE study_instance_uid = :u"),
                {"u": study_uid},
            )
        ).first()
        if not study:
            raise HTTPException(status_code=404, detail={"code": "STUDY_NOT_FOUND"})

        existing = (
            await session.execute(
                text(
                    """
                    SELECT id, version FROM midcine.reports
                    WHERE study_id = :s ORDER BY version DESC LIMIT 1
                    """
                ),
                {"s": str(study[0])},
            )
        ).first()

        body_text = json.dumps(body.model_dump(), ensure_ascii=False)
        body_hash = hashlib.sha256(body_text.encode("utf-8")).digest()

        if existing:
            report_id, version = existing
            if body.base_version != version:
                raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT"})
            await session.execute(
                text(
                    """
                    UPDATE midcine.reports
                    SET technique_ar=:tq, findings_ar=:fd, impression_ar=:im,
                        recommendations_ar=:rec, icd11_codes=:icd,
                        ai_acceptance=:acc, body_hash=:bh, version = version + 1
                    WHERE id = :id
                    """
                ),
                {
                    "tq": body.technique_ar,
                    "fd": body.findings_ar,
                    "im": body.impression_ar,
                    "rec": body.recommendations_ar,
                    "icd": body.icd11_codes,
                    "acc": body.ai_acceptance,
                    "bh": body_hash,
                    "id": str(report_id),
                },
            )
            new_version = version + 1
        else:
            new_id = (
                await session.execute(
                    text(
                        """
                        INSERT INTO midcine.reports
                            (tenant_id, study_id, version, status, technique_ar, findings_ar,
                             impression_ar, recommendations_ar, icd11_codes,
                             ai_acceptance, author_user_id, body_hash)
                        VALUES (:t, :s, 1, 'draft', :tq, :fd, :im, :rec, :icd, :acc, :au, :bh)
                        RETURNING id
                        """
                    ),
                    {
                        "t": principal.tenant_id,
                        "s": str(study[0]),
                        "tq": body.technique_ar,
                        "fd": body.findings_ar,
                        "im": body.impression_ar,
                        "rec": body.recommendations_ar,
                        "icd": body.icd11_codes,
                        "acc": body.ai_acceptance,
                        "au": principal.user_id,
                        "bh": body_hash,
                    },
                )
            ).scalar_one()
            report_id, new_version = new_id, 1

        await write_audit(
            session,
            action="modify_report",
            resource_type="report",
            resource_id=str(report_id),
            actor_user_id=principal.user_id,
            actor_role=principal.role,
            tenant_id=principal.tenant_id,
            extra={"version": new_version},
        )

    return {"report_id": str(report_id), "version": new_version}


@router.post("/reports/{report_id}/sign")
async def sign_report(report_id: UUID, principal: Principal = Depends(get_principal)):
    if principal.role not in ("doctor", "owner"):
        raise HTTPException(status_code=403, detail={"code": "NOT_AUTHORIZED_TO_SIGN"})

    async with tenant_session(principal.tenant_id, principal.role) as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT r.id, r.study_id, r.impression_ar, r.icd11_codes, s.study_instance_uid
                    FROM midcine.reports r
                    JOIN midcine.studies s ON s.id = r.study_id
                    WHERE r.id = :id
                    """
                ),
                {"id": str(report_id)},
            )
        ).first()
        if not row:
            raise HTTPException(status_code=404, detail={"code": "REPORT_NOT_FOUND"})

        if not row[2]:
            raise HTTPException(status_code=422, detail={"code": "MISSING_IMPRESSION"})

        signed_at = datetime.now(timezone.utc)
        pdf_uri = (
            f"s3://midcine-reports/{principal.tenant_id}/{row[0]}.pdf"  # PDF يولّد lazy في endpoint /pdf
        )
        # توليد DICOM SR (اختياري — لا يفشل التوقيع لو فشل)
        report_payload = {"findings_ar": "", "impression_ar": row[2] or "", "mrn": ""}
        _try_generate_dicom_sr(row[4], report_payload, principal.tenant_id, str(row[0]))
        await session.execute(
            text(
                """
                UPDATE midcine.reports
                SET status='signed', signed_by_user_id=:u, signed_at=:ts,
                    signature_alg='session', pdf_storage_uri=:pdf
                WHERE id = :id
                """
            ),
            {"u": principal.user_id, "ts": signed_at, "pdf": pdf_uri, "id": str(report_id)},
        )
        await session.execute(
            text(
                """
                UPDATE midcine.studies SET read_status='signed', reported_at=:ts
                WHERE id = :s
                """
            ),
            {"ts": signed_at, "s": str(row[1])},
        )
        await write_audit(
            session,
            action="sign_report",
            resource_type="report",
            resource_id=str(report_id),
            actor_user_id=principal.user_id,
            actor_role=principal.role,
            tenant_id=principal.tenant_id,
            extra={"icd11": row[3] or []},
        )

    await publish(
        "doctor:signed",
        {
            "report_id": str(report_id),
            "study_uid": row[4],
            "signed_by": principal.user_id,
            "signed_at": signed_at.isoformat(),
            "icd11_codes": row[3] or [],
        },
    )
    return {
        "report_id": str(report_id),
        "status": "signed",
        "signed_at": signed_at.isoformat(),
        "pdf_url": f"/v1/reports/{report_id}/pdf",
        "fhir_pushed": True,
    }


def _try_generate_dicom_sr(study_uid: str, report_payload: dict, tenant_id: str, report_id: str) -> str | None:
    """يولّد DICOM SR عبر highdicom ويرفعه لـ MinIO. يرجع s3 URI أو None عند الفشل."""
    try:
        import io as _io

        import highdicom as hd
        import pydicom
        from highdicom.sr import (
            CodedConcept,
            ComprehensiveSR,
            TextContentItem,
        )

        # SR بسيط بدون evidence images للـ prototype
        sr_meta = pydicom.dataset.Dataset()
        sr_meta.PatientID = report_payload.get("mrn", "UNKNOWN")
        sr_meta.PatientName = ""
        sr_meta.StudyInstanceUID = study_uid
        sr_meta.AccessionNumber = ""
        sr_meta.StudyID = ""
        sr_meta.StudyDate = ""
        sr_meta.StudyTime = ""
        sr_meta.ReferringPhysicianName = ""
        sr_meta.PatientBirthDate = ""
        sr_meta.PatientSex = "O"

        sr = ComprehensiveSR(
            evidence=[sr_meta],
            content=[
                TextContentItem(
                    name=CodedConcept(value="121071", scheme_designator="DCM", meaning="Finding"),
                    value=report_payload.get("findings_ar", "") or "—",
                ),
                TextContentItem(
                    name=CodedConcept(value="121072", scheme_designator="DCM", meaning="Impression"),
                    value=report_payload.get("impression_ar", "") or "—",
                ),
            ],
            series_instance_uid=hd.UID(),
            series_number=999,
            sop_instance_uid=hd.UID(),
            instance_number=1,
            manufacturer="midcine",
            institution_name="midcine prototype",
        )
        buf = _io.BytesIO()
        sr.save_as(buf)
        data = buf.getvalue()
        from ..storage import put_object
        uri = f"s3://midcine-reports/{tenant_id}/{report_id}-sr.dcm"
        put_object(uri, data, content_type="application/dicom")
        return uri
    except Exception:
        import logging
        logging.getLogger("dicom-sr").exception("DICOM SR generation failed")
        return None


@router.post("/studies/{study_uid}/reprocess-ai")
async def reprocess_ai(study_uid: str, principal: Principal = Depends(get_principal)):
    """يعيد دفع رسالة على studies:new — يُجبر AI Worker على إعادة التحليل."""
    from ..streams import publish

    async with tenant_session(principal.tenant_id, principal.role) as session:
        row = (
            await session.execute(
                text(
                    """SELECT id, modality, body_part, num_instances
                       FROM midcine.studies WHERE study_instance_uid = :u"""
                ),
                {"u": study_uid},
            )
        ).first()
        if not row:
            raise HTTPException(404, detail={"code": "STUDY_NOT_FOUND"})
        await session.execute(
            text("DELETE FROM midcine.segmentations WHERE study_id = :s"), {"s": str(row[0])}
        )
        await session.execute(
            text("DELETE FROM midcine.reports WHERE study_id = :s"), {"s": str(row[0])}
        )
        await session.execute(
            text("DELETE FROM midcine.ai_inferences WHERE study_id = :s"), {"s": str(row[0])}
        )
        await session.execute(
            text("""UPDATE midcine.studies SET triage_status='pending', triage_label=NULL,
                   ai_confidence=NULL, triage_priority=5 WHERE id=:s"""),
            {"s": str(row[0])},
        )
        study_id, modality, body_part, num_instances = row

    await publish(
        "studies:new",
        {
            "study_uid": study_uid,
            "study_id": str(study_id),
            "tenant_id": principal.tenant_id,
            "modality": modality,
            "body_part": body_part or "",
            "num_instances": str(num_instances),
        },
    )
    return {"queued": True, "study_id": str(study_id)}


@router.get("/studies/{study_id}/segmentations")
async def get_segmentations(study_id: UUID, principal: Principal = Depends(get_principal)):
    async with tenant_session(principal.tenant_id, principal.role) as session:
        rows = (
            await session.execute(
                text(
                    """
                    SELECT label, method, color_hex, volume_cc, overlay_uri, snapshot_3d_uri
                    FROM midcine.segmentations
                    WHERE study_id = :s
                    """
                ),
                {"s": str(study_id)},
            )
        ).mappings().all()

    import os as _os
    public_minio = _os.environ.get("MINIO_PUBLIC_ENDPOINT", "http://localhost:13900")

    def _to_public(uri: str | None) -> str | None:
        if not uri or not uri.startswith("s3://"):
            return None
        rest = uri[5:]
        bucket, _, key = rest.partition("/")
        return f"{public_minio}/{bucket}/{key}"

    base = f"{public_minio}/midcine-heatmaps/{principal.tenant_id}/{study_id}"
    return {
        "volume_url": f"{base}/volume.nrrd",
        "items": [
            {
                "label": r["label"],
                "method": r["method"],
                "color_hex": r["color_hex"],
                "volume_cc": float(r["volume_cc"]) if r["volume_cc"] else None,
                "overlay_url": _to_public(r["overlay_uri"]),
                "snapshot_3d_url": _to_public(r["snapshot_3d_uri"]),
                "mask_url": f"{base}/mask-{r['label']}.nrrd",
            }
            for r in rows
        ],
    }


@router.post("/upload-dicom")
async def upload_dicom_browser(
    file: UploadFile = File(...),
    skip_complete: bool = False,
    principal: Principal = Depends(get_principal),
):
    """رفع DICOM من المتصفح.

    عند رفع مجلد كامل، الـ client يبعث `skip_complete=true` لكل ملف ثم يستدعي
    POST /v1/studies/{uid}/complete مرة واحدة بـ expected_instances الكلي.
    """
    import json as _j
    import tempfile

    import httpx
    from midcine_dicom import summarize

    body = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".dcm", delete=False) as tf:
        tf.write(body)
        tf.flush()
        path = tf.name
    try:
        s = summarize(path)
    except Exception as e:
        raise HTTPException(422, detail={"code": "INVALID_DICOM", "error": str(e)}) from e

    meta = {
        "study_instance_uid": s.study_uid,
        "series_instance_uid": s.series_uid,
        "sop_instance_uid": s.sop_uid,
        "patient_mrn": s.patient_mrn,
        "patient_name_ar": s.patient_name_ar,
        "patient_dob": s.patient_dob.isoformat() if s.patient_dob else None,
        "patient_sex": s.patient_sex,
        "modality": s.modality,
        "body_part": s.body_part,
        "study_date": s.study_date.isoformat(),
        "rows": s.rows,
        "cols": s.cols,
        "transfer_syntax": s.transfer_syntax,
        "hash_sha256": s.hash_sha256,
        "size_bytes": s.size_bytes,
        "description": s.description,
    }

    async with httpx.AsyncClient() as c:
        files = {
            "meta": (None, _j.dumps(meta, ensure_ascii=False), "application/json"),
            "pixels": (file.filename or "x.dcm", body, "application/dicom"),
        }
        r = await c.post("http://localhost:8100/v1/instances", files=files, timeout=60)
        if r.status_code >= 300:
            raise HTTPException(r.status_code, detail=r.json())
        result = r.json()
        if not skip_complete:
            await c.post(
                f"http://localhost:8100/v1/studies/{s.study_uid}/complete",
                json={"expected_instances": 1},
                timeout=20,
            )
    return {**result, "study_uid": s.study_uid, "modality": s.modality}


@router.get("/reports/{report_id}/pdf")
async def get_pdf(report_id: UUID, principal: Principal = Depends(get_principal)):
    """يولّد PDF عربي بسيط (HTML → PDF محدود في الـ prototype: نرجع HTML للسهولة)."""
    from fastapi.responses import HTMLResponse

    async with tenant_session(principal.tenant_id, principal.role) as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT r.*, s.study_instance_uid, p.mrn
                    FROM midcine.reports r
                    JOIN midcine.studies s ON s.id = r.study_id
                    JOIN midcine.patients p ON p.id = s.patient_id
                    WHERE r.id = :id
                    """
                ),
                {"id": str(report_id)},
            )
        ).mappings().first()
    if not row:
        raise HTTPException(status_code=404)

    html = f"""<!doctype html>
<html dir="rtl" lang="ar">
<head><meta charset="utf-8"><title>midcine — تقرير {report_id}</title>
<style>
body{{font-family:'IBM Plex Sans Arabic','Tajawal',sans-serif;max-width:780px;margin:2rem auto;padding:2rem;color:#0D1117;line-height:1.7}}
h1{{color:#0F62FE;border-bottom:2px solid #0F62FE;padding-bottom:.5rem}}
h2{{color:#0B3CB8;margin-top:1.5rem}}
.meta{{background:#F4F4F4;padding:1rem;border-radius:8px;font-size:.9rem}}
.sig{{margin-top:2rem;padding-top:1rem;border-top:1px solid #ddd;color:#697077;font-size:.85rem}}
.icd{{background:#E0EFFF;padding:.2rem .5rem;border-radius:4px;font-family:monospace}}
</style></head>
<body>
<h1>تقرير الأشعة — midcine</h1>
<div class="meta">
  <strong>رقم الفحص:</strong> {row['study_instance_uid']}<br>
  <strong>رقم المريض:</strong> {row['mrn']}<br>
  <strong>نسخة:</strong> {row['version']} | <strong>الحالة:</strong> {row['status']}
</div>
<h2>التقنية المستخدمة</h2><p>{row['technique_ar'] or '—'}</p>
<h2>النتائج</h2><p>{row['findings_ar'] or '—'}</p>
<h2>الانطباع</h2><p>{row['impression_ar'] or '—'}</p>
<p><strong>ICD-11:</strong> {' '.join(f'<span class="icd">{c}</span>' for c in (row['icd11_codes'] or []))}</p>
<h2>التوصيات</h2><p>{row['recommendations_ar'] or '—'}</p>
<div class="sig">
  وُقّع رقمياً في: {row['signed_at']} — midcine prototype build (TEST — لا توقيع PKI حقيقي)
</div>
</body></html>"""
    return HTMLResponse(content=html, status_code=200)
