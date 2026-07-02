"""Local studies store — reads from data/studies/*.json.

Design principle: NEVER fabricate patient data. If the store is empty, we return
an empty list. When Orthanc/PACS is connected (Sprint 3), this module will be
replaced by an ingestion-api client. Until then, studies enter via:
  - manual upload from /reader (future POST /studies endpoint)
  - Orthanc C-STORE receiver (services/dicom-receiver)
  - operator manually placing JSON in data/studies/
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from pydantic import BaseModel

BASE = Path(__file__).resolve().parent.parent
STUDIES_DIR = Path(os.getenv("MIDCINE_STUDIES_DIR", str(BASE / "data" / "studies")))
STUDIES_DIR.mkdir(parents=True, exist_ok=True)


class StudyRecord(BaseModel):
    """One entry in the studies store. Matches Orthanc/RIS worklist fields."""

    study_uid: str
    patient_id: str
    patient_name: str
    age: int | None = None
    sex: str | None = None  # "M" | "F"
    modality: str  # CT | MR | CR | DR | US
    body_part: str  # BRAIN | CHEST | ...
    priority: str = "P3"  # P1..P5
    study_date: str  # ISO
    description: str = ""
    referrer: str = ""
    status: str = "pending"  # pending | in_progress | read | signed
    ai_confidence: float | None = None
    suggested_finding: str | None = None
    hospital_id: str = "default"


def list_studies(hospital_id: str | None = None, limit: int = 200) -> list[StudyRecord]:
    """Read all study JSON files. Filter by hospital when provided."""
    items: list[StudyRecord] = []
    for f in sorted(STUDIES_DIR.glob("*.json")):
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        try:
            rec = StudyRecord(**data)
        except (ValueError, TypeError):
            continue
        if hospital_id and rec.hospital_id != hospital_id:
            continue
        items.append(rec)
    items.sort(key=lambda r: r.study_date, reverse=True)
    return items[:limit]


def get_study(study_uid: str) -> StudyRecord | None:
    for rec in list_studies():
        if rec.study_uid == study_uid:
            return rec
    return None


def list_by_patient(patient_id: str) -> list[StudyRecord]:
    return [r for r in list_studies() if r.patient_id == patient_id]


class PatientRecord(BaseModel):
    patient_id: str
    patient_name: str
    age: int | None = None
    sex: str | None = None
    blood_type: str | None = None
    allergies: list[str] = []
    chronic_conditions: list[str] = []
    current_meds: list[str] = []
    referrer: str | None = None
    hospital_id: str = "default"


PATIENTS_DIR = Path(os.getenv("MIDCINE_PATIENTS_DIR", str(BASE / "data" / "patients")))
PATIENTS_DIR.mkdir(parents=True, exist_ok=True)


def get_patient(patient_id: str) -> PatientRecord | None:
    f = PATIENTS_DIR / f"{patient_id}.json"
    if not f.exists():
        return None
    try:
        return PatientRecord(**json.loads(f.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, ValueError):
        return None


def list_patients(hospital_id: str | None = None) -> list[PatientRecord]:
    items: list[PatientRecord] = []
    for f in sorted(PATIENTS_DIR.glob("*.json")):
        try:
            rec = PatientRecord(**json.loads(f.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue
        if hospital_id and rec.hospital_id != hospital_id:
            continue
        items.append(rec)
    return items
