# This file's content is APPENDED to main.py by the deploy script.
# Kept as its own file for clean editing.

from __future__ import annotations

import json
from pydantic import BaseModel

# NOTE: symbols used here (_call_naraya_sync, NARAYA_MODEL_*, redact, audit, app)
# already exist at the bottom of main.py's module scope after this file is appended.


# ============================================================
# Templates library + Smart Report + Translate
# ============================================================


@app.get("/templates/index")  # type: ignore[name-defined]
def templates_index() -> dict:
    """Return count/modalities summary for the template library."""
    from .templates_lib import get_index, list_modalities

    idx = get_index()
    return {
        "ok": True,
        "count": idx["count"],
        "extracted_ok": idx["extracted_ok"],
        "extracted_fail": idx["extracted_fail"],
        "modalities": list_modalities(),
    }


@app.get("/templates/browse")  # type: ignore[name-defined]
def templates_browse(modality: str = "", region: str = "") -> dict:
    from .templates_lib import browse

    return {"ok": True, "items": browse(modality or None, region or None)}


@app.get("/templates/search")  # type: ignore[name-defined]
def templates_search(q: str = "", modality: str = "", body_part: str = "", limit: int = 20) -> dict:
    from .templates_lib import search

    return {"ok": True, "items": search(q, modality, body_part, min(limit, 60))}


@app.get("/templates/{tid}")  # type: ignore[name-defined]
def templates_get(tid: str) -> dict:
    from .templates_lib import get_template

    t = get_template(tid)
    if not t:
        return {"ok": False, "error": "not found"}
    return {"ok": True, "template": t}


class SmartReportRequest(BaseModel):
    study_uid: str = ""
    modality: str = ""
    body_part: str = ""
    findings: str = ""
    symptoms: str = ""
    clinical_history: str = ""
    patient_age: int | None = None
    patient_sex: str | None = None
    template_id: str | None = None
    include_normals: bool = False


SMART_REPORT_SYSTEM = (
    "You are a senior consultant radiologist writing a final diagnostic report in "
    "CLINICAL ENGLISH ONLY. Never respond in Arabic or any other language.\n\n"
    "You are given: (a) a reference NORMAL template for the modality/region, (b) up "
    "to 3 reference PATHOLOGY templates that describe the closest matching "
    "conditions, and (c) the current case findings + symptoms + patient context.\n\n"
    "TASK: Produce a focused, publication-quality radiology report that STRIPS every "
    "purely-normal sentence and keeps ONLY (i) the technical/scan-parameters preamble "
    "and (ii) sentences describing the actual pathology or abnormal finding. Use the "
    "pathology templates as stylistic scaffolding — never copy verbatim if the "
    "finding is different.\n\n"
    "OUTPUT STRICT JSON only (no markdown, no prose outside JSON):\n"
    "{\n"
    '  "title": "e.g. MRI Brain - Focused Report",\n'
    '  "technique": "1-2 sentence scan technique paragraph (English)",\n'
    '  "clinical_indication": "1 sentence from symptoms + history (English)",\n'
    '  "findings_focused": "the abnormal-only findings paragraph (English, 60-220 words)",\n'
    '  "impression": [ "concise impression bullets, ranked by clinical priority" ],\n'
    '  "recommendations": [ "next steps or follow-up imaging, up to 5" ],\n'
    '  "confidence": 0.0-1.0,\n'
    '  "template_used": "filename of the primary template borrowed",\n'
    '  "normal_sentences_removed": <integer count>,\n'
    '  "language": "en"\n'
    "}\n\n"
    "RULES:\n"
    "1. English only. Ignore any Arabic in the inputs (translate mentally).\n"
    "2. Do not include hedging like 'clinical correlation is recommended'.\n"
    "3. If findings are empty, produce a brief normal-report style body.\n"
    "4. Never invent findings not present in the input.\n"
    "5. Impression bullets = differential-safe conclusions with confidence hints.\n"
)


def _re_first_json(txt: str) -> dict | None:
    depth = 0
    start = -1
    for i, ch in enumerate(txt):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                try:
                    return json.loads(txt[start : i + 1])
                except Exception:
                    start = -1
    return None


