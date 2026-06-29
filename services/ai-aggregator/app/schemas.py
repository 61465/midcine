from pydantic import BaseModel, Field


class SpecialistOutput(BaseModel):
    model: str
    ok: bool
    data: dict | None = None
    error: str | None = None


class Finding(BaseModel):
    text: str
    confidence: float = Field(ge=0, le=1)
    models: list[str]


class Impression(BaseModel):
    text: str
    confidence: float = Field(ge=0, le=1)


class Citation(BaseModel):
    source: str
    chunk_id: str
    model: str | None = None


class Disagreement(BaseModel):
    models: list[str]
    topic: str
    detail: str


class AggregateRequest(BaseModel):
    study_uid: str
    specialist_outputs: list[SpecialistOutput]


class AggregateResponse(BaseModel):
    study_uid: str
    findings: list[Finding]
    impressions: list[Impression]
    recommendations: list[str]
    overall_confidence: float
    requires_human_review: bool
    disagreements: list[Disagreement]
    citations: list[Citation]
    model_versions: dict[str, str]
