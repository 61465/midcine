"""Match AI agent outputs to midcine pathology-atlas conditions.

Given a list of AgentOutput and optional study body_part, scans summaries +
findings + data fields for keywords tied to each atlas condition, then returns
ranked AtlasSuggestion list.

Design goals:
  - Zero model dependency — pure keyword scan, fast, deterministic.
  - Arabic + English keywords both supported (agents may reply in either).
  - Confidence blends: match count, agent count, and body-part relevance boost.
  - Never fabricate — a suggestion only appears if at least one keyword matched.
"""

from __future__ import annotations

import re

from .schemas import AgentOutput, AtlasSuggestion

# ─────────────────────────────────────────────────────────────────────────────
# Keyword map — kept in sync with apps/web/app/_components/anatomy/**/presets.ts
# Format: organ → condition_id → (label_ar, label_en, [keywords])
# ─────────────────────────────────────────────────────────────────────────────

_CONDITIONS: dict[str, dict[str, tuple[str, str, list[str]]]] = {
    "heart": {
        "stemi": (
            "احتشاء ST مرتفع",
            "STEMI",
            [
                "stemi",
                "احتشاء",
                "infarct",
                "st elevation",
                "st-elevation",
                "myocardial infarct",
                "ischemic",
                "anterior wall",
                "قلب حاد",
                "انسداد شريان تاجي",
                "acute mi",
            ],
        ),
        "afib": (
            "رجفان أذيني",
            "Atrial Fibrillation",
            ["afib", "atrial fibrillation", "رجفان أذيني", "irregular rhythm", "fibrillation"],
        ),
        "tachycardia": (
            "تسرّع نبض",
            "Tachycardia",
            ["tachycardia", "تسرّع نبض", "تسارع القلب", "elevated heart rate"],
        ),
        "bradycardia": (
            "بطء نبض",
            "Bradycardia",
            ["bradycardia", "بطء نبض", "بطء القلب", "low heart rate"],
        ),
    },
    "lungs": {
        "pneumonia": (
            "التهاب رئوي",
            "Pneumonia",
            [
                "pneumonia",
                "التهاب رئوي",
                "consolidation",
                "ارتشاح",
                "lobar consolidation",
                "opacity",
                "opacification",
                "air-bronchogram",
                "التهاب",
            ],
        ),
        "copd": (
            "انسداد رئوي مزمن",
            "COPD",
            ["copd", "انسداد رئوي مزمن", "emphysema", "hyperinflation", "chronic obstructive"],
        ),
        "pe": (
            "انسداد رئوي",
            "Pulmonary Embolism",
            ["pulmonary embolism", "انسداد رئوي", "pulmonary emb", "pe ", "filling defect", "clot"],
        ),
        "tachypnea": (
            "تسرّع تنفّس",
            "Tachypnea",
            ["tachypnea", "تسرّع تنفّس", "increased respiratory rate"],
        ),
        "bradypnea": (
            "بطء تنفّس",
            "Bradypnea",
            ["bradypnea", "بطء تنفّس", "hypoventilation"],
        ),
    },
    "brain": {
        "stroke_l": (
            "سكتة يسرى",
            "Left MCA Stroke",
            [
                "left mca",
                "left middle cerebral",
                "سكتة يسرى",
                "left hemispheric",
                "left-sided stroke",
                "left hemisphere infarct",
                "الجانب الأيسر",
            ],
        ),
        "stroke_r": (
            "سكتة يمنى",
            "Right MCA Stroke",
            [
                "right mca",
                "right middle cerebral",
                "سكتة يمنى",
                "right hemispheric",
                "right-sided stroke",
                "right hemisphere infarct",
                "الجانب الأيمن",
            ],
        ),
        "seizure": (
            "نوبة صرع",
            "Seizure",
            ["seizure", "صرع", "epilep", "convulsion", "نوبة"],
        ),
        "coma": (
            "غيبوبة",
            "Coma",
            ["coma", "غيبوبة", "unresponsive", "gcs 3", "obtunded"],
        ),
    },
    "kidney": {
        "aki": (
            "إصابة كلوية حادة",
            "Acute Kidney Injury",
            ["aki", "acute kidney injury", "إصابة كلوية حادة", "acute renal failure"],
        ),
        "ckd3": (
            "قصور كلوي مزمن ٣",
            "CKD Stage 3",
            ["ckd 3", "ckd stage 3", "قصور كلوي مزمن ٣", "chronic kidney"],
        ),
        "ckd5": (
            "قصور كلوي ٥",  # noqa: RUF001
            "CKD Stage 5",
            [
                "ckd 5",
                "ckd stage 5",
                "esrd",
                "end-stage renal",
                "قصور كلوي ٥",  # noqa: RUF001
                "مرحلة نهائية",
            ],
        ),
        "stones": (
            "حصوات كلوية",
            "Renal Stones",
            [
                "renal stones",
                "kidney stones",
                "حصوات كلوية",
                "calculi",
                "nephrolithiasis",
                "ureteric stone",
                "urolithiasis",
            ],
        ),
    },
}

