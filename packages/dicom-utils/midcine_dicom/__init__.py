"""DICOM helpers مشتركة بين الـ services."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import numpy as np
import pydicom


@dataclass
class DicomSummary:
    study_uid: str
    series_uid: str
    sop_uid: str
    modality: str
    body_part: str | None
    patient_mrn: str
    patient_name_ar: str
    patient_dob: date | None
    patient_sex: str | None
    study_date: date
    description: str | None
    rows: int | None
    cols: int | None
    transfer_syntax: str | None
    size_bytes: int
    hash_sha256: str


def _parse_dicom_date(value: str | None) -> date | None:
    if not value or len(value) < 8:
        return None
    try:
        return date(int(value[:4]), int(value[4:6]), int(value[6:8]))
    except Exception:
        return None


def summarize(path: str | Path) -> DicomSummary:
    """يقرأ ملف DICOM ويرجع ملخصاً جاهزاً للإرسال للـ Ingestion API."""
    path = Path(path)
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    ds = pydicom.dcmread(str(path), stop_before_pixels=False)

    return DicomSummary(
        study_uid=str(ds.StudyInstanceUID),
        series_uid=str(ds.SeriesInstanceUID),
        sop_uid=str(ds.SOPInstanceUID),
        modality=str(getattr(ds, "Modality", "OT")),
        body_part=str(getattr(ds, "BodyPartExamined", "") or "") or None,
        patient_mrn=str(getattr(ds, "PatientID", "UNKNOWN")),
        patient_name_ar=str(getattr(ds, "PatientName", "مجهول")),
        patient_dob=_parse_dicom_date(getattr(ds, "PatientBirthDate", None)),
        patient_sex=str(getattr(ds, "PatientSex", "U") or "U")[:1],
        study_date=_parse_dicom_date(getattr(ds, "StudyDate", None)) or date.today(),
        description=str(getattr(ds, "StudyDescription", "") or "") or None,
        rows=int(getattr(ds, "Rows", 0)) or None,
        cols=int(getattr(ds, "Columns", 0)) or None,
        transfer_syntax=str(ds.file_meta.TransferSyntaxUID) if hasattr(ds, "file_meta") else None,
        size_bytes=len(raw),
        hash_sha256=digest,
    )


def pixel_array_hu(path: str | Path) -> np.ndarray:
    """يرجع pixel array مع تطبيق RescaleSlope/Intercept (Hounsfield Units لـ CT)."""
    ds = pydicom.dcmread(str(path))
    arr = ds.pixel_array.astype(np.float32)
    slope = float(getattr(ds, "RescaleSlope", 1.0))
    intercept = float(getattr(ds, "RescaleIntercept", 0.0))
    return arr * slope + intercept
