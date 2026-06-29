"""LLM stub بقالب Jinja2 — يحلّ محلّ AceGPT-13B في الـ prototype."""
from __future__ import annotations

import re
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

PROMPTS = Path(__file__).resolve().parent.parent / "prompts"
_env = Environment(
    loader=FileSystemLoader(str(PROMPTS)),
    autoescape=select_autoescape(disabled_extensions=("j2",)),
    trim_blocks=True,
    lstrip_blocks=True,
)
_template = _env.get_template("report_template.j2")

BODY_PART_AR = {
    "BRAIN": "الدماغ",
    "HEAD": "الرأس",
    "CHEST": "الصدر",
    "ABDOMEN": "البطن",
    "PELVIS": "الحوض",
    "SPINE": "العمود الفقري",
    "KNEE": "الركبة",
    "SHOULDER": "الكتف",
}


def render_draft(
    *,
    body_part: str | None,
    ai_label: str,
    ai_confidence: float,
    ai_measurements: dict,
    patient_age: int | None,
    patient_sex: str | None,
    clinical_indication: str | None,
    modality: str | None = None,
) -> dict[str, str]:
    body_part_ar = BODY_PART_AR.get((body_part or "").upper(), "العضو")
    # للـ modalities غير المدعومة → نُرجع قالباً مفتوحاً للطبيب
    mod = (modality or "").upper()
    if ai_label == "routine_review" or ai_label in {"no_ai_available", "ai_not_supported"}:
        modality_ar = {
            "CT": "أشعة مقطعية",
            "MR": "رنين مغناطيسي",
            "CR": "أشعة سينية",
            "DR": "أشعة سينية رقمية",
            "US": "موجات صوتية",
            "MG": "ماموجرام",
        }.get(mod, "فحص أشعة")
        return {
            "technique_ar": f"أُجري للمريض فحص {modality_ar} على {body_part_ar}{f' في وضعية متعددة' if mod == 'MR' else ''}.",
            "findings_ar": (
                "النموذج التجريبي للذكاء الاصطناعي مُحسَّن حالياً لـ CT دماغ فقط، "
                f"ولم تُجرَ قياسات تلقائية لهذا الفحص ({modality_ar} / {body_part_ar}).\n"
                "يحتاج الطبيب لقراءة الفحص يدوياً ووصف النتائج هنا."
            ),
            "impression_ar": "يحتاج تفسير الطبيب — لم يتوفّر تحليل AI متخصص لهذه الـ modality في النموذج التجريبي.",
            "recommendations_ar": (
                "- إكمال القراءة الإكلينيكية يدوياً\n"
                "- ربط النتائج بالتاريخ الطبي والأعراض\n"
                "- متابعة حسب التقييم السريري"
            ),
            "icd11_codes": [],
        }

    text = _template.render(
        body_part_ar=body_part_ar,
        ai_label=ai_label,
        ai_confidence=ai_confidence,
        ai_measurements=ai_measurements,
        patient_age=patient_age,
        patient_sex=patient_sex,
        clinical_indication=clinical_indication,
    )

    sections = _split_sections(text)
    icd11 = _extract_icd11(sections.get("الانطباع", ""))
    return {
        "technique_ar": sections.get("التقنية المستخدمة", "").strip(),
        "findings_ar": sections.get("النتائج", "").strip(),
        "impression_ar": sections.get("الانطباع", "").strip(),
        "recommendations_ar": sections.get("التوصيات", "").strip(),
        "icd11_codes": icd11,
    }


def render_from_vision(
    *,
    vision: dict,
    body_part: str | None,
    modality: str | None,
    patient_age: int | None,
    patient_sex: str | None,
    clinical_indication: str | None,
) -> dict[str, str]:
    """يبني تقرير راديولوجي احترافي من نتيجة Vision AI الحقيقية."""
    body_part_ar = BODY_PART_AR.get((body_part or "").upper(), body_part or "العضو")
    modality_ar = {
        "CT": "أشعة مقطعية محورية",
        "MR": "تصوير بالرنين المغناطيسي",
        "CR": "أشعة سينية رقمية",
        "DR": "أشعة سينية رقمية",
        "US": "موجات فوق صوتية",
        "MG": "ماموجرام",
        "XA": "تصوير وعائي",
        "NM": "تصوير طب نووي",
        "PT": "تصوير مقطعي بإصدار البوزيترون",
    }.get((modality or "").upper(), "فحص أشعة")

    technique = (
        f"أُجري للمريض فحص {modality_ar} على {body_part_ar}."
        + (f"\nالعمر: {patient_age} سنة." if patient_age else "")
        + (f"\nالجنس: {'ذكر' if patient_sex == 'M' else 'أنثى' if patient_sex == 'F' else 'غير محدد'}." if patient_sex else "")
        + (f"\nالمؤشرات الإكلينيكية: {clinical_indication}." if clinical_indication else "")
    )

    findings = (vision.get("findings") or "").strip()
    impression = (vision.get("impression") or "").strip()
    recommendations = (vision.get("recommendations") or "").strip()
    measurements = vision.get("measurements") or {}
    severity = vision.get("severity") or "unspecified"
    icd11_sug = vision.get("icd11_suggestion") or ""
    confidence = vision.get("confidence")

    # إذا findings/impression إنجليزية → نضيف ترجمة مختصرة + النص الأصلي
    findings_block = findings or "لم يقدّم تحليل AI نتائج واضحة لهذا الفحص."
    if measurements:
        ms_lines = []
        for k, v in measurements.items():
            ms_lines.append(f"• {k}: {v}")
        findings_block += "\n\nالقياسات المُستخرجة:\n" + "\n".join(ms_lines)
    if severity != "unspecified":
        sev_ar = {
            "normal": "طبيعي",
            "mild": "خفيف",
            "moderate": "متوسط",
            "severe": "شديد",
            "critical": "حرج",
        }.get(severity, severity)
        findings_block += f"\n\nالشدة: {sev_ar}"

    impression_block = impression or "يحتاج تفسير الطبيب."
    if icd11_sug:
        impression_block += f"\n\n**ICD-11 المقترح:** {icd11_sug}"
    if confidence is not None:
        try:
            conf_pct = float(confidence) * 100
            impression_block += f"\n\n_ثقة AI: {conf_pct:.0f}%_"
            if conf_pct < 70:
                impression_block += " — يحتاج مراجعة دقيقة من الطبيب."
        except Exception:
            pass

    rec_block = recommendations or "متابعة حسب التقييم السريري."

    icd11 = _extract_icd11(icd11_sug + " " + impression_block)
    return {
        "technique_ar": technique.strip(),
        "findings_ar": findings_block.strip(),
        "impression_ar": impression_block.strip(),
        "recommendations_ar": rec_block.strip(),
        "icd11_codes": icd11,
    }


def _split_sections(text: str) -> dict[str, str]:
    parts: dict[str, str] = {}
    current = None
    buf: list[str] = []
    for line in text.splitlines():
        m = re.match(r"^##\s+(.+?)\s*$", line)
        if m:
            if current is not None:
                parts[current] = "\n".join(buf).strip()
            current = m.group(1).strip()
            buf = []
        else:
            buf.append(line)
    if current is not None:
        parts[current] = "\n".join(buf).strip()
    return parts


def _extract_icd11(impression: str) -> list[str]:
    codes = re.findall(r"\b([0-9][A-Z][0-9A-Z]{2}(?:\.[0-9A-Z]+)?)\b", impression)
    return list(dict.fromkeys(codes))
