from pydantic import BaseModel, Field


class PmiLookupRequest(BaseModel):
    national_id_hash: str = Field(min_length=32, description="SHA-256 hex of salted national id")


class HospitalMatch(BaseModel):
    hospital_id: str
    hospital_name: str
    study_count: int
    last_study_date: str | None = None


class PmiLookupResponse(BaseModel):
    found: bool
    hospitals: list[HospitalMatch] = []
    requires_consent: bool = True
