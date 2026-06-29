"""يستهلك ai:inference ويُولّد مسودة تقرير ويحفظها."""
from __future__ import annotations

import asyncio
import json
import logging
import time
from uuid import uuid4

import redis.asyncio as aioredis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from .backends import stub_template
from .config import get_settings

log = logging.getLogger("llm-worker")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

settings = get_settings()
engine = create_async_engine(settings.postgres_url, pool_size=5, max_overflow=10)
Session = async_sessionmaker(engine, expire_on_commit=False)

MODEL = "midcine-llm-stub-jinja2-v1"


async def process(msg_id: str, fields: dict) -> None:
    study_uid = fields.get("study_uid", "")
    study_id = fields.get("study_id", "")
    tenant_id = fields.get("tenant_id", "")
    ai_label = fields.get("label", "no_acute_finding")
    ai_confidence = float(fields.get("confidence", 0.9))
    try:
        ai_measurements = json.loads(fields.get("measurements", "{}"))
    except Exception:
        ai_measurements = {}
    try:
        vision = json.loads(fields.get("vision", "{}"))
    except Exception:
        vision = {}

    log.info("llm draft start study=%s label=%s vision=%s", study_uid, ai_label, bool(vision))

    async with Session() as session:
        await session.execute(text("SELECT set_config('midcine.current_tenant', :v, false)"), {"v": str(tenant_id)})
        await session.execute(text("SELECT set_config('midcine.current_role', 'super_admin', false)"))

        row = (
            await session.execute(
                text(
                    """
                    SELECT s.id, s.modality, s.body_part, s.clinical_indication, p.dob, p.sex
                    FROM midcine.studies s
                    JOIN midcine.patients p ON p.id = s.patient_id
                    WHERE s.study_instance_uid = :u
                    """
                ),
                {"u": study_uid},
            )
        ).mappings().first()

        if not row:
            log.warning("study not found: %s", study_uid)
            return

        age = None
        if row["dob"]:
            from datetime import date
            today = date.today()
            age = today.year - row["dob"].year - (
                (today.month, today.day) < (row["dob"].month, row["dob"].day)
            )

        t0 = time.perf_counter()
        # عند توفّر تحليل Vision حقيقي → استخدمه كقاعدة للتقرير
        if vision and (vision.get("findings") or vision.get("impression")):
            sections = stub_template.render_from_vision(
                vision=vision,
                body_part=row["body_part"],
                modality=row["modality"],
                patient_age=age,
                patient_sex=row["sex"],
                clinical_indication=row["clinical_indication"],
            )
        else:
            sections = stub_template.render_draft(
                body_part=row["body_part"],
                ai_label=ai_label,
                ai_confidence=ai_confidence,
                ai_measurements=ai_measurements,
                patient_age=age,
                patient_sex=row["sex"],
                clinical_indication=row["clinical_indication"],
                modality=row["modality"],
            )
        latency_ms = int((time.perf_counter() - t0) * 1000)

        inf_id = uuid4()
        await session.execute(
            text(
                """
                INSERT INTO midcine.ai_inferences
                    (id, tenant_id, study_id, inference_type, model_name, model_version,
                     input_summary, output, latency_ms)
                VALUES (:id, :t, :s, 'llm_draft', :mn, '0.1.0', :inp, :out, :lm)
                """
            ),
            {
                "id": str(inf_id),
                "t": tenant_id,
                "s": str(row["id"]),
                "mn": MODEL,
                "inp": json.dumps({"ai_label": ai_label, "ai_confidence": ai_confidence}),
                "out": json.dumps(sections, ensure_ascii=False),
                "lm": latency_ms,
            },
        )

        # احفظ تقرير draft تلقائياً (سيُحرَّر بواسطة الطبيب)
        await session.execute(
            text(
                """
                INSERT INTO midcine.reports
                    (tenant_id, study_id, version, status, technique_ar, findings_ar,
                     impression_ar, recommendations_ar, icd11_codes, ai_draft_id,
                     body_hash)
                VALUES (:t, :s, 1, 'draft', :tq, :fd, :im, :rec, :icd, :ad, decode('00', 'hex'))
                ON CONFLICT (study_id, version) DO UPDATE SET
                    technique_ar=EXCLUDED.technique_ar,
                    findings_ar=EXCLUDED.findings_ar,
                    impression_ar=EXCLUDED.impression_ar,
                    recommendations_ar=EXCLUDED.recommendations_ar,
                    icd11_codes=EXCLUDED.icd11_codes,
                    ai_draft_id=EXCLUDED.ai_draft_id
                """
            ),
            {
                "t": tenant_id,
                "s": str(row["id"]),
                "tq": sections["technique_ar"],
                "fd": sections["findings_ar"],
                "im": sections["impression_ar"],
                "rec": sections["recommendations_ar"],
                "icd": sections["icd11_codes"],
                "ad": str(inf_id),
            },
        )

        await session.execute(
            text(
                """
                INSERT INTO midcine_audit.audit_log
                    (request_id, tenant_id, actor_user_id, actor_role, auth_method,
                     action, resource_type, resource_id, outcome, extra)
                VALUES (:rid, :t, NULL, 'system', 'system', 'llm_draft', 'study', :sid, 'success', :ex)
                """
            ),
            {
                "rid": str(uuid4()),
                "t": tenant_id,
                "sid": str(row["id"]),
                "ex": json.dumps({"latency_ms": latency_ms, "tokens": sum(len(v.split()) for v in sections.values() if isinstance(v, str))}),
            },
        )
        await session.commit()

    log.info("llm draft done study=%s latency=%dms", study_uid, latency_ms)


async def main_loop() -> None:
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        await r.xgroup_create("ai:inference", "llm-draft", id="0", mkstream=True)
    except Exception:
        pass

    # نبثّ على llm:report للـ realtime
    log.info("llm-worker started; awaiting ai:inference")
    while True:
        try:
            resp = await r.xreadgroup("llm-draft", "worker-1", {"ai:inference": ">"}, block=5000, count=4)
            if not resp:
                continue
            for _stream, msgs in resp:
                for msg_id, fields in msgs:
                    try:
                        await process(msg_id, fields)
                        await r.xack("ai:inference", "llm-draft", msg_id)
                        await r.xadd(
                            "llm:report",
                            {
                                "study_uid": fields.get("study_uid", ""),
                                "study_id": fields.get("study_id", ""),
                                "tenant_id": fields.get("tenant_id", ""),
                            },
                            maxlen=100_000,
                            approximate=True,
                        )
                    except Exception:
                        log.exception("llm process failed for %s", msg_id)
        except Exception:
            log.exception("llm loop error; sleeping")
            await asyncio.sleep(2)


if __name__ == "__main__":
    asyncio.run(main_loop())
