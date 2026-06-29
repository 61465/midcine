import sentry_sdk
from fastapi import FastAPI
from prometheus_fastapi_instrumentator import Instrumentator

from .aggregator import aggregate
from .config import settings
from .schemas import AggregateRequest, AggregateResponse

if settings.sentry_dsn:
    sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.sentry_env)

app = FastAPI(
    title="midcine AI Aggregator",
    description="Consensus + conflict + citation aggregator",
    version="0.1.0",
)
Instrumentator().instrument(app).expose(app, endpoint="/metrics")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name}


@app.post("/v1/aggregate", response_model=AggregateResponse)
async def aggregate_endpoint(req: AggregateRequest) -> AggregateResponse:
    return aggregate(req)
