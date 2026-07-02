"""Radiology report generation from AI pipeline output.

Turns the aggregate + per-agent outputs into a structured Arabic report ready
for the radiologist to edit and sign.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field

from .schemas import AgentOutput, AggregateResponse, StudyMetadata


class ReportSection(BaseModel):
    key: Literal["patient", "technique", "findings", "impression", "recommendations"]
    title_ar: str
    content_ar: str
    editable: bool = True


class FinalReport(BaseModel):
    study_uid: str
    patient_id: str | None = None
    patient_name: str | None = None
    hospital_id: str = "default"
    modality: str
    body_part: str
    sections: list[ReportSection]
    impression_ar: str
    recommendations_ar: list[str] = Field(default_factory=list)
    atlas_condition_ids: list[str] = Field(default_factory=list)
    signed_by: str | None = None
    signed_at: datetime | None = None
    license_no: str | None = None
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


_MODALITY_AR = {
    "CT": "تصوير مقطعي محوسب",
    "MR": "تصوير بالرنين المغناطيسي",
    "CR": "أشعة سينية رقمية",
    "DR": "أشعة سينية رقمية مباشرة",
    "US": "تصوير بالموجات فوق الصوتية",
    "MG": "تصوير الثدي الشعاعي",
    "NM": "تصوير طبّ نووي",
    "PT": "تصوير مقطعي بالإصدار البوزيتروني",
}

_BODY_PART_AR = {
    "BRAIN": "الدماغ",
    "HEAD": "الرأس",
    "CHEST": "الصدر",
    "THORAX": "الصدر",
    "ABDOMEN": "البطن",
    "PELVIS": "الحوض",
    "SPINE": "العمود الفقري",
    "MSK": "الجهاز العضلي الهيكلي",
    "KIDNEY": "الكليتين",
    "LIVER": "الكبد",
}


def _technique_ar(modality: str, body_part: str) -> str:
    m = _MODALITY_AR.get(modality.upper(), modality)
    b = _BODY_PART_AR.get(body_part.upper(), body_part)
    return f"{m} لـ{b} بدون تباين."


def _extract_from_agent(outputs: list[AgentOutput], agent: str, key: str) -> object | None:
    for o in outputs:
        if o.agent == agent and o.ok and isinstance(o.data, dict) and key in o.data:
            return o.data[key]
    return None


def _pick_impression(aggregate: AggregateResponse, outputs: list[AgentOutput]) -> str:
    clinical = _extract_from_agent(outputs, "clinical_llm", "impression")
    if isinstance(clinical, str) and clinical.strip():
        return clinical.strip()

    ranked = sorted(
        (o for o in outputs if o.ok and o.summary),
        key=lambda o: o.confidence or 0.0,
        reverse=True,
    )
    if ranked:
        return ranked[0].summary or ""

    if aggregate.findings:
        return aggregate.findings[0].text

    return "لا انطباع محدّد — يستدعي مراجعة الطبيب."


def _pick_recommendations(outputs: list[AgentOutput]) -> list[str]:
    recs = _extract_from_agent(outputs, "clinical_llm", "recommendations")
    if isinstance(recs, list):
        return [str(r).strip() for r in recs if str(r).strip()]
    return []


def _findings_block(aggregate: AggregateResponse, outputs: list[AgentOutput]) -> str:
    if aggregate.findings:
        return "\n".join(f"• {f.text}" for f in aggregate.findings if f.text)

    vis = _extract_from_agent(outputs, "vision_ai", "findings")
    if isinstance(vis, list) and vis:
        return "\n".join(f"• {x!s}" for x in vis)

    return "لم يُكتشف أي شذوذ يستدعي الإبلاغ."


def _patient_block(study: StudyMetadata) -> str:
    name = study.patient_name or "—"
    pid = study.patient_id or "—"
    parts = [f"الاسم: {name}", f"رقم المريض: {pid}"]
    if study.clinical_context:
        parts.append(f"السياق الإكلينيكي: {study.clinical_context}")
    return "\n".join(parts)


def generate_from_aggregate(
    study: StudyMetadata,
    aggregate: AggregateResponse,
    outputs: list[AgentOutput],
) -> FinalReport:
    """Build the initial draft report from AI outputs.
    Radiologist can then edit each section before signing."""
    impression = _pick_impression(aggregate, outputs)
    recommendations = _pick_recommendations(outputs)
    findings_text = _findings_block(aggregate, outputs)

    sections = [
        ReportSection(
            key="patient",
            title_ar="بيانات المريض",
            content_ar=_patient_block(study),
            editable=False,
        ),
        ReportSection(
            key="technique",
            title_ar="تقنية الفحص",
            content_ar=_technique_ar(study.modality, study.body_part),
            editable=True,
        ),
        ReportSection(
            key="findings",
            title_ar="الموجودات",
            content_ar=findings_text,
            editable=True,
        ),
        ReportSection(
            key="impression",
            title_ar="الانطباع",
            content_ar=impression,
            editable=True,
        ),
        ReportSection(
            key="recommendations",
            title_ar="التوصيات",
            content_ar=(
                "\n".join(f"• {r}" for r in recommendations)
                if recommendations
                else "لا توصيات محدّدة."
            ),
            editable=True,
        ),
    ]

    return FinalReport(
        study_uid=study.study_uid,
        patient_id=study.patient_id,
        patient_name=study.patient_name,
        hospital_id=study.hospital_id or "default",
        modality=study.modality,
        body_part=study.body_part,
        sections=sections,
        impression_ar=impression,
        recommendations_ar=recommendations,
        atlas_condition_ids=[f"{s.organ}:{s.condition_id}" for s in aggregate.atlas_suggestions],
    )


class SignRequest(BaseModel):
    report: FinalReport
    signed_by: str
    license_no: str


def sign_report(req: SignRequest) -> FinalReport:
    """Stamp the report with signer + timestamp."""
    r = req.report.model_copy(deep=True)
    r.signed_by = req.signed_by
    r.license_no = req.license_no
    r.signed_at = datetime.now(UTC)
    return r


class GenerateRequest(BaseModel):
    study: StudyMetadata
    aggregate: AggregateResponse
    outputs: list[AgentOutput]
