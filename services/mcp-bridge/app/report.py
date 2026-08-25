"""Radiology report generation from AI pipeline output.

Turns the aggregate + per-agent outputs into a structured Arabic report ready
for the radiologist to edit and sign.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field

from .schemas import AgentOutput, AggregateResponse, StudyMetadata


# ---- Arabic → Latin transliteration (deterministic, offline) ----------------

_ARABIC_RE = re.compile(r"[؀-ۿݐ-ݿࢠ-ࣿ]")

# Basic character map — covers Arabic letters + diacritics.
_TRANSLIT_MAP = {
    "ا": "a", "أ": "a", "إ": "i", "آ": "aa", "ء": "", "ى": "a", "ئ": "y",
    "ؤ": "w", "ب": "b", "ت": "t", "ة": "a", "ث": "th", "ج": "j", "ح": "h",
    "خ": "kh", "د": "d", "ذ": "dh", "ر": "r", "ز": "z", "س": "s", "ش": "sh",
    "ص": "s", "ض": "d", "ط": "t", "ظ": "z", "ع": "a", "غ": "gh", "ف": "f",
    "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "و": "w",
    "ي": "y", "ﻻ": "la", "ﻷ": "la", "ﻹ": "li",
    # diacritics — drop them
    "َ": "", "ً": "", "ُ": "", "ٌ": "", "ِ": "", "ٍ": "", "ْ": "", "ّ": "",
    "ـ": "", "،": ",", "؛": ";", "؟": "?", "«": "\"", "»": "\"",
    # digits
    "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
    "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
}


def transliterate_arabic(text: str) -> str:
    """Convert Arabic to Latin. Non-Arabic characters are passed through.
    Deterministic (no LLM), fast, safe for names + short fields."""
    if not text or not _ARABIC_RE.search(text):
        return text
    out: list[str] = []
    for ch in text:
        if ch in _TRANSLIT_MAP:
            out.append(_TRANSLIT_MAP[ch])
        else:
            out.append(ch)
    result = "".join(out)
    # Capitalize word-initial letters (better for names)
    result = " ".join(w[:1].upper() + w[1:] if w else w for w in result.split(" "))
    # Strip stray apostrophes at word boundaries
    result = re.sub(r"^'|'$", "", result)
    result = re.sub(r"\s+", " ", result).strip()
    return result


def strip_arabic(text: str) -> str:
    """Transliterate Arabic content in text. Used as a final safety net for
    any AI output that leaks Arabic despite English enforcement."""
    return transliterate_arabic(text)


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


_MODALITY_EN = {
    "CT": "Computed tomography",
    "MR": "Magnetic resonance imaging",
    "MRI": "Magnetic resonance imaging",
    "CR": "Digital radiography",
    "DR": "Digital radiography",
    "US": "Ultrasound",
    "MG": "Mammography",
    "NM": "Nuclear medicine imaging",
    "PT": "Positron emission tomography",
    "PET": "Positron emission tomography",
}

_BODY_PART_EN = {
    "BRAIN": "the brain",
    "HEAD": "the head",
    "CHEST": "the chest",
    "THORAX": "the chest",
    "ABDOMEN": "the abdomen",
    "PELVIS": "the pelvis",
    "SPINE": "the spine",
    "LUMBAR": "the lumbar spine",
    "CERVICAL": "the cervical spine",
    "MSK": "the musculoskeletal system",
    "KIDNEY": "the kidneys",
    "LIVER": "the liver",
    "HEART": "the heart",
    "KNEE": "the knee",
    "HIP": "the hip",
    "SHOULDER": "the shoulder",
    "NECK": "the neck",
    "BREAST": "the breast",
}


def _technique_ar(modality: str, body_part: str) -> str:
    """Kept the '_ar' name for wire compat, but returns English."""
    m = _MODALITY_EN.get(modality.upper(), modality)
    b = _BODY_PART_EN.get(body_part.upper(), body_part.lower() if body_part else "the region")
    return f"{m} of {b} without contrast."


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

    return "No specific impression — radiologist review required."


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

    return "No abnormality requiring reporting was detected."


def _patient_block(study: StudyMetadata) -> str:
    name = transliterate_arabic(study.patient_name or "—")
    pid = transliterate_arabic(study.patient_id or "—")
    parts = [f"Name: {name}", f"Patient ID: {pid}"]
    if study.clinical_context:
        parts.append(f"Clinical context: {transliterate_arabic(study.clinical_context)}")
    return "\n".join(parts)


def generate_from_aggregate(
    study: StudyMetadata,
    aggregate: AggregateResponse,
    outputs: list[AgentOutput],
) -> FinalReport:
    """Build the initial draft report from AI outputs.
    Radiologist can then edit each section before signing."""
    impression = strip_arabic(_pick_impression(aggregate, outputs))
    recommendations = [strip_arabic(r) for r in _pick_recommendations(outputs)]
    findings_text = strip_arabic(_findings_block(aggregate, outputs))

    sections = [
        ReportSection(
            key="patient",
            title_ar="Patient",
            content_ar=_patient_block(study),
            editable=False,
        ),
        ReportSection(
            key="technique",
            title_ar="Technique",
            content_ar=_technique_ar(study.modality, study.body_part),
            editable=True,
        ),
        ReportSection(
            key="findings",
            title_ar="Findings",
            content_ar=findings_text,
            editable=True,
        ),
        ReportSection(
            key="impression",
            title_ar="Impression",
            content_ar=impression,
            editable=True,
        ),
        ReportSection(
            key="recommendations",
            title_ar="Recommendations",
            content_ar=(
                "\n".join(f"• {r}" for r in recommendations)
                if recommendations
                else "No specific recommendations."
            ),
            editable=True,
        ),
    ]

    return FinalReport(
        study_uid=study.study_uid,
        patient_id=transliterate_arabic(study.patient_id or ""),
        patient_name=transliterate_arabic(study.patient_name or ""),
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
