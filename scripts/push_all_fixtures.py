"""يدفع كل الـ DICOMs في fixtures/dicomlibrary/<subfolder>/ كل واحدة كـ study مستقل.

كل subfolder = study واحد (مثلاً MRI_Knee_R, MRI_Brain, CT_Chest, ...).
يتعامل مع subdirectories متداخلة (series-XXX/image-XXX.dcm).
"""
from __future__ import annotations

import asyncio
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

import httpx
import pydicom

API_BASE = "http://localhost:13100"
TOKEN = None


async def login() -> str:
    global TOKEN
    async with httpx.AsyncClient() as c:
        r = await c.post(
            f"{API_BASE}/v1/auth/login",
            json={"email": "demo@midcine.io", "password": "DemoMidcine!2026"},
            timeout=15,
        )
        r.raise_for_status()
        TOKEN = r.json()["access_token"]
        return TOKEN


async def push_one(client: httpx.AsyncClient, path: Path, study_counts: dict[str, int]) -> tuple[str | None, str | None]:
    # نقرأ الـ meta من DICOM
    try:
        ds = pydicom.dcmread(str(path), stop_before_pixels=False)
    except Exception as e:
        print(f"  skip (not DICOM): {path.name} — {e}")
        return None, None

    raw = path.read_bytes()
    import hashlib
    digest = hashlib.sha256(raw).hexdigest()

    def fmt_date(v):
        if not v or len(str(v)) < 8:
            return None
        v = str(v)
        return f"{v[:4]}-{v[4:6]}-{v[6:8]}"

    meta = {
        "study_instance_uid": str(ds.StudyInstanceUID),
        "series_instance_uid": str(ds.SeriesInstanceUID),
        "sop_instance_uid": str(ds.SOPInstanceUID),
        "patient_mrn": str(getattr(ds, "PatientID", "UNKNOWN")),
        "patient_name_ar": str(getattr(ds, "PatientName", "مجهول")),
        "patient_dob": fmt_date(getattr(ds, "PatientBirthDate", None)),
        "patient_sex": str(getattr(ds, "PatientSex", "U") or "U")[:1],
        "modality": str(getattr(ds, "Modality", "OT")),
        "body_part": str(getattr(ds, "BodyPartExamined", "") or "") or None,
        "study_date": fmt_date(getattr(ds, "StudyDate", None)) or "2026-01-01",
        "accession_number": str(getattr(ds, "AccessionNumber", "") or "") or None,
        "rows": int(getattr(ds, "Rows", 0)) or None,
        "cols": int(getattr(ds, "Columns", 0)) or None,
        "transfer_syntax": str(ds.file_meta.TransferSyntaxUID) if hasattr(ds, 'file_meta') else None,
        "hash_sha256": digest,
        "size_bytes": len(raw),
        "description": str(getattr(ds, "StudyDescription", "") or "") or None,
    }

    files = {
        "meta": (None, json.dumps(meta, ensure_ascii=False), "application/json"),
        "pixels": (path.name, raw, "application/dicom"),
    }
    try:
        r = await client.post(f"{API_BASE}/v1/instances", files=files, timeout=60)
        if r.status_code >= 300:
            print(f"  ERR {path.name}: {r.status_code}")
            return meta["study_instance_uid"], None
        study_counts[meta["study_instance_uid"]] += 1
        return meta["study_instance_uid"], meta["modality"]
    except Exception as e:
        print(f"  ERR {path.name}: {e}")
        return meta["study_instance_uid"], None


async def complete_studies(client: httpx.AsyncClient, counts: dict[str, int]):
    for uid, n in counts.items():
        try:
            r = await client.post(
                f"{API_BASE}/v1/studies/{uid}/complete",
                json={"expected_instances": n},
                timeout=20,
            )
            print(f"  complete {uid[-30:]}: {n} instances → {r.status_code}")
        except Exception as e:
            print(f"  complete failed for {uid}: {e}")


async def main():
    src = Path(sys.argv[1] if len(sys.argv) > 1 else "fixtures/dicomlibrary")
    if not src.exists():
        print(f"folder not found: {src}")
        print("Run python scripts/fetch_dicomlibrary.py --help for instructions")
        return

    subdirs = [d for d in src.iterdir() if d.is_dir()]
    if not subdirs:
        # المجلد يحوي ملفات مباشرة
        subdirs = [src]

    await login()
    print(f"Token acquired. Found {len(subdirs)} studies to push.\n")

    async with httpx.AsyncClient() as client:
        for study_dir in subdirs:
            print(f"[{study_dir.name}]")
            study_counts: dict[str, int] = defaultdict(int)
            files = sorted(study_dir.rglob("*.dcm")) + sorted(study_dir.rglob("*.DCM"))
            if not files:
                # حاول أي ملف
                files = [f for f in study_dir.rglob("*") if f.is_file() and not f.name.startswith(".")]
            for f in files:
                await push_one(client, f, study_counts)
            await complete_studies(client, dict(study_counts))
            print()
    print("DONE. افتح: http://localhost:13000/worklist")


if __name__ == "__main__":
    asyncio.run(main())
