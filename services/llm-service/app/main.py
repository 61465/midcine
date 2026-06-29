from __future__ import annotations

import json
import time
import uuid

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .backends import stub_template
from .config import get_settings

settings = get_settings()
app = FastAPI(title="midcine llm-service", version="0.1.0")

MODEL_STUB = "midcine-llm-stub-jinja2-v1"


class DraftReq(BaseModel):
    study_uid: str
    tenant_id: str
    modality: str
    body_part: str | None = None
    ai_label: str | None = None
    ai_confidence: float | None = None
    ai_measurements: dict = {}
    patient_age: int | None = None
    patient_sex: str | None = None
    clinical_indication: str | None = None


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "llm-service", "backend": settings.llm_backend}


@app.post("/internal/llm/draft")
async def draft(req: DraftReq):
    t0 = time.perf_counter()
    if settings.llm_backend == "stub":
        sections = stub_template.render_draft(
            body_part=req.body_part,
            ai_label=req.ai_label or "no_acute_finding",
            ai_confidence=req.ai_confidence or 0.9,
            ai_measurements=req.ai_measurements,
            patient_age=req.patient_age,
            patient_sex=req.patient_sex,
            clinical_indication=req.clinical_indication,
        )
        model = MODEL_STUB
        tokens = sum(len(v.split()) for v in sections.values())
    elif settings.llm_backend == "ollama":
        from .backends.ollama import generate

        prompt = (
            f"مريض {req.patient_age or 'غير محدد'} سنة، جنس {req.patient_sex or 'غير محدد'}\n"
            f"نوع الفحص: {req.modality} {req.body_part or ''}\n"
            f"المؤشرات السريرية: {req.clinical_indication or '-'}\n\n"
            f"تشخيص AI الأولي: {req.ai_label or 'بدون نتائج حادة'}\n"
            f"ثقة AI: {(req.ai_confidence or 0)*100:.0f}%\n"
            f"القياسات: {json.dumps(req.ai_measurements, ensure_ascii=False)}\n"
        )
        try:
            raw = await generate(prompt)
            sections = stub_template._split_sections(raw)
            sections = {
                "technique_ar": sections.get("التقنية المستخدمة", "").strip(),
                "findings_ar": sections.get("النتائج", "").strip(),
                "impression_ar": sections.get("الانطباع", "").strip(),
                "recommendations_ar": sections.get("التوصيات", "").strip(),
                "icd11_codes": stub_template._extract_icd11(sections.get("الانطباع", "")),
            }
            model = f"ollama:{settings.ollama_model}"
            tokens = len(raw.split())
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"ollama_failed: {e}") from e
    else:
        raise HTTPException(status_code=500, detail=f"unknown_backend: {settings.llm_backend}")

    latency_ms = int((time.perf_counter() - t0) * 1000)
    return {
        "inference_id": str(uuid.uuid4()),
        "report_draft": sections,
        "rag_sources": [],
        "tokens": tokens,
        "latency_ms": latency_ms,
        "model": model,
    }
