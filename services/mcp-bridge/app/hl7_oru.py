"""HL7 v2 ORU^R01 sender — pushes signed radiology reports back to the HIS.

Closes the integration loop:
  HIS -> ORM^O01 (hl7-listener) -> midcine reads -> radiologist signs
    -> ORU^R01 (this module) -> HIS receives + files the report

Standards: HL7 v2.5 messaging + IHE SWF (report distribution).
"""

from __future__ import annotations

import logging
import socket
import time
from datetime import UTC, datetime

from .report import FinalReport

log = logging.getLogger("hl7-oru")

MLLP_START = b"\x0b"
MLLP_END = b"\x1c\x0d"


def _hl7_escape(text: str) -> str:
    """Escape HL7 delimiters per v2.5 encoding rules."""
    if not text:
        return ""
    # Encoding characters per MSH-2: |^~\&
    return (
        text.replace("\\", "\\E\\")
        .replace("|", "\\F\\")
        .replace("^", "\\S\\")
        .replace("~", "\\R\\")
        .replace("&", "\\T\\")
        .replace("\r", " ")
        .replace("\n", " ")
    )


def _accession(study_uid: str) -> str:
    if "." in study_uid:
        tail = study_uid.split(".")[-1]
        if tail:
            return tail[:16]
    return study_uid[-16:]


def build_oru(
    report: FinalReport,
    sending_facility: str = "MIDCINE",
    receiving_app: str = "HIS",
    receiving_facility: str = "HOSPITAL",
) -> str:
    """Build an HL7 v2.5 ORU^R01 message from a signed FinalReport.

    Message structure:
      MSH  header
      PID  patient identification
      OBR  observation request (accession)
      OBX  observation value — one per report section
    """
    now = datetime.now(UTC)
    ts = now.strftime("%Y%m%d%H%M%S")
    control_id = f"MIDCINE-{int(time.time() * 1000)}"
    accession = _accession(report.study_uid)

    patient_name = _hl7_escape(report.patient_name or "UNKNOWN")
    patient_id = _hl7_escape(report.patient_id or "")

    # Patient name in DICOM PN format converts to HL7 XPN: Family^Given
    if "^" not in patient_name:
        parts = patient_name.split(None, 1)
        if len(parts) == 2:
            patient_name = f"{parts[0]}^{parts[1]}"

    signed_by = _hl7_escape(report.signed_by or "")
    license_no = _hl7_escape(report.license_no or "")
    result_status = "F" if report.signed_at else "P"  # Final or Preliminary

    segments: list[str] = []
    segments.append(
        f"MSH|^~\\&|MIDCINE|{sending_facility}|{receiving_app}|{receiving_facility}"
        f"|{ts}||ORU^R01|{control_id}|P|2.5"
    )
    segments.append(f"PID|1||{patient_id}||{patient_name}||||")
    segments.append(
        f"OBR|1||{accession}"
        f"|{report.modality}-{report.body_part}^{_hl7_escape(report.body_part)}"
        f"||{ts}|{ts}||||||||||{signed_by}^{license_no}"
        f"||||||||{report.modality}||||||^^^{ts}^^{result_status}"
    )

    # OBX per section — TX = free text
    seq = 1
    for section in report.sections:
        section_id = section.key.upper()
        title = _hl7_escape(section.title_ar)
        content = _hl7_escape(section.content_ar)
        segments.append(f"OBX|{seq}|TX|{section_id}^{title}||{content}||||||{result_status}")
        seq += 1

    if report.impression_ar:
        segments.append(
            f"OBX|{seq}|TX|IMPRESSION^Impression||{_hl7_escape(report.impression_ar)}||||||{result_status}"
        )
        seq += 1

    for i, rec in enumerate(report.recommendations_ar, 1):
        segments.append(
            f"OBX|{seq}|TX|REC_{i}^Recommendation||{_hl7_escape(rec)}||||||{result_status}"
        )
        seq += 1

    return "\r".join(segments) + "\r"


class OruSendError(Exception):
    """Raised when the HL7 ORU send fails."""


def send_oru(
    hl7_text: str,
    host: str,
    port: int,
    timeout: float = 10.0,
) -> tuple[str, str]:
    """Send an HL7 message over MLLP and return (ack_code, control_id) parsed from MSA.

    Raises OruSendError on network failure or if peer sends MSA|AR / MSA|AE.
    """
    frame = MLLP_START + hl7_text.encode("utf-8") + MLLP_END
    try:
        with socket.create_connection((host, port), timeout=timeout) as sock:
            sock.sendall(frame)
            buf = b""
            deadline = time.time() + timeout
            while time.time() < deadline:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                buf += chunk
                if MLLP_END in buf:
                    break
    except (OSError, TimeoutError) as e:
        raise OruSendError(f"network error: {e}") from e

    start = buf.find(MLLP_START)
    end = buf.find(MLLP_END, start + 1) if start >= 0 else -1
    if start < 0 or end < 0:
        raise OruSendError("no MLLP-framed ACK received")

    ack_text = buf[start + 1 : end].decode("utf-8", errors="replace")

    ack_code = "??"
    ctrl_id = ""
    for line in ack_text.replace("\n", "\r").split("\r"):
        if line.startswith("MSA"):
            parts = line.split("|")
            ack_code = parts[1] if len(parts) > 1 else "??"
            ctrl_id = parts[2] if len(parts) > 2 else ""
            break

    if ack_code != "AA":
        raise OruSendError(f"HIS rejected: MSA|{ack_code}")

    log.info("hl7-oru: sent %s -> ACK %s", ctrl_id or "?", ack_code)
    return ack_code, ctrl_id
