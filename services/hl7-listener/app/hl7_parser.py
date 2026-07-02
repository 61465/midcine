"""HL7 v2 ORM^O01 parser — real hospital integration primitive.

Extracts patient + procedure fields from a HL7 v2.5 ORM message and produces
a midcine StudyRecord dict ready to write to data/studies/.

Handles field variations across GE Centricity, Cerner, Epic, Trakcare by
falling back gracefully when optional fields are missing.

Standards: HL7 v2.5 messaging + IHE SWF.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime

log = logging.getLogger("hl7-parser")


# Priority (OBR-27 / OBR-5): S=STAT, A=ASAP, R=Routine, T=Timing critical
_PRIORITY_MAP = {
    "S": "P1",  # STAT = P1 emergency
    "A": "P2",  # ASAP = P2 urgent
    "R": "P3",  # Routine
    "T": "P2",  # Timing critical
    "P": "P4",  # Preop
    "C": "P3",  # Callback
}

# OBR-24 diagnostic service ID → modality
_MODALITY_MAP = {
    "CT": "CT",
    "MR": "MR",
    "MRI": "MR",
    "CR": "CR",
    "DR": "DR",
    "DX": "DR",
    "XR": "CR",
    "US": "US",
    "MG": "MG",
    "NM": "NM",
    "PT": "PT",
    "PET": "PT",
    "RF": "RF",
}

# Body-part hints from procedure description
_BODY_PART_HINTS = {
    "HEAD": "BRAIN",
    "BRAIN": "BRAIN",
    "SKULL": "BRAIN",
    "CRANIUM": "BRAIN",
    "CHEST": "CHEST",
    "THORAX": "CHEST",
    "LUNG": "CHEST",
    "ABDOMEN": "ABDOMEN",
    "ABD": "ABDOMEN",
    "PELVIS": "PELVIS",
    "SPINE": "SPINE",
    "LUMBAR": "SPINE",
    "CERVICAL": "SPINE",
    "THORACIC": "SPINE",
    "KIDNEY": "ABDOMEN",
    "LIVER": "ABDOMEN",
    "KNEE": "MSK",
    "SHOULDER": "MSK",
    "HIP": "MSK",
    "ANKLE": "MSK",
    "WRIST": "MSK",
    "HAND": "MSK",
    "FOOT": "MSK",
    "HEART": "CHEST",
    "CARDIAC": "CHEST",
    "CORONARY": "CHEST",
}


def _split_field(field: str, sep: str = "^") -> list[str]:
    return field.split(sep) if field else []


def _extract_pid(pid_segment: str) -> dict:
    """Extract patient info from PID segment. Field 3 = patient ID, field 5 = name,
    field 7 = DOB, field 8 = sex."""
    fields = pid_segment.split("|")
    if len(fields) < 9:
        return {}

    # PID-3: CX composite — first repetition first component
    pid_field = fields[3].split("~")[0]  # first repetition
    pid_components = _split_field(pid_field)
    patient_id = pid_components[0] if pid_components else ""

    # PID-5: XPN name — first repetition, Family^Given^Middle
    name_field = fields[5].split("~")[0]
    name_components = _split_field(name_field)
    family = name_components[0] if len(name_components) > 0 else ""
    given = name_components[1] if len(name_components) > 1 else ""
    patient_name = f"{family} {given}".strip() or "UNKNOWN"

    # PID-7: DOB in YYYYMMDD
    dob = fields[7][:8] if len(fields) > 7 else ""
    age = None
    if len(dob) >= 4:
        try:
            birth_year = int(dob[:4])
            now_year = datetime.now(UTC).year
            age = max(0, now_year - birth_year)
        except ValueError:
            age = None

    sex = fields[8].strip().upper()[:1] if len(fields) > 8 else ""
    if sex not in ("M", "F", "O", "U"):
        sex = "U"

    return {
        "patient_id": patient_id,
        "patient_name": patient_name,
        "age": age,
        "sex": sex,
        "dob": dob,
    }


def _extract_obr(obr_segment: str) -> dict:
    """Extract order + procedure info from OBR segment."""
    fields = obr_segment.split("|")
    if len(fields) < 5:
        return {}

    # OBR-2: placer order number, OBR-3: filler order number (accession)
    placer_field = fields[2].split("^")[0] if len(fields) > 2 else ""
    filler_field = fields[3].split("^")[0] if len(fields) > 3 else ""
    accession = filler_field or placer_field

    # OBR-4: universal service ID — code^text^system
    obr_4 = _split_field(fields[4]) if len(fields) > 4 else []
    procedure_code = obr_4[0] if len(obr_4) > 0 else ""
    procedure_text = obr_4[1] if len(obr_4) > 1 else ""

    # OBR-5: priority (older location) OR OBR-27 (newer)
    priority_raw = fields[5].strip().upper()[:1] if len(fields) > 5 else "R"
    if len(fields) > 27:
        pri_27 = fields[27].split("^")[0].strip().upper()[:1]
        if pri_27:
            priority_raw = pri_27
    priority = _PRIORITY_MAP.get(priority_raw, "P3")

    # OBR-7: observation date/time (when to perform) — YYYYMMDDHHMMSS
    obs_dt = fields[7][:14] if len(fields) > 7 else ""

    # OBR-16: ordering provider — XCN, first rep
    op_field = fields[16].split("~")[0] if len(fields) > 16 else ""
    op_parts = _split_field(op_field)
    referrer = ""
    if len(op_parts) >= 3:
        referrer = f"Dr. {op_parts[2]} {op_parts[1]}".strip()
    elif op_parts:
        referrer = op_parts[0]

    # OBR-24: diagnostic service section ID (modality)
    modality_raw = fields[24].strip().upper() if len(fields) > 24 else ""
    modality = _MODALITY_MAP.get(modality_raw, "")
    if not modality:
        # Fallback: infer from procedure text
        upper_text = f"{procedure_text} {procedure_code}".upper()
        for key, m in _MODALITY_MAP.items():
            if key in upper_text:
                modality = m
                break
    if not modality:
        modality = "CR"  # default X-ray

    # Body part from procedure text
    body_part = ""
    upper_text = f"{procedure_text} {procedure_code}".upper()
    for hint, bp in _BODY_PART_HINTS.items():
        if hint in upper_text:
            body_part = bp
            break
    if not body_part:
        body_part = "OTHER"

    return {
        "accession": accession,
        "placer": placer_field,
        "procedure_code": procedure_code,
        "procedure_text": procedure_text,
        "priority": priority,
        "observation_datetime": obs_dt,
        "referrer": referrer,
        "modality": modality,
        "body_part": body_part,
    }


def _extract_msh(msh_segment: str) -> dict:
    """Extract MSH sending app + control ID."""
    fields = msh_segment.split("|")
    return {
        "sending_app": fields[3] if len(fields) > 3 else "",
        "sending_facility": fields[4] if len(fields) > 4 else "",
        "control_id": fields[10] if len(fields) > 10 else "",
        "version": fields[12] if len(fields) > 12 else "",
    }


def parse_orm(hl7_text: str) -> tuple[dict | None, dict | None]:
    """Parse an HL7 v2 ORM^O01 message.

    Returns (study_record, msh_info). study_record is None if unparseable.
    msh_info is always populated when MSH is present (used for ACK control ID).
    """
    if not hl7_text or not hl7_text.startswith("MSH"):
        log.warning("hl7: not a valid message (no MSH prefix)")
        return None, None

    # HL7 segments separated by \r (0x0D)
    segments = re.split(r"[\r\n]+", hl7_text)
    segments = [s for s in segments if s.strip()]

    seg_by_type: dict[str, str] = {}
    for seg in segments:
        seg_type = seg[:3]
        # Keep first occurrence (repeat handled per-segment above)
        if seg_type not in seg_by_type:
            seg_by_type[seg_type] = seg

    msh_info = _extract_msh(seg_by_type.get("MSH", ""))

    pid_seg = seg_by_type.get("PID")
    obr_seg = seg_by_type.get("OBR")
    if not pid_seg or not obr_seg:
        log.warning("hl7: missing PID or OBR segment")
        return None, msh_info

    pid = _extract_pid(pid_seg)
    obr = _extract_obr(obr_seg)
    if not pid.get("patient_id"):
        log.warning("hl7: missing patient_id in PID")
        return None, msh_info

    # Derive StudyInstanceUID
    accession = obr.get("accession", "").strip()
    if accession:
        study_uid = f"1.2.826.0.1.midcine.{accession}"
    else:
        study_uid = f"1.2.826.0.1.midcine.{pid['patient_id']}.{int(datetime.now(UTC).timestamp())}"

    # Study date from OBR-7 or fallback to now
    obs_dt = obr.get("observation_datetime", "")
    if len(obs_dt) >= 8:
        try:
            year = obs_dt[:4]
            month = obs_dt[4:6] or "01"
            day = obs_dt[6:8] or "01"
            hour = obs_dt[8:10] or "00"
            minute = obs_dt[10:12] or "00"
            second = obs_dt[12:14] or "00"
            study_date = f"{year}-{month}-{day}T{hour}:{minute}:{second}"
        except (ValueError, IndexError):
            study_date = datetime.now(UTC).isoformat()
    else:
        study_date = datetime.now(UTC).isoformat()

    record = {
        "study_uid": study_uid,
        "patient_id": pid["patient_id"],
        "patient_name": pid["patient_name"],
        "age": pid.get("age"),
        "sex": pid.get("sex", "U"),
        "modality": obr["modality"],
        "body_part": obr["body_part"],
        "priority": obr["priority"],
        "study_date": study_date,
        "description": obr.get("procedure_text") or obr.get("procedure_code") or "",
        "referrer": obr.get("referrer", ""),
        "status": "pending",
        "ai_confidence": None,
        "suggested_finding": None,
        "hospital_id": msh_info.get("sending_facility") or "default",
    }
    return record, msh_info


def build_ack(msh_info: dict, ok: bool = True, error: str = "") -> str:
    """Build HL7 v2 ACK message (MSA|AA or MSA|AR)."""
    now = datetime.now(UTC).strftime("%Y%m%d%H%M%S")
    control_id = msh_info.get("control_id", "0") if msh_info else "0"
    sending_facility = msh_info.get("sending_facility", "MIDCINE") if msh_info else "MIDCINE"
    status = "AA" if ok else "AR"
    msh = f"MSH|^~\\&|MIDCINE|MIDCINE|{sending_facility}|EXT|{now}||ACK^O01|{control_id}|P|2.5"
    msa_line = f"MSA|{status}|{control_id}"
    if error:
        msa_line += f"|{error[:80]}"
    return f"{msh}\r{msa_line}\r"
