"""
Anonymize all live study + patient JSONs in `data/studies` and `data/patients`.
DICOM binary pixel data in `data/dicoms/` is untouched — only the metadata
JSONs that surface real names/IDs/referrers/free-text clinical fields are
scrubbed.

Idempotent: rerunning on already-anonymized files is safe. Each record gets
a deterministic demo identity keyed off its `study_uid` / `patient_id`.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "data"
STUDIES = ROOT / "studies"
PATIENTS = ROOT / "patients"

FAKE_FIRST = [
    "Alex", "Sam", "Jordan", "Taylor", "Casey", "Morgan", "Riley", "Avery",
    "Quinn", "Reese", "Skyler", "Dakota", "Rowan", "Sage", "Blake",
]
FAKE_LAST = [
    "Doe", "Roe", "Poe", "Vega", "Nova", "Rivera", "Kim", "Chen", "Patel",
    "Hart", "Cross", "Lane", "Reed", "Brooks", "Cole",
]
FAKE_REFERRERS = [
    "Dr. Demo Physician",
    "Dr. Sample Consultant",
    "Dr. Test Radiologist",
    "Dr. Fixture Clinician",
]

# Preserve modality/body-part but strip any free-text that might carry PHI
SAFE_SYMPTOMS = {
    "MR": "Demo case — synthetic symptoms placeholder",
    "CT": "Demo case — synthetic symptoms placeholder",
    "CR": "Demo case — synthetic symptoms placeholder",
    "DX": "Demo case — synthetic symptoms placeholder",
    "US": "Demo case — synthetic symptoms placeholder",
}
SAFE_HISTORY = "No clinical history — fictional demonstration case"
SAFE_DESC = {
    "MR": "Demo MR study",
    "CT": "Demo CT study",
    "CR": "Demo X-ray",
    "DX": "Demo X-ray",
    "US": "Demo ultrasound",
}

DEMO_MARKER = "DEMO / FICTIONAL — not a real patient"


def stable_pick(key: str, options: list[str]) -> str:
    total = sum(ord(c) for c in key) if key else 0
    return options[total % len(options)]


def demo_name(key: str) -> str:
    first = stable_pick(key + "_f", FAKE_FIRST)
    last = stable_pick(key + "_l", FAKE_LAST)
    return f"{first} {last} (DEMO)"


def demo_patient_id(key: str) -> str:
    # Keep something short and stable so it looks like an MRN
    digits = re.sub(r"\D", "", key)[-6:] or "000000"
    return f"DEMO-{digits.zfill(6)}"


def anonymize_study(data: dict) -> dict:
    uid = data.get("study_uid") or data.get("patient_id") or ""
    modality = data.get("modality") or "MR"

    data["patient_name"] = demo_name(uid)
    data["patient_id"] = demo_patient_id(uid)
    data["referrer"] = stable_pick(uid + "_r", FAKE_REFERRERS)
    data["symptoms"] = SAFE_SYMPTOMS.get(modality, "Demo symptoms")
    data["clinical_history"] = SAFE_HISTORY
    data["description"] = SAFE_DESC.get(modality, "Demo study")
    data["demo_marker"] = DEMO_MARKER

    # Drop age/sex to be safe (kept as null / preserved sex letter only)
    data["age"] = None
    if data.get("sex") not in ("M", "F", "O", None):
        data["sex"] = None

    return data


def anonymize_patient(data: dict) -> dict:
    key = data.get("patient_id") or data.get("id") or ""
    data["name"] = demo_name(key)
    data["patient_id"] = demo_patient_id(key)
    if "id" in data:
        data["id"] = data["patient_id"]
    for field in ("phone", "email", "address", "national_id", "notes"):
        if field in data:
            data[field] = None
    data["demo_marker"] = DEMO_MARKER
    return data


def run_dir(target: Path, kind: str) -> int:
    n = 0
    if not target.exists():
        return 0
    for path in sorted(target.glob("*.json")):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"[skip] {path.name}: {e}")
            continue
        if kind == "study":
            fixed = anonymize_study(raw)
        else:
            fixed = anonymize_patient(raw)
        path.write_text(
            json.dumps(fixed, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        n += 1
    return n


def main() -> None:
    s = run_dir(STUDIES, "study")
    p = run_dir(PATIENTS, "patient")
    print(f"anonymized: {s} studies, {p} patients")


if __name__ == "__main__":
    main()
