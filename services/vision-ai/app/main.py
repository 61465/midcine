"""Vision AI Service — يستخدم Ollama + moondream (multimodal مجاني محلي).

الـ pipeline:
1. يأخذ instance_uris من MinIO (DICOM)
2. يختار key slice ويعمل windowing حسب modality
3. يحوّل لـ PNG base64
4. يستدعي Ollama vision API بـ prompt راديولوجي بنيوي
5. يرجع JSON بـ measurements + findings + impression
"""
from __future__ import annotations

import base64
import io
import json
import logging
import os
import re
import time
from typing import Any

import httpx
import numpy as np
import pydicom
from fastapi import FastAPI, HTTPException
from minio import Minio
from PIL import Image
from pydantic import BaseModel

log = logging.getLogger("vision-ai")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://ollama:11434")
VISION_MODEL = os.environ.get("VISION_MODEL", "moondream")
TEXT_MODEL = os.environ.get("TEXT_MODEL", "qwen2.5:3b-instruct-q4_K_M")
MINIO_ENDPOINT = os.environ.get("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.environ.get("MINIO_ACCESS_KEY", "midcine-dev")
MINIO_SECRET_KEY = os.environ.get("MINIO_SECRET_KEY", "midcine-dev-secret-change-me")

# windowing presets لكل modality (WC, WW)
WINDOW_BY_MODALITY = {
    ("CT", "BRAIN"): (40, 80),
    ("CT", "HEAD"): (40, 80),
    ("CT", "CHEST"): (-600, 1500),
    ("CT", "LUNG"): (-600, 1500),
    ("CT", "ABDOMEN"): (40, 400),
    ("CT", "BONE"): (300, 1500),
    ("CT", "SPINE"): (300, 1500),
    ("CT", ""): (40, 400),
    ("MR", ""): (None, None),  # auto
    ("CR", ""): (None, None),
    ("DR", ""): (None, None),
}

# Prompt مختصر لـ moondream (نموذج صغير، يفضّل البساطة)
VISION_PROMPT = """You are a radiologist. Describe what you see in this {modality} image of {body_part}.
Be specific about anatomy, abnormalities, and any visible measurements.
Focus on observable findings only."""

# Prompt للـ qwen يصيغ JSON عربي راديولوجي من وصف moondream
STRUCTURE_PROMPT = """أنت طبيب أشعة عربي. اقرأ الأوصاف الإنجليزية التالية لصور أشعة وحوّلها إلى تقرير عربي راديولوجي رسمي بصيغة JSON.

نوع الفحص: {modality_ar} على {body_part_ar}
المؤشرات السريرية: {indication}

أوصاف Vision AI (إنجليزية) من 3 شرائح:
{vision_descriptions}

أنتج JSON واحد بهذه الحقول بالضبط:
{{
  "findings_ar": "النتائج الراديولوجية بالعربية الفصحى الطبية، فقرة مفصّلة تصف ما يُرى في الصور",
  "impression_ar": "الانطباع الإكلينيكي والتشخيص الأرجح بالعربية، 2-3 جمل",
  "recommendations_ar": "التوصيات السريرية بالعربية، نقاط مرقمة",
  "measurements": {{"key": "value"}},
  "severity": "normal|mild|moderate|severe|critical",
  "icd11_suggestion": "رمز ICD-11 إن أمكن",
  "confidence": 0.0-1.0
}}

اكتب JSON فقط، بدون أي نص آخر. استخدم اللغة العربية الطبية الفصحى."""


def _mc() -> Minio:
    return Minio(MINIO_ENDPOINT, access_key=MINIO_ACCESS_KEY, secret_key=MINIO_SECRET_KEY, secure=False)


def _fetch(uri: str) -> bytes:
    assert uri.startswith("s3://")
    bucket, _, key = uri[5:].partition("/")
    resp = _mc().get_object(bucket, key)
    try:
        return resp.read()
    finally:
        resp.close()
        resp.release_conn()


def _window_pixels(arr: np.ndarray, wc: float | None, ww: float | None) -> np.ndarray:
    """يطبّق window/level على pixels."""
    if wc is None or ww is None:
        # auto-window: 1-99 percentile
        lo, hi = np.percentile(arr, [1, 99])
    else:
        lo, hi = wc - ww / 2, wc + ww / 2
    clipped = np.clip(arr, lo, hi)
    norm = ((clipped - lo) / max(hi - lo, 1) * 255).astype(np.uint8)
    return norm


def _dicom_to_png(dicom_bytes: bytes, modality: str, body_part: str) -> bytes:
    """يحوّل DICOM لـ PNG مع windowing مناسب."""
    ds = pydicom.dcmread(io.BytesIO(dicom_bytes), force=True)
    arr = ds.pixel_array.astype(np.float32)
    # تطبيق Rescale لـ CT (Hounsfield)
    if modality.upper() == "CT":
        slope = float(getattr(ds, "RescaleSlope", 1.0))
        intercept = float(getattr(ds, "RescaleIntercept", 0.0))
        arr = arr * slope + intercept

    # ابحث عن أنسب windowing
    body = body_part.upper()
    wc, ww = WINDOW_BY_MODALITY.get((modality.upper(), body), (None, None))
    if wc is None and modality.upper() == "CT":
        wc, ww = WINDOW_BY_MODALITY.get(("CT", ""), (40, 400))
    pixels_8bit = _window_pixels(arr, wc, ww)

    # إذا الـ DICOM له WindowCenter, استخدمه كـ override للأنواع غير-CT
    if wc is None and modality.upper() != "CT":
        wl_center = getattr(ds, "WindowCenter", None)
        wl_width = getattr(ds, "WindowWidth", None)
        if wl_center is not None and wl_width is not None:
            try:
                wc = float(wl_center[0] if hasattr(wl_center, '__iter__') else wl_center)
                ww = float(wl_width[0] if hasattr(wl_width, '__iter__') else wl_width)
                pixels_8bit = _window_pixels(arr, wc, ww)
            except Exception:
                pass

    img = Image.fromarray(pixels_8bit).convert("RGB")
    # حدّ أقصى 1024px لخفض الـ payload لـ Ollama
    if max(img.size) > 1024:
        img.thumbnail((1024, 1024), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


async def _call_ollama_vision(image_b64: str, modality: str, body_part: str) -> dict[str, Any]:
    """يستدعي Ollama vision API."""
    prompt = VISION_PROMPT.format(modality=modality, body_part=body_part or "anatomical region")
    async with httpx.AsyncClient(timeout=120) as c:
        r = await c.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": VISION_MODEL,
                "prompt": prompt,
                "images": [image_b64],
                "stream": False,
                "options": {"temperature": 0.2, "num_predict": 400},
            },
        )
        r.raise_for_status()
        return r.json()


