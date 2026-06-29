from typing import Literal

from pydantic import BaseModel, Field

Channel = Literal["whatsapp", "sms", "inapp"]
ConsentStatus = Literal["pending", "approved", "denied", "expired"]


class ConsentCreate(BaseModel):
    patient_id: str
    requesting_hospital_id: str
    target_hospital_id: str
    reason: str = Field(min_length=10)
    channels: list[Channel]


class ConsentCreated(BaseModel):
    consent_id: str
    expires_at: str


class ConsentStatusResponse(BaseModel):
    consent_id: str
    status: ConsentStatus
    approved_at: str | None = None
    denied_at: str | None = None
    expires_at: str


class ConsentDecision(BaseModel):
    consent_id: str
    otp: str
    approve: bool
