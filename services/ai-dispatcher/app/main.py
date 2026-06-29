from contextlib import asynccontextmanager
from typing import Any

import httpx
import sentry_sdk
from fastapi import FastAPI, HTTPException
from prometheus_fastapi_instrumentator import Instrumentator
from pydantic import BaseModel

from .config import settings
from .logging import configure_logging, get_logger
from .routing import load_rules, pick_models
from .specialists import fan_out

configure_logging()
log = get_logger()

if settings.sentry_dsn:
    sentry_sdk.init(dsn=settings.sentry_dsn, environment=settings.sentry_env)


class DispatchRequest(BaseModel):
    study_uid: str
    modality: str
    body_part: str | None = None
    priority: str = "P3"
    force_models: list[str] | None = None


class DispatchResponse(BaseModel):
    study_uid: str
    models_invoked: list[str]
    per_model_outputs: list[dict[str, Any]]
    aggregated: dict[str, Any] | None = None
    latency_ms: float


_state: dict[str, Any] = {}


@asynccontextmanager
async def lifespan(_: FastAPI):
    rules = load_rules(settings.routing_rules_path)
    log.info("rules_loaded", count=len(rules))
    _state["rules"] = rules
    _state["http"] = httpx.AsyncClient(timeout=settings.parallel_timeout_sec)
    try:
        yield
    finally:
        await _state["http"].aclose()


app = FastAPI(
    title="midcine AI Dispatcher",
    description="Routes studies to specialist AI models in parallel (ensemble brain)",
    version="0.1.0",
    lifespan=lifespan,
)

Instrumentator().instrument(app).expose(app, endpoint="/metrics")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.service_name}


@app.get("/ready")
async def ready() -> dict[str, Any]:
    rules = _state.get("rules", [])
    return {
        "status": "ready" if rules else "degraded",
        "rules_loaded": len(rules),
    }


@app.post("/v1/dispatch", response_model=DispatchResponse)
async def dispatch(req: DispatchRequest) -> DispatchResponse:
    import time

    started = time.perf_counter()

    rules = _state.get("rules", [])
    models = req.force_models or pick_models(
        rules, {"modality": req.modality, "body_part": req.body_part or ""}
    )
    if not models:
        raise HTTPException(404, "no matching specialists for this study")

    payload = req.model_dump()
    results = await fan_out(_state["http"], models, payload)
    elapsed_ms = (time.perf_counter() - started) * 1000

    log.info("dispatch_done", study_uid=req.study_uid, models=models, elapsed_ms=elapsed_ms)

    return DispatchResponse(
        study_uid=req.study_uid,
        models_invoked=models,
        per_model_outputs=results,
        aggregated=None,  # TODO Sprint 4: call aggregator
        latency_ms=elapsed_ms,
    )


@app.get("/v1/dispatch/{study_uid}")
async def get_dispatch_result(study_uid: str) -> dict[str, Any]:
    """Read previously dispatched result from cache. Stub — implemented Sprint 4."""
    return {"study_uid": study_uid, "cached": False, "todo": "Sprint 4"}
