"""Pydantic schemas for mcp-bridge — adapted from v12 aggregator, unified for mcp-bridge."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class StudyMetadata(BaseModel):
    study_uid: str
    modality: str = Field(description="e.g. CT, MR, CR, DR")
    body_part: str = Field(description="e.g. CHEST, BRAIN, ABDOMEN")
    patient_id: str | None = None
    patient_name: str | None = None
    clinical_context: str | None = Field(
        default=None, description="Optional clinical question / referrer notes"
    )
    hospital_id: str | None = Field(
        default=None,
        description="Per-hospital tenant id — pattern borrowed from thawani-v2 storeId. "
        "Prefixes every log line and future audit entry. PHI-safe: id only, no PHI in tenant key.",
    )


class DispatchRequest(BaseModel):
    study: StudyMetadata


class DispatchResponse(BaseModel):
    study_uid: str
    agents: list[str]
    rule_matched: dict[str, str] | None = None


class AgentOutput(BaseModel):
    agent: str
    ok: bool
    data: dict | None = None
    error: str | None = None
    latency_ms: float
    confidence: float | None = None
    summary: str | None = None


class AggregateRequest(BaseModel):
    study_uid: str
    outputs: list[AgentOutput]


class Finding(BaseModel):
    text: str
    confidence: float
    agents: list[str]


class Disagreement(BaseModel):
    agents: list[str]
    topic: str
    detail: str


class AggregateResponse(BaseModel):
    study_uid: str
    findings: list[Finding]
    disagreements: list[Disagreement]
    overall_confidence: float
    requires_human_review: bool
    agent_versions: dict[str, str]


class PipelineRequest(BaseModel):
    study: StudyMetadata


class PipelineResponse(BaseModel):
    study_uid: str
    dispatched_agents: list[str]
    outputs: list[AgentOutput]
    aggregate: AggregateResponse
    total_latency_ms: float


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded", "down"]
    service: str
    version: str
    backend: str
    backend_reachable: bool
