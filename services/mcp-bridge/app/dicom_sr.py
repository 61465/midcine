"""DICOM Structured Report generator — Basic Text SR (SOP 1.2.840.10008.5.1.4.1.1.88.11).

Turns a signed FinalReport into a valid DICOM SR that any conformant PACS can
ingest via C-STORE. This makes the report machine-readable — a hard requirement
for real hospital deployment.

Standards: DICOM PS3.3 A.35.1 (Basic Text SR IOD).

Design decision: we use raw pydicom rather than highdicom's high-level SR builder
because our report is simple free text — no coded measurements or SR trees.
Basic Text SR (SOP 1.2.840.10008.5.1.4.1.1.88.11) is the right IOD for that.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from io import BytesIO

from pydicom.dataset import Dataset, FileDataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, generate_uid

from .report import FinalReport

log = logging.getLogger("dicom-sr")

BASIC_TEXT_SR_SOP_CLASS = "1.2.840.10008.5.1.4.1.1.88.11"


def _sanitize_uid(uid: str) -> str:
    """Ensure UID matches DICOM PS3.5 UI VR: [0-9.]+ max 64 chars."""
    if not uid:
        return generate_uid()
    if all(c in "0123456789." for c in uid):
        return uid[:64]
    clean_parts: list[str] = []
    for part in uid.split("."):
        if part.isdigit():
            clean_parts.append(str(int(part)))
        else:
            clean_parts.append(str(abs(hash(part)) % 10**8))
    out = ".".join(p for p in clean_parts if p)
    return out[:64] if out else generate_uid()


def _format_pn(name: str) -> str:
    """Convert 'Family Given' to DICOM PN format 'Family^Given'."""
    if not name or "^" in name:
        return name or ""
    parts = name.strip().split(None, 1)
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]}^{parts[1]}"


def _add_text_content_item(
    parent_sq: list[Dataset], name_code: tuple[str, str, str], text: str
) -> None:
    """Append a TEXT content item to a ContentSequence."""
    item = Dataset()
    item.RelationshipType = "CONTAINS"
    item.ValueType = "TEXT"

    concept_name = Dataset()
    concept_name.CodeValue = name_code[0]
    concept_name.CodingSchemeDesignator = name_code[1]
    concept_name.CodeMeaning = name_code[2]
    item.ConceptNameCodeSequence = [concept_name]

    # TextValue is UT (Unlimited Text) — supports Arabic via SpecificCharacterSet
    item.TextValue = text or ""
    parent_sq.append(item)


# DICOM Content Mapping Resource (DCM) codes for report sections
_SECTION_CODES: dict[str, tuple[str, str, str]] = {
    "patient": ("121118", "DCM", "Patient Characteristics"),
    "technique": ("121048", "DCM", "Choice of Technique"),
    "findings": ("121070", "DCM", "Findings"),
    "impression": ("121072", "DCM", "Impression"),
    "recommendations": ("121076", "DCM", "Conclusions"),
}


def build_sr(report: FinalReport) -> FileDataset:
    """Build a valid Basic Text SR FileDataset from a FinalReport."""
    now = datetime.now(UTC)
    content_date = now.strftime("%Y%m%d")
    content_time = now.strftime("%H%M%S")

    # UIDs
    study_uid = _sanitize_uid(report.study_uid)
    series_uid = generate_uid()
    sop_uid = generate_uid()

    # File Meta
    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = BASIC_TEXT_SR_SOP_CLASS
    file_meta.MediaStorageSOPInstanceUID = sop_uid
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    # ImplementationClassUID: private prefix under 1.2.826.0.1 (IANA), root registered to midcine
    file_meta.ImplementationClassUID = generate_uid(prefix="1.2.826.0.1.99999.")
    file_meta.ImplementationVersionName = "midcine-0.2"

    # Main dataset
    ds = FileDataset("", {}, file_meta=file_meta, preamble=b"\0" * 128)

    # SOP Common
    ds.SOPClassUID = BASIC_TEXT_SR_SOP_CLASS
    ds.SOPInstanceUID = sop_uid
    ds.SpecificCharacterSet = "ISO_IR 192"  # UTF-8 for Arabic

    # Patient Module
    ds.PatientName = _format_pn(report.patient_name or "UNKNOWN")
    ds.PatientID = report.patient_id or ""
    ds.PatientBirthDate = ""
    ds.PatientSex = ""

    # General Study Module
    ds.StudyInstanceUID = study_uid
    ds.StudyDate = content_date
    ds.StudyTime = content_time
    ds.ReferringPhysicianName = ""
    ds.StudyID = report.study_uid[-16:] if report.study_uid else ""
    ds.AccessionNumber = report.study_uid[-16:] if report.study_uid else ""

    # SR Document Series Module
    ds.Modality = "SR"
    ds.SeriesInstanceUID = series_uid
    ds.SeriesNumber = "1"

    # SR Document General Module
    ds.InstanceNumber = "1"
    ds.CompletionFlag = "COMPLETE" if report.signed_at else "PARTIAL"
    ds.VerificationFlag = "VERIFIED" if report.signed_by else "UNVERIFIED"
    ds.ContentDate = content_date
    ds.ContentTime = content_time

    if report.signed_at and report.signed_by:
        ver_item = Dataset()
        ver_item.VerifyingObserverName = _format_pn(report.signed_by)
        ver_item.VerifyingOrganization = report.hospital_id or "midcine"
        # signed_at is a datetime already
        try:
            va_dt = report.signed_at
            if isinstance(va_dt, str):
                va_dt = datetime.fromisoformat(va_dt.replace("Z", "+00:00"))
            ver_item.VerificationDateTime = va_dt.strftime("%Y%m%d%H%M%S")
        except (ValueError, TypeError, AttributeError):
            ver_item.VerificationDateTime = f"{content_date}{content_time}"
        ds.VerifyingObserverSequence = [ver_item]

    # SR Document Content Module — root container
    ds.ValueType = "CONTAINER"

    # Root concept name — 121111 = "Summary Report"
    root_concept = Dataset()
    root_concept.CodeValue = "121111"
    root_concept.CodingSchemeDesignator = "DCM"
    root_concept.CodeMeaning = "Summary Report"
    ds.ConceptNameCodeSequence = [root_concept]

    ds.ContinuityOfContent = "SEPARATE"

    # Content sequence — one text item per section
    content_seq: list[Dataset] = []

    for section in report.sections:
        code_tuple = _SECTION_CODES.get(
            section.key, ("121000", "DCM", section.title_ar or section.key)
        )
        _add_text_content_item(content_seq, code_tuple, section.content_ar or "")

    ds.ContentSequence = content_seq

    return ds


def encode_sr(report: FinalReport) -> bytes:
    """Build + serialize the SR to a bytes buffer ready to C-STORE or download."""
    ds = build_sr(report)
    buf = BytesIO()
    ds.save_as(buf, write_like_original=False)
    return buf.getvalue()


def encode_sr_dict(report: FinalReport) -> dict:
    """Return a JSON-friendly summary for verification (used by REST endpoint)."""
    ds = build_sr(report)
    return {
        "sop_class_uid": str(ds.SOPClassUID),
        "sop_instance_uid": str(ds.SOPInstanceUID),
        "study_instance_uid": str(ds.StudyInstanceUID),
        "series_instance_uid": str(ds.SeriesInstanceUID),
        "modality": str(ds.Modality),
        "completion_flag": str(ds.CompletionFlag),
        "verification_flag": str(ds.VerificationFlag),
        "sections_count": len(ds.ContentSequence),
        "byte_size": len(encode_sr(report)),
    }
