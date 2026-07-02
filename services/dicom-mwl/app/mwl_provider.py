"""DICOM Modality Worklist provider — real hospital integration.

Reads StudyRecord JSON from data/studies/ and converts each to a DICOM MWL item
that any CT/MR modality can C-FIND against.

Standards: DICOM PS3.4 K.5 (Modality Worklist SOP Class) + IHE SWF.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime
from pathlib import Path

from pydicom.dataset import Dataset
from pydicom.sequence import Sequence

log = logging.getLogger("mwl-provider")

# DICOM PS3.5 constraints
_UID_MAX_LEN = 64
_LO_MAX_LEN = 64  # Long String VR


def _sanitize_uid(uid: str, salt: str = "") -> str:
    """Ensure UID matches DICOM PS3.5 UI VR: [0-9.]+ max 64 chars, no leading zeros.
    Non-numeric characters get replaced by their numeric hash mod 1000."""
    if not uid:
        return f"1.2.826.0.1.midcine.0.{abs(hash(salt)) % 10**12}"
    clean_parts: list[str] = []
    for part in uid.split("."):
        if part.isdigit():
            # strip leading zeros (except "0" itself)
            clean_parts.append(str(int(part)) if part else "0")
        else:
            # hash non-numeric segments into a numeric fingerprint
            clean_parts.append(str(abs(hash(part)) % 10**8))
    out = ".".join(p for p in clean_parts if p)
    return out[:_UID_MAX_LEN]


def _clip_lo(value: str) -> str:
    """DICOM LO VR max 64 chars, no CR/LF/ESC."""
    if not value:
        return ""
    clean = value.replace("\r", " ").replace("\n", " ").replace("\x1b", " ")
    return clean[:_LO_MAX_LEN]


BASE = Path(__file__).resolve().parent.parent
STUDIES_DIR = Path(
    os.getenv("MIDCINE_STUDIES_DIR", str(BASE.parent / "mcp-bridge" / "data" / "studies"))
)
SCHEDULED_STATION_AET = os.getenv("SCHEDULED_STATION_AET", "ANY-MODALITY")

# Accession derivation: take last 16 chars of study_uid to fit typical PACS AN length
_ACC_MAX_LEN = 16

# Priority (P1..P5) → DICOM SPS Priority
_PRIORITY_TO_SPS: dict[str, str] = {
    "P1": "STAT",
    "P2": "HIGH",
    "P3": "MEDIUM",
    "P4": "LOW",
    "P5": "LOW",
}


def _format_pn(name: str) -> str:
    """Convert 'Family Given' to DICOM PN format 'Family^Given'."""
    if not name or "^" in name:
        return name or ""
    parts = name.strip().split()
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]}^{' '.join(parts[1:])}"


def _iso_to_dicom_date(iso: str) -> str:
    """ISO 8601 → DICOM DA (YYYYMMDD)."""
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%Y%m%d")
    except (ValueError, TypeError):
        return ""


def _iso_to_dicom_time(iso: str) -> str:
    """ISO 8601 → DICOM TM (HHMMSS)."""
    try:
        return datetime.fromisoformat(iso.replace("Z", "+00:00")).strftime("%H%M%S")
    except (ValueError, TypeError):
        return ""


def _age_to_dob(age: int | None, study_date_iso: str) -> str:
    """Approximate DOB from age (YYYY0101 estimate)."""
    if not age:
        return ""
    try:
        year = datetime.fromisoformat(study_date_iso.replace("Z", "+00:00")).year - age
    except (ValueError, TypeError):
        year = datetime.now().year - age
    return f"{year:04d}0101"


def _accession_from_uid(study_uid: str) -> str:
    """Derive an accession number. Prefer text after last dot, else last 16 chars."""
    if "." in study_uid:
        tail = study_uid.split(".")[-1]
        if tail:
            return tail[:_ACC_MAX_LEN]
    return study_uid[-_ACC_MAX_LEN:]


def _record_to_mwl_dataset(rec: dict) -> Dataset:
    """Convert a StudyRecord dict to a DICOM MWL item Dataset."""
    ds = Dataset()

    # Character set for Arabic patient names
    ds.SpecificCharacterSet = "ISO_IR 192"

    # Patient IE
    ds.PatientName = _format_pn(rec.get("patient_name", ""))
    ds.PatientID = rec.get("patient_id", "")
    ds.PatientBirthDate = _age_to_dob(rec.get("age"), rec.get("study_date", ""))
    sex = (rec.get("sex") or "").strip().upper()[:1]
    ds.PatientSex = sex if sex in ("M", "F", "O") else ""

    # Study / Imaging Service Request IE
    raw_uid = rec.get("study_uid", "")
    ds.StudyInstanceUID = _sanitize_uid(raw_uid, salt=raw_uid)
    ds.AccessionNumber = _clip_lo(_accession_from_uid(raw_uid))
    ds.RequestingPhysician = _format_pn(rec.get("referrer", ""))
    ds.RequestedProcedureID = _clip_lo(raw_uid[-16:])
    ds.RequestedProcedureDescription = _clip_lo(
        rec.get("description", "") or rec.get("body_part", "")
    )
    ds.ReferringPhysicianName = _format_pn(rec.get("referrer", ""))

    # Scheduled Procedure Step Sequence (mandatory type-1)
    sps = Dataset()
    sps.Modality = rec.get("modality", "")
    sps.ScheduledStationAETitle = SCHEDULED_STATION_AET
    sps.ScheduledProcedureStepStartDate = _iso_to_dicom_date(rec.get("study_date", ""))
    sps.ScheduledProcedureStepStartTime = _iso_to_dicom_time(rec.get("study_date", ""))
    sps.ScheduledPerformingPhysicianName = _format_pn(rec.get("referrer", ""))
    sps.ScheduledProcedureStepDescription = _clip_lo(rec.get("description", ""))
    sps.ScheduledProcedureStepID = _clip_lo(raw_uid[-16:])
    sps.ScheduledProcedureStepStatus = "SCHEDULED"
    priority = _PRIORITY_TO_SPS.get(rec.get("priority", ""), "MEDIUM")
    ds.ScheduledProcedureStepSequence = Sequence([sps])
    ds.PriorityText = priority

    return ds


def load_worklist() -> list[Dataset]:
    """Read all StudyRecord JSON files and return DICOM MWL datasets.
    Only 'pending' or 'in_progress' studies are exposed."""
    items: list[Dataset] = []
    STUDIES_DIR.mkdir(parents=True, exist_ok=True)
    for f in sorted(STUDIES_DIR.glob("*.json")):
        try:
            rec = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            log.warning("mwl: skipping %s: %s", f.name, e)
            continue
        status = (rec.get("status") or "").lower()
        if status in ("signed", "read"):
            continue  # completed studies not on worklist
        try:
            ds = _record_to_mwl_dataset(rec)
            items.append(ds)
        except (KeyError, TypeError, ValueError) as e:
            log.warning("mwl: could not convert %s: %s", f.name, e)
    log.info("mwl: loaded %d active worklist items", len(items))
    return items


def _wildcard_match(value: str, pattern: str) -> bool:
    """DICOM wildcard match: * = any chars, ? = any single char, case-insensitive."""
    if not pattern:
        return True  # empty query field = match everything
    if pattern == "*":
        return True
    regex = "^" + re.escape(pattern).replace(r"\*", ".*").replace(r"\?", ".") + "$"
    return re.match(regex, value, re.IGNORECASE) is not None


def _range_match(value: str, pattern: str) -> bool:
    """DICOM date range match: YYYYMMDD-YYYYMMDD, YYYYMMDD-, or -YYYYMMDD."""
    if "-" not in pattern:
        return _wildcard_match(value, pattern)
    lo, _, hi = pattern.partition("-")
    if lo and value < lo:
        return False
    return not (hi and value > hi)


def _matches_query(item: Dataset, query: Dataset) -> bool:
    """C-FIND matching per PS3.4 C.2.2 — universal, single-value, wildcard, range."""
    for elem in query:
        if elem.VR == "SQ":
            # Recurse into scheduled procedure step sequence
            item_seq = getattr(item, elem.keyword, None)
            if item_seq is None or len(item_seq) == 0:
                continue  # nothing to match against, skip
            query_items = list(elem.value or [])
            if not query_items:
                continue
            # match if ANY item in item_seq matches the first query item
            if not any(_matches_query(it, query_items[0]) for it in item_seq):
                return False
            continue

        query_val = elem.value
        if query_val is None or query_val == "":
            continue  # universal match
        item_val = str(getattr(item, elem.keyword, "") or "")
        query_str = str(query_val)

        # Date range or wildcard
        if elem.VR == "DA" and "-" in query_str:
            if not _range_match(item_val, query_str):
                return False
        elif "*" in query_str or "?" in query_str:
            if not _wildcard_match(item_val, query_str):
                return False
        else:
            # single-value exact match, case-insensitive for PN
            if elem.VR == "PN":
                if item_val.lower() != query_str.lower():
                    return False
            elif item_val != query_str:
                return False
    return True


def filter_by_query(items: list[Dataset], query: Dataset) -> list[Dataset]:
    """Apply the modality's C-FIND identifier as filter."""
    return [it for it in items if _matches_query(it, query)]
