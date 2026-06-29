import sentry_sdk
from fastapi import FastAPI, HTTPException
from prometheus_fastapi_instrumentator import Instrumentator

from .config import settings
from .schemas import TunnelRequest, TunnelResponse

if settings.sentry_dsn:
    sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.sentry_env)

app = FastAPI(
    title="midcine Tunnel Broker",
    description="Short-lived mTLS for hospital-to-hospital P2P DICOM",
    version="0.1.0",
)
Instrumentator().instrument(app).expose(app, endpoint="/metrics")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name}


@app.post("/v1/tunnel/request", response_model=TunnelResponse)
async def request_tunnel(_: TunnelRequest) -> TunnelResponse:
    """Verify consent, mint cert pair from step-ca, return endpoints.

    Sprint 8 implements:
    - GET consent status → must be 'approved' and not expired
    - POST step-ca to mint two leaf certs (source + target) TTL 5min
    - Return both certs + STUN config for NAT traversal
    - Audit log entry
    """
    raise HTTPException(501, "implemented in Sprint 8")
