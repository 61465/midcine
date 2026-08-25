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
DICOMS_DIR = Path(os.getenv("MIDCINE_DICOMS_DIR", str(BASE / "data" / "dicoms")))
STUDIES_DIR.mkdir(parents=True, exist_ok=True)
DICOMS_DIR.mkdir(parents=True, exist_ok=True)


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
    symptoms: str = ""  # Reason for exam / presenting symptoms (DICOM 0032,1030)
    clinical_history: str = ""  # Past medical history relevant to this exam
    referrer: str = ""
    status: str = "pending"  # pending | in_progress | read | signed
    ai_confidence: float | None = None
    suggested_finding: str | None = None
    hospital_id: str = "default"


def _safe_filename(name: str) -> str:
    """Convert study_uid to a filesystem-safe filename."""
    return "".join(c if c.isalnum() or c in "._-" else "_" for c in name)[:200]


def save_study(rec: StudyRecord) -> Path:
    """Persist a StudyRecord to data/studies/{study_uid}.json (atomic tmp+rename)."""
    filename = _safe_filename(rec.study_uid) + ".json"
    target = STUDIES_DIR / filename
    tmp = target.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        f.write(rec.model_dump_json(indent=2))
    tmp.replace(target)
    return target


def delete_study(study_uid: str) -> bool:
    """Remove the JSON + any attached DICOM + series folder. Returns True if anything was deleted."""
    import shutil

    deleted = False
    fname = _safe_filename(study_uid)
    json_path = STUDIES_DIR / f"{fname}.json"
    if json_path.exists():
        json_path.unlink()
        deleted = True
    dcm_path = DICOMS_DIR / f"{fname}.dcm"
    if dcm_path.exists():
        dcm_path.unlink()
        deleted = True
    series_path = DICOMS_DIR / f"{fname}.series"
    if series_path.exists() and series_path.is_dir():
        shutil.rmtree(series_path, ignore_errors=True)
        deleted = True
    return deleted


def save_dicom_bytes(study_uid: str, data: bytes) -> Path:
    """Store an uploaded DICOM file next to its study record (single-frame studies)."""
    filename = _safe_filename(study_uid) + ".dcm"
    target = DICOMS_DIR / filename
    with target.open("wb") as f:
        f.write(data)
    return target


def series_dir_for(study_uid: str) -> Path:
    """Directory holding all slices for a multi-slice series."""
    return DICOMS_DIR / f"{_safe_filename(study_uid)}.series"


def save_series_slice(study_uid: str, filename: str, data: bytes) -> Path:
    """Store one slice of a multi-slice series. Creates dir on first slice."""
    d = series_dir_for(study_uid)
    d.mkdir(parents=True, exist_ok=True)
    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in filename)[:200]
    target = d / safe
    with target.open("wb") as f:
        f.write(data)
    return target


def list_series_slices(study_uid: str) -> list[str]:
    """Return sorted list of slice filenames for a study, empty if not a series."""
    d = series_dir_for(study_uid)
    if not d.exists() or not d.is_dir():
        return []
    # Accept Siemens .IMA, GE .dcm, and any extension a hospital PACS exports.
    # We only skip obvious junk (JSON manifests, hidden files, thumbnails).
    def _keep(f):
        if not f.is_file():
            return False
        n = f.name.lower()
        if n.startswith(".") or n in {"dicomdir", "manifest.json", "readme.txt"}:
            return False
        # Reject non-image sidecars
        return f.suffix.lower() not in {".json", ".txt", ".xml", ".jpg", ".png", ".log"}
    return sorted(f.name for f in d.iterdir() if _keep(f))


def list_series_groups(study_uid: str) -> list[dict]:
    """Group slice files by SeriesInstanceUID so viewers get one coherent
    volume per group. Uploaded studies often mix scans (T1+T2, pre+post
    contrast) which have different dimensions — feeding them all into one
    Cornerstone3D volume triggers `texSubImage3D: ArrayBufferView not big
    enough`. Grouping avoids that.

    Result: list of {series_uid, description, modality, slice_count, slices[]}
    sorted by slice_count desc (largest first — likely the primary series).
    Cached to `<series-dir>/.series_groups.json` because DICOM header reads
    for hundreds of files add up.
    """
    d = series_dir_for(study_uid)
    if not d.exists() or not d.is_dir():
        return []
    cache = d / ".series_groups.json"
    slice_names = list_series_slices(study_uid)
    if not slice_names:
        return []
    # Invalidate cache when file count changes.
    try:
        if cache.exists():
            cached = json.loads(cache.read_text(encoding="utf-8"))
            if isinstance(cached, dict) and cached.get("_slice_count") == len(slice_names):
                return cached.get("groups") or []
    except (OSError, json.JSONDecodeError):
        pass
    try:
        import pydicom  # type: ignore
    except ImportError:
        # Fallback: return all slices as one group (best-effort).
        return [{
            "series_uid": "unknown",
            "description": "",
            "modality": "",
            "slice_count": len(slice_names),
            "slices": slice_names,
        }]

    buckets: dict[str, dict] = {}
    for name in slice_names:
        p = d / name
        try:
            ds = pydicom.dcmread(str(p), stop_before_pixels=True, force=True)
            sid = str(getattr(ds, "SeriesInstanceUID", "") or "unknown")
            desc = str(getattr(ds, "SeriesDescription", "") or "")
            mod = str(getattr(ds, "Modality", "") or "")
        except Exception:
            sid = "unknown"
            desc = ""
            mod = ""
        b = buckets.setdefault(
            sid,
            {"series_uid": sid, "description": desc, "modality": mod, "slices": []},
        )
        b["slices"].append(name)

    groups = []
    for sid, b in buckets.items():
        b["slices"].sort()
        b["slice_count"] = len(b["slices"])
        groups.append(b)
    groups.sort(key=lambda g: g["slice_count"], reverse=True)

    try:
        cache.write_text(
            json.dumps({"_slice_count": len(slice_names), "groups": groups}),
            encoding="utf-8",
        )
    except OSError:
        pass
    return groups


def dicom_path_for(study_uid: str) -> Path | None:
    """Return the on-disk DICOM path if it exists (single-file mode)."""
    p = DICOMS_DIR / f"{_safe_filename(study_uid)}.dcm"
    return p if p.exists() else None


def series_slice_path(study_uid: str, filename: str) -> Path | None:
    """Path to one slice file if it exists inside the series folder."""
    d = series_dir_for(study_uid)
    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in filename)[:200]
    p = d / safe
    return p if p.exists() else None


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
    surgeries: list[str] = []
    family_history: list[str] = []
    # Lifestyle
    smoking: str = ""  # e.g. "1 pack/day for 20y" or "never"
    alcohol: str = ""
    occupation: str = ""
    # Contact
    phone: str = ""
    emergency_contact: str = ""
    # Free-form notes
    notes: str = ""
    referrer: str | None = None
    hospital_id: str = "default"


def save_patient(rec: PatientRecord) -> Path:
    """Persist a PatientRecord to data/patients/{patient_id}.json (atomic tmp+rename)."""
    filename = _safe_filename(rec.patient_id) + ".json"
    target = PATIENTS_DIR / filename
    tmp = target.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        f.write(rec.model_dump_json(indent=2))
    tmp.replace(target)
    return target


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
