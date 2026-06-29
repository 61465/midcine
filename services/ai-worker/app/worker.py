"""يستهلك studies:new ويُنتج: triage + measurements + segmentation overlay + 3D snapshot."""
from __future__ import annotations

import asyncio
import json
import os
import logging
import time
from uuid import uuid4

import redis.asyncio as aioredis
from minio import Minio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from .config import get_settings
from .segmentation import segment_volume
from .triage_stub import analyze

log = logging.getLogger("ai-worker")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

settings = get_settings()
engine = create_async_engine(settings.postgres_url, pool_size=5, max_overflow=10)
Session = async_sessionmaker(engine, expire_on_commit=False)

MODEL_NAME = "midcine-triage-stub-rule-based"
MODEL_VERSION = "0.2.0"
SEG_MODEL = "midcine-seg-hu-threshold"


def _mc() -> Minio:
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_use_ssl,
    )


def _fetch(uri: str) -> bytes:
    assert uri.startswith("s3://")
    bucket, _, key = uri[5:].partition("/")
    resp = _mc().get_object(bucket, key)
    try:
        return resp.read()
    finally:
        resp.close()
        resp.release_conn()


def _put_bytes(bucket: str, key: str, data: bytes, content_type: str = "image/png") -> str:
    import io as _io
    client = _mc()
    try:
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
    except Exception:
        pass
    client.put_object(bucket, key, _io.BytesIO(data), length=len(data), content_type=content_type)
    return f"s3://{bucket}/{key}"