MODALITY_AR = {
    "CT": "الأشعة المقطعية",
    "MR": "الرنين المغناطيسي",
    "CR": "الأشعة السينية",
    "DR": "الأشعة السينية الرقمية",
    "US": "الموجات فوق الصوتية",
    "MG": "الماموجرام",
    "XA": "تصوير الأوعية",
    "NM": "الطب النووي",
    "PT": "PET",
}
BODY_PART_AR = {
    "BRAIN": "الدماغ", "HEAD": "الرأس", "CHEST": "الصدر", "LUNG": "الرئة",
    "ABDOMEN": "البطن", "PELVIS": "الحوض", "SPINE": "العمود الفقري",
    "KNEE": "الركبة", "SHOULDER": "الكتف", "HIP": "الورك", "ANKLE": "الكاحل",
    "WRIST": "الرسغ", "HAND": "اليد", "FOOT": "القدم", "BREAST": "الثدي",
    "LIVER": "الكبد", "KIDNEY": "الكلية", "HEART": "القلب",
}


async def _call_ollama_text(prompt: str) -> str:
    """يستدعي qwen2.5 للترجمة والـ structuring."""
    async with httpx.AsyncClient(timeout=180) as c:
        r = await c.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": TEXT_MODEL,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.3, "num_predict": 1200},
            },
        )
        r.raise_for_status()
        return r.json().get("response", "")


