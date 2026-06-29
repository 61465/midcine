import uuid
from datetime import datetime, timedelta, timezone

import sentry_sdk
from fastapi import FastAPI, HTTPException
from prometheus_fastapi_instrumentator import Instrumentator

from .config import settings
from .schemas import (
    ConsentCreate,
    ConsentCreated,
    ConsentDecision,
    ConsentStatusResponse,
)

if settings.sentry_dsn:
    sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.sentry_env)

app = FastAPI(
    title="midcine Consent",
    description="Cross-hospital consent flow",
    version="0.1.0",
)
Instrumentator().instrument(app).expose(app, endpoint="/metrics")

# In-memory store for skeleton — replaced by Postgres + Redis in Sprint 8.
_store: dict[str, dict] = {}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name}


@app.post("/v1/consent/request", response_model=ConsentCreated)
async def create_consent(req: ConsentCreate) -> ConsentCreated:
    consent_id = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.consent_ttl_hours)
    _store[consent_id] = {
        "status": "pending",
        "patient_id": req.patient_id,
        "requesting_hospital_id": req.requesting_hospital_id,
        "target_hospital_id": req.target_hospital_id,
        "channels": req.channels,
        "expires_at": expires_at.isoformat(),
    }
    # TODO Sprint 8: dispatch OTP via WhatsApp/SMS, persist in Postgres
    return ConsentCreated(consent_id=consent_id, expires_at=expires_at.isoformat())


@app.get("/v1/consent/{consent_id}", response_model=ConsentStatusResponse)
async def get_status(consent_id: str) -> ConsentStatusResponse:
    record = _store.get(consent_id)
    if not record:
        raise HTTPException(404, "consent not found")
    return ConsentStatusResponse(
        consent_id=consent_id,
        status=record["status"],
        approved_at=record.get("approved_at"),
        denied_at=record.get("denied_at"),
        expires_at=record["expires_at"],
    )


@app.post("/v1/consent/decide")
async def decide(req: ConsentDecision) -> dict[str, str]:
    record = _store.get(req.consent_id)
    if not record:
        raise HTTPException(404, "consent not found")
    if record["status"] != "pending":
        raise HTTPException(409, f"already {record['status']}")
    # TODO Sprint 8: real OTP verification
    record["status"] = "approved" if req.approve else "denied"
    record[f"{record['status']}_at"] = datetime.now(timezone.utc).isoformat()
    return {"status": record["status"]}