async def process(r: aioredis.Redis, msg_id: str, fields: dict) -> None:
    study_uid = fields.get("study_uid", "")
    tenant_id = fields.get("tenant_id", "")
    log.info("ai start study=%s tenant=%s", study_uid, tenant_id)

    t0 = time.perf_counter()

    async with Session() as session:
        # is_local=false → يستمر بعد commit (مهم لأن process لها commit في المنتصف)
        await session.execute(text("SELECT set_config('midcine.current_tenant', :v, false)"), {"v": str(tenant_id)})
        await session.execute(text("SELECT set_config('midcine.current_role', 'super_admin', false)"))

        study = (
            await session.execute(
                text(
                    """
                    SELECT s.id, s.modality, s.body_part FROM midcine.studies s
                    WHERE s.study_instance_uid = :u
                    """
                ),
                {"u": study_uid},
            )
        ).first()
        if not study:
            log.warning("study not found in DB: %s", study_uid)
            return
        study_id, modality, body_part = study

        # حدّث الحالة إلى "running"
        await session.execute(
            text("UPDATE midcine.studies SET triage_status='running' WHERE id=:s"),
            {"s": str(study_id)},
        )
        await session.commit()

        # كل instances الـ study (للـ volume)
        inst_rows = (
            await session.execute(
                text(
                    """
                    SELECT i.storage_uri, i.sop_instance_uid, i.instance_number
                    FROM midcine.instances i
                    JOIN midcine.series se ON se.id = i.series_id
                    WHERE se.study_id = :s
                    ORDER BY i.instance_number NULLS LAST
                    """
                ),
                {"s": str(study_id)},
            )
        ).all()

        if not inst_rows:
            await session.execute(
                text("UPDATE midcine.studies SET triage_status='failed' WHERE id=:s"),
                {"s": str(study_id)},
            )
            return

        # --- Triage stub على أول slice وسطية (الأقرب للوسط) ---
        # Stub مصمم لـ CT brain فقط — لكل modality أخرى نعطي إجابة عامة
        from .triage_stub import TriageOut
        mid_uri = inst_rows[len(inst_rows) // 2][0]
        modality_upper = str(modality or "").upper()
        body_part_upper = str(body_part or "").upper()
        is_ct_brain = modality_upper == "CT" and ("BRAIN" in body_part_upper or "HEAD" in body_part_upper)

        if is_ct_brain:
            try:
                mid_bytes = _fetch(mid_uri)
                triage = analyze(mid_bytes)
            except Exception as e:
                log.exception("triage failed: %s", e)
                await session.execute(
                    text("UPDATE midcine.studies SET triage_status='failed' WHERE id=:s"),
                    {"s": str(study_id)},
                )
                return
        else:
            # غير CT brain — Stub ليس مُدرَّباً → ننتج نتيجة محايدة "routine"
            triage = TriageOut(
                label="routine_review",
                confidence=0.50,
                priority=4,
                measurements={
                    "modality": modality_upper,
                    "body_part": body_part_upper or "unspecified",
                    "n_slices": len(inst_rows),
                    "ai_supported": False,
                    "note": "النموذج التجريبي مُحسَّن لـ CT Brain فقط؛ يحتاج الفحص مراجعة الطبيب",
                },
                hu_ratio=0.0,
            )

        triage_inf_id = uuid4()
        await session.execute(
            text(
                """
                INSERT INTO midcine.ai_inferences
                    (id, tenant_id, study_id, inference_type, model_name, model_version,
                     input_summary, output, confidence, latency_ms)
                VALUES (:id, :t, :s, 'triage', :mn, :mv, :inp, :out, :c, :lm)
                """
            ),
            {
                "id": str(triage_inf_id),
                "t": tenant_id,
                "s": str(study_id),
                "mn": MODEL_NAME,
                "mv": MODEL_VERSION,
                "inp": json.dumps({"modality": modality, "body_part": body_part, "n_instances": len(inst_rows)}),
                "out": json.dumps({"label": triage.label, "hu_ratio": triage.hu_ratio}),
                "c": triage.confidence,
                "lm": int((time.perf_counter() - t0) * 1000),
            },
        )

        meas_inf_id = uuid4()
        await session.execute(
            text(
                """
                INSERT INTO midcine.ai_inferences
                    (id, tenant_id, study_id, inference_type, model_name, model_version,
                     input_summary, output, confidence, latency_ms)
                VALUES (:id, :t, :s, 'measurement', :mn, :mv, :inp, :out, :c, :lm)
                """
            ),
            {
                "id": str(meas_inf_id),
                "t": tenant_id,
                "s": str(study_id),
                "mn": MODEL_NAME,
                "mv": MODEL_VERSION,
                "inp": json.dumps({"label": triage.label}),
                "out": json.dumps(triage.measurements),
                "c": triage.confidence,
                "lm": int((time.perf_counter() - t0) * 1000),
            },
        )

        # --- Volume NRRD + Segmentation 3D ---
        # NRRD نولّده دائماً (لأي modality) ليعمل vtk.js
        # Segmentation HU-based فقط لـ CT
        seg_results = {}
        try:
            all_bytes = []
            for uri, _sop, _no in inst_rows[:320]:
                try:
                    all_bytes.append(_fetch(uri))
                except Exception:
                    continue
            if all_bytes:
                # NRRD لكل الـ modalities
                from .segmentation import build_volume_nrrd
                vol_data = build_volume_nrrd(all_bytes)
                if vol_data:
                    _put_bytes(
                        "midcine-heatmaps",
                        f"{tenant_id}/{study_id}/volume.nrrd",
                        vol_data.nrrd_bytes,
                        content_type="application/octet-stream",
                    )
                    log.info("volume nrrd uploaded: %s bytes", len(vol_data.nrrd_bytes))
                # Segmentation فقط لـ CT
                if modality_upper == "CT":
                    seg_results = segment_volume(all_bytes)
                    log.info("seg done: %s labels", list(seg_results.keys()))
        except Exception as e:
            log.exception("volume/segmentation failed (non-fatal): %s", e)

        for label, seg in seg_results.items():
            # ارفع الـ PNGs
            overlay_uri = _put_bytes(
                "midcine-heatmaps",
                f"{tenant_id}/{study_id}/seg-{label}-2d.png",
                seg.overlay_png,
            )
            snap_uri = _put_bytes(
                "midcine-heatmaps",
                f"{tenant_id}/{study_id}/seg-{label}-3d.png",
                seg.snapshot_3d_png,
            )
            # mask NRRD
            if seg.mask_nrrd:
                _put_bytes(
                    "midcine-heatmaps",
                    f"{tenant_id}/{study_id}/mask-{label}.nrrd",
                    seg.mask_nrrd,
                    content_type="application/octet-stream",
                )
            await session.execute(
                text(
                    """
                    INSERT INTO midcine.segmentations
                        (tenant_id, study_id, inference_id, label, method, color_hex,
                         volume_cc, overlay_uri, snapshot_3d_uri)
                    VALUES (:t, :s, :inf, :lab, 'hu_threshold', :hex, :v, :ov, :sn)
                    """
                ),
                {
                    "t": tenant_id,
                    "s": str(study_id),
                    "inf": str(triage_inf_id),
                    "lab": label,
                    "hex": "#DA1E28" if label == "hemorrhage" else "#F5EAC8",
                    "v": seg.volume_cc,
                    "ov": overlay_uri,
                    "sn": snap_uri,
                },
            )

        # --- Vision AI (Ollama moondream) — يحلّل الصورة فعلياً ---
        vision_result = None
        enable_vision = os.environ.get("ENABLE_VISION_AI", "true").lower() == "true"
        if enable_vision:
            try:
                vision_url = os.environ.get("VISION_AI_URL", "http://vision-ai:8600")
                import httpx as _httpx
                async with _httpx.AsyncClient(timeout=180) as client:
                    vr = await client.post(
                        f"{vision_url}/v1/analyze",
                        json={
                            "study_uid": study_uid,
                            "tenant_id": tenant_id,
                            "modality": modality_upper,
                            "body_part": body_part_upper,
                            "instance_uris": [uri for uri, _, _ in inst_rows[:80]],
                            "key_slice_index": len(inst_rows) // 2,
                        },
                    )
                    if vr.status_code == 200:
                        vision_result = vr.json()
                        log.info("vision AI done: %d ms, parsed=%s",
                                 vision_result.get("latency_ms", 0),
                                 vision_result.get("structured", {}).get("_parsed", True))
                    else:
                        log.warning("vision AI failed: %s %s", vr.status_code, vr.text[:200])
            except Exception as e:
                log.warning("vision AI call failed (non-fatal): %s", e)

        if vision_result:
            vision_inf_id = uuid4()
            await session.execute(
                text(
                    """
                    INSERT INTO midcine.ai_inferences
                        (id, tenant_id, study_id, inference_type, model_name, model_version,
                         input_summary, output, confidence, latency_ms)
                    VALUES (:id, :t, :s, 'measurement', :mn, '0.1', :inp, :out, :c, :lm)
                    """
                ),
                {
                    "id": str(vision_inf_id),
                    "t": tenant_id,
                    "s": str(study_id),
                    "mn": f"ollama-{vision_result.get('model', 'moondream')}",
                    "inp": json.dumps({"key_slice": vision_result.get("key_slice_idx")}),
                    "out": json.dumps(vision_result.get("structured", {}), ensure_ascii=False),
                    "c": float(vision_result.get("structured", {}).get("confidence", 0.7) or 0.7),
                    "lm": vision_result.get("latency_ms", 0),
                },
            )

        # تحديث الـ study
        await session.execute(
            text(
                """
                UPDATE midcine.studies
                SET triage_status='done', triage_priority=:p, triage_label=:lab,
                    ai_confidence=:c, ai_completed_at=now()
                WHERE id=:s
                """
            ),
            {
                "p": triage.priority,
                "lab": triage.label,
                "c": triage.confidence,
                "s": str(study_id),
            },
        )

        await session.execute(
            text(
                """
                INSERT INTO midcine_audit.audit_log
                    (request_id, tenant_id, actor_user_id, actor_role, auth_method,
                     action, resource_type, resource_id, outcome, extra)
                VALUES (:rid, :t, NULL, 'system', 'system', 'ai_inference', 'study', :sid, 'success', :ex)
                """
            ),
            {
                "rid": str(uuid4()),
                "t": tenant_id,
                "sid": str(study_id),
                "ex": json.dumps({"label": triage.label, "confidence": triage.confidence, "segs": list(seg_results)}),
            },
        )
        await session.commit()

    # publish للـ LLM Service
    await r.xadd(
        "ai:inference",
        {
            "study_uid": study_uid,
            "study_id": str(study_id),
            "tenant_id": tenant_id,
            "inference_id": str(triage_inf_id),
            "label": triage.label,
            "confidence": str(triage.confidence),
            "priority": str(triage.priority),
            "measurements": json.dumps(triage.measurements),
            "segmentations": json.dumps({k: v.volume_cc for k, v in seg_results.items()}),
            "vision": json.dumps(vision_result.get("structured", {}) if vision_result else {}, ensure_ascii=False),
        },
        maxlen=100_000,
        approximate=True,
    )

    log.info(
        "ai done study=%s label=%s conf=%.3f p=%d seg=%s",
        study_uid, triage.label, triage.confidence, triage.priority,
        list(seg_results),
    )


async def main_loop() -> None:
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        await r.xgroup_create("studies:new", "ai-triage", id="0", mkstream=True)
    except Exception:
        pass

    log.info("ai-worker started; awaiting studies:new")
    while True:
        try:
            resp = await r.xreadgroup("ai-triage", "worker-1", {"studies:new": ">"}, block=5000, count=2)
            if not resp:
                continue
            for _stream, msgs in resp:
                for msg_id, fields in msgs:
                    try:
                        await process(r, msg_id, fields)
                        await r.xack("studies:new", "ai-triage", msg_id)
                    except Exception:
                        log.exception("process failed for %s", msg_id)
        except Exception:
            log.exception("worker loop error; sleeping")
            await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main_loop())
