from contextlib import asynccontextmanager
from typing import Any

import asyncpg
import sentry_sdk
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from .config import settings
from .schemas import HospitalMatch, PmiLookupRequest, PmiLookupResponse

if settings.sentry_dsn:
    sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.sentry_env)

_state: dict[str, Any] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    _state["pool"] = await asyncpg.create_pool(
        host=settings.postgres_host,
        port=settings.postgres_port,
        database=settings.postgres_db,
        user=settings.postgres_user,
        password=settings.postgres_password,
        min_size=2,
        max_size=10,
    )
    try:
        yield
    finally:
        await _state["pool"].close()


app = FastAPI(
    title="midcine Cloud Index",
    description="PMI hash lookup — no PII stored, only hashes + hospital pointers",
    version="0.1.0",
    lifespan=lifespan,
)
Instrumentator().instrument(app).expose(app, endpoint="/metrics")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name}


@app.post("/v1/pmi/lookup", response_model=PmiLookupResponse)
async def lookup(req: PmiLookupRequest) -> PmiLookupResponse:
    """Return hospitals that hold studies for this hashed national ID.

    No PII is stored here. The hospital computes the hash with a shared salt and
    submits it. We respond with hospital pointers only — actual transfer requires
    consent via the consent service and goes peer-to-peer via tunnel-broker.
    """
    async with _state["pool"].acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT hospital_id, hospital_name, study_count, last_study_date::text
            FROM cross_tenant_pmi
            WHERE national_id_hash = $1
            """,
            req.national_id_hash,
        )

    matches = [
        HospitalMatch(
            hospital_id=str(r["hospital_id"]),
            hospital_name=str(r["hospital_name"]),
            study_count=int(r["study_count"]),
            last_study_date=r["last_study_date"],
        )
        for r in rows
    ]
    return PmiLookupResponse(found=bool(matches), hospitals=matches, requires_consent=True)


@app.post("/v1/pmi/register")
async def register() -> dict[str, str]:
    """Hospital registers a hash → its tenant. Implemented Sprint 8."""
    return {"status": "todo", "sprint": "8"}
