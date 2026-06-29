"""Shared Pydantic models — يُستخدم في كل الـ FastAPI services."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, Field

T = TypeVar("T")

Role = Literal["super_admin", "owner", "doctor", "technician", "read_only"]
Modality = Literal["CT", "MR", "CR", "DR", "US", "MG", "XA", "NM", "PT", "OT"]
ReadStatus = Literal["unread", "reading", "reported", "signed"]
TriageStatus = Literal["pending", "running", "done", "failed", "skipped"]
ReportStatus = Literal["draft", "reviewed", "signed", "amended", "retracted"]
InferenceType = Literal["triage", "measurement", "llm_draft", "llm_refine", "embedding"]


class ErrorEnvelope(BaseModel):
    code: str
    message_ar: str
    message_en: str
    request_id: str
    details: dict[str, Any] | None = None
    retryable: bool = False


class PageEnvelope(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None = None
    limit: int


class TenantContext(BaseModel):
    tenant_id: UUID
    user_id: UUID | None = None
    role: Role
    auth_method: Literal["password", "oidc", "mtls", "system"] = "system"


# === Ingestion ===

class InstanceMeta(BaseModel):
    study_instance_uid: str = Field(..., max_length=128)
    series_instance_uid: str = Field(..., max_length=128)
    sop_instance_uid: str = Field(..., max_length=128)
    patient_mrn: str = Field(..., max_length=64)
    patient_name_ar: str = Field(..., max_length=255)
    patient_dob: date | None = None
    patient_sex: Literal["M", "F", "U"] | None = None
    modality: Modality
    body_part: str | None = None
    study_date: date
    accession_number: str | None = None
    rows: int | None = None
    cols: int | None = None
    transfer_syntax: str | None = None
    hash_sha256: str = Field(..., pattern=r"^[0-9a-f]{64}$")
    size_bytes: int = Field(..., gt=0)
    description: str | None = None
    clinical_indication: str | None = None


class InstanceCreated(BaseModel):
    instance_id: UUID
    study_id: UUID
    series_id: UUID
    storage_uri: str


class StudyCompleteRequest(BaseModel):
    expected_instances: int = Field(..., gt=0)


class StudyCompleteResponse(BaseModel):
    study_id: UUID
    queued_for_ai: bool


# === Worklist / Reading ===

class PatientPublic(BaseModel):
    id: UUID
    mrn: str
    display_name: str
    age_at_study: int | None
    sex: Literal["M", "F", "U"] | None


class StudySummary(BaseModel):
    study_id: UUID
    study_uid: str
    patient: PatientPublic
    modality: Modality
    body_part: str | None
    description: str | None
    study_date: date
    received_at: datetime
    triage_priority: int = Field(..., ge=1, le=5)
    triage_label: str | None
    ai_confidence: float | None
    read_status: ReadStatus
    assigned_doctor_id: UUID | None
    num_instances: int


class WorklistFilter(BaseModel):
    status: ReadStatus | None = None
    modality: Modality | None = None
    priority_max: int | None = Field(None, ge=1, le=5)
    assigned_to: Literal["me", "any", "none"] | None = None
    limit: int = Field(50, ge=1, le=200)
    cursor: str | None = None


# === AI ===

class TriageRequest(BaseModel):
    study_uid: str
    tenant_id: UUID
    modality: Modality
    body_part: str | None = None
    instance_uris: list[str]


class TriageResult(BaseModel):
    inference_id: UUID
    label: str
    confidence: float = Field(..., ge=0.0, le=1.0)
    priority: int = Field(..., ge=1, le=5)
    heatmap_uri: str | None = None
    model: str
    model_version: str
    latency_ms: int


class MeasurementResult(BaseModel):
    inference_id: UUID
    measurements: dict[str, Any]
    model: str
    model_version: str
    latency_ms: int


# === LLM ===

class PatientContext(BaseModel):
    age: int | None
    sex: Literal["M", "F", "U"] | None
    clinical_indication: str | None


class LlmDraftRequest(BaseModel):
    study_uid: str
    tenant_id: UUID
    patient_context: PatientContext
    modality: Modality
    body_part: str | None
    ai_label: str | None
    ai_confidence: float | None
    ai_measurements: dict[str, Any] = Field(default_factory=dict)
    prior_report_id: UUID | None = None
    language: Literal["ar"] = "ar"


class ReportDraft(BaseModel):
    technique_ar: str
    findings_ar: str
    impression_ar: str
    recommendations_ar: str
    icd11_codes: list[str] = Field(default_factory=list)


class RagSource(BaseModel):
    source_type: str
    source_id: str
    snippet: str


class LlmDraftResult(BaseModel):
    inference_id: UUID
    report_draft: ReportDraft
    rag_sources: list[RagSource] = Field(default_factory=list)
    tokens: int
    latency_ms: int
    model: str


# === Reports ===

class ReportDraftRequest(ReportDraft):
    ai_acceptance: int | None = Field(None, ge=0, le=100)
    base_version: int = 1


class ReportSignRequest(BaseModel):
    signature_method: Literal["session", "pki"] = "session"
    pki_signature_b64: str | None = None
    totp_code: str | None = None


class ReportSigned(BaseModel):
    report_id: UUID
    status: ReportStatus
    signed_at: datetime
    pdf_url: str
    fhir_pushed: bool


# === Realtime ===

class RealtimeEvent(BaseModel):
    type: Literal[
        "WORKLIST_UPDATED",
        "STUDY_AI_READY",
        "LLM_DRAFT_READY",
        "BROADCAST",
    ]
    payload: dict[str, Any]