@app.post("/ai/smart-report")  # type: ignore[name-defined]
async def ai_smart_report(req: SmartReportRequest) -> dict:
    """Generate a focused radiology report using the templates library."""
    import asyncio as _asyncio
    import time as _time

    from .templates_lib import get_template, search, browse

    modality = (req.modality or "").strip()
    body = (req.body_part or "").strip()
    findings = redact(req.findings or "").text  # type: ignore[name-defined]
    symptoms = redact(req.symptoms or "").text  # type: ignore[name-defined]
    history = redact(req.clinical_history or "").text  # type: ignore[name-defined]

    normal_refs = [b for b in browse(modality or None, body or None) if b["is_normal"]]
    normal_ref = None
    if normal_refs:
        n = get_template(normal_refs[0]["id"])
        if n and n.get("text"):
            normal_ref = {"filename": n["filename"], "text": n["text"][:5000]}

    query = " ".join([findings[:400], symptoms[:200]]).strip() or (body or "")
    picked: list[dict] = []
    if req.template_id:
        t = get_template(req.template_id)
        if t and t.get("text"):
            picked.append({"id": t["id"], "filename": t["filename"], "text": t["text"][:5000]})
    for cand in search(query, modality=modality, body_part=body, limit=6):
        if len(picked) >= 3:
            break
        if cand["is_normal"]:
            continue
        t = get_template(cand["id"])
        if t and t.get("text"):
            picked.append(
                {"id": t["id"], "filename": t["filename"], "text": t["text"][:5000]}
            )

    age_str = f"{req.patient_age}" if req.patient_age else "unknown"
    context = (
        f"CASE\n----\n"
        f"Modality: {modality or '?'}  |  Region: {body or '?'}\n"
        f"Patient: age={age_str}  sex={req.patient_sex or 'unknown'}\n"
        f"Symptoms: {symptoms or '(none)'}\n"
        f"Clinical history: {history or '(none)'}\n"
        f"Findings dictated: {findings or '(none)'}\n\n"
        f"NORMAL TEMPLATE (structural bones - do NOT copy normal sentences into output):\n"
        f"[{(normal_ref or {}).get('filename', 'n/a')}]\n"
        f"{(normal_ref or {}).get('text', '(no normal reference available)')}\n\n"
        f"PATHOLOGY REFERENCES (pick style/vocabulary, do not blindly copy):\n"
    )
    for p in picked:
        context += f"\n[{p['filename']}]\n{p['text']}\n"
    context += "\nProduce the JSON report now. English only."

    t0 = _time.perf_counter()
    try:
        raw = await _asyncio.to_thread(
            _call_naraya_sync,  # type: ignore[name-defined]
            SMART_REPORT_SYSTEM,
            context,
            60.0,
            NARAYA_MODEL_IMPRESSION,  # type: ignore[name-defined]
            1400,
            0.0,
        )
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}
    latency_ms = int((_time.perf_counter() - t0) * 1000)

    txt = raw.strip()
    if txt.startswith("```"):
        txt = txt.strip("`").strip()
        if txt.startswith("json"):
            txt = txt[4:].strip()
    try:
        parsed = json.loads(txt)
    except json.JSONDecodeError:
        m = _re_first_json(txt)
        parsed = m if m else {
            "title": f"{modality} {body} - Report",
            "technique": "",
            "clinical_indication": symptoms[:200],
            "findings_focused": txt[:1500],
            "impression": [],
            "recommendations": [],
            "confidence": 0.5,
            "template_used": picked[0]["filename"] if picked else "",
            "normal_sentences_removed": 0,
            "language": "en",
            "parse_error": True,
        }

    audit(  # type: ignore[name-defined]
        action="ai.smart_report",
        tenant="default",
        target={"type": "study", "id": req.study_uid or "adhoc"},
        meta={"latency_ms": latency_ms, "templates_used": len(picked)},
    )
    return {
        "ok": True,
        "latency_ms": latency_ms,
        "templates_used": [p["filename"] for p in picked],
        "normal_reference": (normal_ref or {}).get("filename"),
        **parsed,
    }


class TranslateRequest(BaseModel):
    text: str
    target: str = "ar"
    domain: str = "medical"


@app.post("/ai/translate")  # type: ignore[name-defined]
async def ai_translate(req: TranslateRequest) -> dict:
    """Translate arbitrary text on demand — used by the Translate buttons on AI panels."""
    import asyncio as _asyncio
    import time as _time

    text = (req.text or "").strip()
    if not text:
        return {"ok": False, "error": "empty text"}

    tgt = "Arabic (Modern Standard)" if req.target == "ar" else "English"
    system = (
        f"You are a bilingual medical translator. Translate the user's text to {tgt}, "
        f"preserving medical terminology precisely. Keep radiology terms idiomatic. "
        f"Return the translation ONLY - no prose, no disclaimers, no notes."
    )
    t0 = _time.perf_counter()
    try:
        out = await _asyncio.to_thread(
            _call_naraya_sync,  # type: ignore[name-defined]
            system,
            text[:6000],
            25.0,
            NARAYA_MODEL_COMPARE,  # type: ignore[name-defined]
            1200,
            0.0,
        )
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}
    return {
        "ok": True,
        "text": out.strip(),
        "latency_ms": int((_time.perf_counter() - t0) * 1000),
        "target": req.target,
    }