# body_part → organ preference (weights confidence)
_BODY_PART_PREFERENCE: dict[str, str] = {
    "BRAIN": "brain",
    "HEAD": "brain",
    "SKULL": "brain",
    "CHEST": "lungs",
    "THORAX": "lungs",
    "LUNG": "lungs",
    "HEART": "heart",
    "CARDIAC": "heart",
    "ABDOMEN": "kidney",
    "KIDNEY": "kidney",
    "PELVIS": "kidney",
    "URINARY": "kidney",
}


def _extract_text(output: AgentOutput) -> str:
    """Concatenate everything we can scan from an agent output."""
    parts: list[str] = []
    if output.summary:
        parts.append(output.summary)
    if output.error:
        parts.append(output.error)
    if isinstance(output.data, dict):
        for v in output.data.values():
            if isinstance(v, str):
                parts.append(v)
            elif isinstance(v, list):
                parts.extend(str(x) for x in v)
            elif v is not None:
                parts.append(str(v))
    return " ".join(parts).lower()


def suggest_conditions(
    outputs: list[AgentOutput],
    body_part: str | None = None,
) -> list[AtlasSuggestion]:
    """Return atlas suggestions ranked by combined match strength.

    Confidence = clamp(base_score / max_possible, 0, 1) where:
      base_score = 0.3 * matched_keywords + 0.4 * matched_agents + 0.3 * conf_avg
      matched_keywords is capped at 5 to avoid keyword-spam boosting one term.
    A body-part preference multiplies confidence by 1.15 (capped 1.0).
    """
    preferred_organ = None
    if body_part:
        preferred_organ = _BODY_PART_PREFERENCE.get(body_part.strip().upper())

    suggestions: list[AtlasSuggestion] = []
    if not outputs:
        return suggestions

    for organ, conditions in _CONDITIONS.items():
        for cid, (label_ar, label_en, keywords) in conditions.items():
            matched_keywords: list[str] = []
            matched_agents: list[str] = []
            per_agent_conf: list[float] = []

            for output in outputs:
                if not output.ok:
                    continue
                text = _extract_text(output)
                if not text:
                    continue
                found_here: list[str] = []
                for kw in keywords:
                    if re.search(r"\b" + re.escape(kw.lower()) + r"\b", text):
                        found_here.append(kw)
                if found_here:
                    matched_agents.append(output.agent)
                    matched_keywords.extend(found_here)
                    if output.confidence is not None:
                        per_agent_conf.append(output.confidence)

            if not matched_agents:
                continue

            kw_score = min(len(set(matched_keywords)), 5) / 5.0
            agent_score = min(len(matched_agents), 3) / 3.0
            conf_score = sum(per_agent_conf) / len(per_agent_conf) if per_agent_conf else 0.5
            base = 0.3 * kw_score + 0.4 * agent_score + 0.3 * conf_score

            if preferred_organ and organ == preferred_organ:
                base = min(1.0, base * 1.15)

            suggestions.append(
                AtlasSuggestion(
                    organ=organ,  # type: ignore[arg-type]
                    condition_id=cid,
                    label_ar=label_ar,
                    label_en=label_en,
                    confidence=round(base, 3),
                    matched_keywords=sorted(set(matched_keywords))[:8],
                    agents=matched_agents,
                )
            )

    suggestions.sort(key=lambda s: s.confidence, reverse=True)
    return suggestions[:6]
