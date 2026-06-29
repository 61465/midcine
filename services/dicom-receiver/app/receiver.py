"""DICOM C-STORE SCP — يستقبل من أجهزة CT/MRI حقيقية ويرفع للـ Ingestion API.

لماذا منفصلة عن Orthanc؟ لتحكم أعمق: whitelist AET، DLP placeholder، debounce اكتمال study.

استعمال:
    docker compose up -d dicom-receiver
    # وجّه جهاز CT لـ midcine-dicom-receiver port 11113 AET=MIDCINE-EDGE
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import json
import logging
import os
import threading
import time
from collections import defaultdict

import httpx
import pydicom
from pynetdicom import AE, evt
from pynetdicom.sop_class import (
    CTImageStorage,
    MRImageStorage,
    ComputedRadiographyImageStorage,
    DigitalXRayImagePresentationStorage,
    EncapsulatedPDFStorage,
)

log = logging.getLogger("dicom-receiver")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

INGESTION_URL = os.environ.get("INGESTION_URL", "http://ingestion-api:8100")
AE_TITLE = os.environ.get("AE_TITLE", "MIDCINE")
LISTEN_PORT = int(os.environ.get("LISTEN_PORT", "11113"))
DEBOUNCE_SECONDS = int(os.environ.get("STUDY_DEBOUNCE_SECONDS", "10"))

# whitelist AET (للأمان — الإنتاج)
ALLOWED_AETS = set(os.environ.get("ALLOWED_AETS", "").split(",")) if os.environ.get("ALLOWED_AETS") else None

# تتبع آخر instance لكل study لاكتشاف الاكتمال
_study_state: dict[str, dict] = defaultdict(lambda: {"count": 0, "last_at": 0.0, "completed": False})
_state_lock = threading.Lock()


def handle_store(event):
    ds = event.dataset
    ds.file_meta = event.file_meta
    try:
        if ALLOWED_AETS and event.assoc.requestor.ae_title.strip() not in ALLOWED_AETS:
            log.warning("rejected AET=%s", event.assoc.requestor.ae_title)
            return 0xA700

        # سريالايز للإرسال
        buf = io.BytesIO()
        pydicom.dcmwrite(buf, ds, write_like_original=False)
        raw = buf.getvalue()
        digest = hashlib.sha256(raw).hexdigest()

        meta = {
            "study_instance_uid": str(ds.StudyInstanceUID),
            "series_instance_uid": str(ds.SeriesInstanceUID),
            "sop_instance_uid": str(ds.SOPInstanceUID),
            "patient_mrn": str(getattr(ds, "PatientID", "UNKNOWN")),
            "patient_name_ar": str(getattr(ds, "PatientName", "مجهول")),
            "patient_dob": _fmt_date(getattr(ds, "PatientBirthDate", None)),
            "patient_sex": str(getattr(ds, "PatientSex", "U") or "U")[:1],
            "modality": str(getattr(ds, "Modality", "OT")),
            "body_part": str(getattr(ds, "BodyPartExamined", "") or "") or None,
            "study_date": _fmt_date(getattr(ds, "StudyDate", None)) or "2026-01-01",
            "accession_number": str(getattr(ds, "AccessionNumber", "") or "") or None,
            "rows": int(getattr(ds, "Rows", 0)) or None,
            "cols": int(getattr(ds, "Columns", 0)) or None,
            "transfer_syntax": str(ds.file_meta.TransferSyntaxUID),
            "hash_sha256": digest,
            "size_bytes": len(raw),
            "description": str(getattr(ds, "StudyDescription", "") or "") or None,
        }
        files = {
            "meta": (None, json.dumps(meta, ensure_ascii=False), "application/json"),
            "pixels": (f"{ds.SOPInstanceUID}.dcm", raw, "application/dicom"),
        }
        with httpx.Client(timeout=60) as c:
            r = c.post(f"{INGESTION_URL}/v1/instances", files=files)
            if r.status_code >= 300:
                log.error("ingest failed status=%d body=%s", r.status_code, r.text[:200])
                return 0xA700

        with _state_lock:
            s = _study_state[meta["study_instance_uid"]]
            s["count"] += 1
            s["last_at"] = time.time()

        log.info("stored sop=%s study=%s", meta["sop_instance_uid"][-12:], meta["study_instance_uid"][-12:])
        return 0x0000
    except Exception as e:
        log.exception("store error: %s", e)
        return 0xA700


def _fmt_date(value):
    if not value or len(str(value)) < 8:
        return None
    v = str(value)
    return f"{v[:4]}-{v[4:6]}-{v[6:8]}"


def debounce_thread():
    """يخبر Ingestion عند اكتمال study (لم تصل instances جديدة لـ DEBOUNCE ثوانٍ)."""
    while True:
        time.sleep(2)
        now = time.time()
        with _state_lock:
            for uid, s in list(_study_state.items()):
                if not s["completed"] and now - s["last_at"] >= DEBOUNCE_SECONDS and s["count"] > 0:
                    try:
                        with httpx.Client(timeout=20) as c:
                            r = c.post(
                                f"{INGESTION_URL}/v1/studies/{uid}/complete",
                                json={"expected_instances": s["count"]},
                            )
                            log.info("completed study=%s count=%d status=%d", uid[-12:], s["count"], r.status_code)
                            s["completed"] = True
                    except Exception:
                        log.exception("complete failed for %s", uid)


def main():
    ae = AE(ae_title=AE_TITLE)
    for sop in [
        CTImageStorage,
        MRImageStorage,
        ComputedRadiographyImageStorage,
        DigitalXRayImagePresentationStorage,
        EncapsulatedPDFStorage,
    ]:
        ae.add_supported_context(sop)

    threading.Thread(target=debounce_thread, daemon=True).start()
    handlers = [(evt.EVT_C_STORE, handle_store)]
    log.info("DICOM receiver listening on :%d AET=%s", LISTEN_PORT, AE_TITLE)
    ae.start_server(("0.0.0.0", LISTEN_PORT), evt_handlers=handlers)


if __name__ == "__main__":
    main()
