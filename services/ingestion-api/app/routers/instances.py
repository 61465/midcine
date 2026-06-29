from __future__ import annotations

import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status

from midcine_types import InstanceCreated, InstanceMeta, StudyCompleteRequest, StudyCompleteResponse

from .. import repo
from ..audit import write_audit
from ..auth import system_principal
from ..config import get_settings
from ..db import tenant_session
from ..storage import put_object
from ..streams import publish

router = APIRouter(prefix="/v1", tags=["ingestion"])
_settings = get_settings()


async def _forward_to_orthanc(dicom_bytes: bytes) -> None:
    """يرفع الـ DICOM لـ Orthanc حتى يظهر في OHIF viewer."""
    import httpx
    import os
    url = os.environ.get("ORTHANC_URL", "http://orthanc:8042")
    user = os.environ.get("ORTHANC_USERNAME", "midcine")
    pwd = os.environ.get("ORTHANC_PASSWORD", "changeme_dev_only")
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(
                f"{url}/instances",
                content=dicom_bytes,
                headers={"Content-Type": "application/dicom"},
                auth=(user, pwd),
            )
            if r.status_code >= 300:
                import logging
                logging.getLogger("orthanc-fw").warning("forward failed: %s %s", r.status_code, r.text[:200])
    except Exception as e:
        import logging
        logging.getLogger("orthanc-fw").warning("forward error: %s", e)


@router.post("/instances", status_code=status.HTTP_201_CREATED, response_model=InstanceCreated)
async def upload_instance(
    meta: str = Form(...),
    pixels: UploadFile = File(...),
):
    """يستقبل instance واحد من Edge Pusher. للـ prototype نقبل بـ JWT system."""
    try:
        meta_obj = InstanceMeta.model_validate_json(meta)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"invalid meta: {e}") from e

    body = await pixels.read()
    if len(body) != meta_obj.size_bytes:
        raise HTTPException(
            status_code=422,
            detail={"code": "SIZE_MISMATCH", "expected": meta_obj.size_bytes, "got": len(body)},
        )

    p = system_principal()
    storage_uri = (
        f"s3://{_settings.minio_bucket}/{p.tenant_id}/"
        f"{meta_obj.study_instance_uid}/{meta_obj.series_instance_uid}/"
        f"{meta_obj.sop_instance_uid}.dcm"
    )
    put_object(storage_uri, body)
    # وجّه للـ Orthanc حتى يظهر في OHIF
    await _forward_to_orthanc(body)

    async with tenant_session(p.tenant_id, p.role) as session:
        patient_id = await repo.get_or_create_patient(
            session,
            tenant_id=p.tenant_id,
            mrn=meta_obj.patient_mrn,
            name_ar=meta_obj.patient_name_ar,
            dob=meta_obj.patient_dob,
            sex=meta_obj.patient_sex,
        )
        study_id = await repo.get_or_create_study(
            session, tenant_id=p.tenant_id, patient_id=patient_id, meta=meta_obj
        )
        series_id = await repo.get_or_create_series(
            session,
            tenant_id=p.tenant_id,
            study_id=study_id,
            series_uid=meta_obj.series_instance_uid,
            modality=meta_obj.modality,
        )
        instance_id = await repo.insert_instance(
            session,
            tenant_id=p.tenant_id,
            series_id=series_id,
            meta=meta_obj,
            storage_uri=storage_uri,
        )
        await write_audit(
            session,
            action="upload_instance",
            resource_type="instance",
            resource_id=str(instance_id),
            actor_user_id=p.user_id,
            actor_role=p.role,
            tenant_id=p.tenant_id,
            patient_id=meta_obj.patient_mrn,
            auth_method="system",
        )

    return InstanceCreated(
        instance_id=instance_id,
        study_id=study_id,
        series_id=series_id,
        storage_uri=storage_uri,
    )


@router.post(
    "/studies/{study_uid}/complete",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=StudyCompleteResponse,
)
async def complete_study(study_uid: str, body: StudyCompleteRequest):
    """يُطلق رسالة على Redis Stream studies:new عند اكتمال الفحص."""
    p = system_principal()
    from sqlalchemy import text

    async with tenant_session(p.tenant_id, p.role) as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT id, tenant_id, modality, body_part, num_instances
                    FROM midcine.studies WHERE study_instance_uid = :u
                    """
                ),
                {"u": study_uid},
            )
        ).first()
        if not row:
            raise HTTPException(status_code=404, detail={"code": "STUDY_NOT_FOUND"})
        study_id, tenant_id, modality, body_part, num_inst = row

        await write_audit(
            session,
            action="study_completed",
            resource_type="study",
            resource_id=str(study_id),
            actor_user_id=p.user_id,
            actor_role=p.role,
            tenant_id=p.tenant_id,
            extra={"expected": body.expected_instances, "got": num_inst},
        )

    await publish(
        "studies:new",
        {
            "study_uid": study_uid,
            "study_id": str(study_id),
            "tenant_id": str(tenant_id),
            "modality": modality,
            "body_part": body_part or "",
            "num_instances": num_inst,
        },
    )
    return StudyCompleteResponse(study_id=study_id, queued_for_ai=True)


@router.post("/internal/orthanc-webhook", status_code=200)
async def orthanc_webhook(payload: dict):
    """يستقبل webhook من Orthanc — للـ MVP الحقيقي. في الـ prototype نستخدم Edge Pusher بدلاً منه."""
    return {"received": True, "payload_keys": list(payload.keys())}