async def _structure_to_arabic(
    descriptions: list[str], modality: str, body_part: str, indication: str | None
) -> dict[str, Any]:
    """يدمج 3 أوصاف Vision في JSON عربي راديولوجي."""
    modality_ar = MODALITY_AR.get(modality.upper(), modality)
    body_part_ar = BODY_PART_AR.get(body_part.upper(), body_part or "العضو")
    numbered = "\n".join(f"الشريحة {i + 1}: {d}" for i, d in enumerate(descriptions))
    prompt = STRUCTURE_PROMPT.format(
        modality_ar=modality_ar,
        body_part_ar=body_part_ar,
        indication=indication or "غير محددة",
        vision_descriptions=numbered,
    )
    raw = await _call_ollama_text(prompt)
    parsed = _parse_radiologist_json(raw)
    # نُضمّن الـ Vision الخام دائماً
    parsed["_raw_vision_descriptions"] = descriptions
    parsed["_raw_qwen_output"] = raw[:500]
    if "findings_ar" in parsed:
        # توحيد المفاتيح للـ stub_template
        parsed["findings"] = parsed["findings_ar"]
        parsed["impression"] = parsed.get("impression_ar", "")
        parsed["recommendations"] = parsed.get("recommendations_ar", "")
    return parsed


def _parse_radiologist_json(text: str) -> dict[str, Any]:
    """يستخرج JSON من نص الـ LLM."""
    # ابحث عن JSON block
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return {"findings": text.strip(), "_parsed": False}
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        # حاول إصلاح quotes شائعة
        cleaned = m.group(0).replace("'", '"').replace("\n", " ")
        try:
            return json.loads(cleaned)
        except Exception:
            return {"findings": text.strip(), "_parsed": False}


app = FastAPI(title="midcine vision-ai", version="0.1.0")


@app.get("/healthz")
async def healthz():
    # تحقق من Ollama + الـ model
    available_models = []
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(f"{OLLAMA_URL}/api/tags")
            if r.status_code == 200:
                available_models = [m["name"] for m in r.json().get("models", [])]
    except Exception:
        pass
    model_ready = any(VISION_MODEL in m for m in available_models)
    return {
        "status": "ok",
        "service": "vision-ai",
        "ollama_url": OLLAMA_URL,
        "vision_model": VISION_MODEL,
        "available_models": available_models,
        "vision_model_ready": model_ready,
    }


class AnalyzeRequest(BaseModel):
    study_uid: str
    tenant_id: str
    modality: str
    body_part: str | None = None
    instance_uris: list[str]
    key_slice_index: int | None = None     # null → اختر الوسطية
    clinical_indication: str | None = None


@app.post("/v1/analyze")
async def analyze(body: AnalyzeRequest):
    if not body.instance_uris:
        raise HTTPException(422, detail={"code": "NO_INSTANCES"})

    t0 = time.perf_counter()
    # اختر 3 شرائح: 25% / 50% / 75% من الـ stack
    n = len(body.instance_uris)
    indices = sorted({max(0, min(n - 1, int(n * p))) for p in [0.25, 0.5, 0.75]})

    descriptions: list[str] = []
    for idx in indices:
        uri = body.instance_uris[idx]
        try:
            dcm_bytes = _fetch(uri)
            png_bytes = _dicom_to_png(dcm_bytes, body.modality, body.body_part or "")
        except Exception as e:
            log.warning("slice %d decode failed: %s", idx, e)
            continue
        image_b64 = base64.b64encode(png_bytes).decode("ascii")
        try:
            resp = await _call_ollama_vision(image_b64, body.modality, body.body_part or "")
            text_resp = resp.get("response", "").strip()
            if text_resp:
                descriptions.append(text_resp)
        except Exception as e:
            log.warning("vision call slice %d failed: %s", idx, e)
            continue

    if not descriptions:
        raise HTTPException(500, detail={"code": "VISION_FAILED", "error": "no slices analyzed"})

    # qwen2.5 يدمج الأوصاف في JSON عربي
    try:
        structured = await _structure_to_arabic(
            descriptions, body.modality, body.body_part or "", body.clinical_indication
        )
    except Exception as e:
        log.warning("structure failed: %s", e)
        structured = {"findings": " ".join(descriptions), "_parsed": False}

    latency_ms = int((time.perf_counter() - t0) * 1000)
    return {
        "model": f"{VISION_MODEL}+{TEXT_MODEL}",
        "latency_ms": latency_ms,
        "key_slice_idx": indices[len(indices) // 2],
        "slices_analyzed": indices,
        "structured": structured,
    }
