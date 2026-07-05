"""Whisper-based transcription service — local faster-whisper on CPU.

POST /transcribe (multipart/form-data)
    audio: uploaded audio file (webm/mp3/wav/m4a)
    language: 'ar' | 'en' | 'auto' (default 'auto')

Returns { text, language, duration_ms }

Model: faster-whisper 'small' by default — 244 MB, runs on CPU at ~1x realtime.
Override with WHISPER_MODEL env (e.g. 'medium', 'large-v3').

Not fine-tuned for medical terminology yet — Phase 3 will adapt on radiology
dictations dataset. For now, generic Whisper does surprisingly well on
Arabic + English medical phrases.
"""

from __future__ import annotations

import contextlib
import logging
import os
import tempfile
import time
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("voice-transcribe")

MODEL_NAME = os.getenv("WHISPER_MODEL", "small")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE", "int8")  # int8 for CPU, float16 for GPU
DEVICE = os.getenv("WHISPER_DEVICE", "cpu")

_model = None


def _get_model():
    """Lazy-load the model on first request so startup is fast."""
    global _model
    if _model is None:
        try:
            from faster_whisper import WhisperModel  # type: ignore
        except ImportError as e:
            log.error("faster-whisper not installed: %s", e)
            raise RuntimeError(
                "faster-whisper not installed. Run: pip install faster-whisper"
            ) from e
        log.info("loading whisper model=%s device=%s compute=%s", MODEL_NAME, DEVICE, COMPUTE_TYPE)
        _model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
    return _model


app = FastAPI(title="midcine voice-transcribe", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "device": DEVICE,
        "compute_type": COMPUTE_TYPE,
        "loaded": _model is not None,
    }


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),  # noqa: B008 — FastAPI convention
    language: str = Form("auto"),
) -> dict:
    """Transcribe an uploaded audio blob to text."""
    started = time.perf_counter()

    # Save to temp file — faster-whisper reads from a path
    suffix = Path(audio.filename or "clip.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = Path(tmp.name)

    try:
        model = _get_model()
        # Whisper: 'ar' = Arabic, 'en' = English, None = auto-detect
        lang = None if language == "auto" else language
        segments, info = model.transcribe(
            str(tmp_path),
            language=lang,
            beam_size=1,  # faster for short dictations
            vad_filter=True,  # skip silence
            vad_parameters={"min_silence_duration_ms": 500},
        )
        text = " ".join(seg.text.strip() for seg in segments).strip()
        elapsed = (time.perf_counter() - started) * 1000
        log.info(
            "transcribed lang=%s prob=%.2f duration=%.1fs text_len=%d in %dms",
            info.language,
            info.language_probability,
            info.duration,
            len(text),
            int(elapsed),
        )
        return {
            "ok": True,
            "text": text,
            "language": info.language,
            "language_probability": round(info.language_probability, 3),
            "audio_duration_s": round(info.duration, 2),
            "processing_ms": int(elapsed),
        }
    except (RuntimeError, OSError, ValueError) as e:
        log.exception("transcribe failed: %s", e)
        return {"ok": False, "error": str(e)}
    finally:
        with contextlib.suppress(OSError):
            tmp_path.unlink()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("VOICE_PORT", "8220")))
