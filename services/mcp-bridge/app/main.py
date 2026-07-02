"""mcp-bridge FastAPI entrypoint — real implementation.

Endpoints:
  GET  /health     — liveness + backend reachability
  POST /dispatch   — study → agent list from dispatch_rules.yaml
  POST /aggregate  — combine agent outputs into unified report
  POST /pipeline   — one-shot: dispatch → parallel calls → aggregate
"""

from __future__ import annotations

import logging
import time
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .agents_client import fan_out, health_check
from .aggregator import aggregate
from .audit import audit
from .dispatcher import Dispatcher
from .schemas import (
    AggregateRequest,
    AggregateResponse,
    DispatchRequest,
    DispatchResponse,
    HealthResponse,
    PipelineRequest,
    PipelineResponse,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
log = logging.getLogger("mcp-bridge")

BASE = Path(__file__).resolve().parent.parent
RULES_PATH = BASE / "config" / "dispatch_rules.yaml"

_dispatcher = Dispatcher(RULES_PATH)

app = FastAPI(title="midcine mcp-bridge", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://ame.tail19ddab.ts.net"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    reachable = await health_check()
    return HealthResponse(
        status="ok" if reachable else "degraded",
        service="mcp-bridge",
        version="0.2.0",
        backend="naraya-mistral-large",
        backend_reachable=reachable,
    )


@app.post("/dispatch", response_model=DispatchResponse)
def dispatch(req: DispatchRequest) -> DispatchResponse:
    agents, matched = _dispatcher.match(req.study)
    log.info(
        "dispatch tenant=%s study=%s modality=%s body=%s -> %s",
        req.study.hospital_id or "default",
        req.study.study_uid,
        req.study.modality,
        req.study.body_part,
        agents,
    )
    return DispatchResponse(
        study_uid=req.study.study_uid,
        agents=agents,
        rule_matched={k: str(v) for k, v in (matched or {}).items()} or None,
    )


@app.post("/aggregate", response_model=AggregateResponse)
def aggregate_endpoint(req: AggregateRequest) -> AggregateResponse:
    return aggregate(req)


@app.post("/pipeline", response_model=PipelineResponse)
async def pipeline(req: PipelineRequest) -> PipelineResponse:
    started = time.perf_counter()
    agents, _matched = _dispatcher.match(req.study)
    tenant = req.study.hospital_id or "default"

    # Build a compact user prompt for the agents
    user_prompt = (
        f"Study: modality={req.study.modality} body_part={req.study.body_part}. "
        f"Patient: {req.study.patient_name or 'unknown'} (id={req.study.patient_id or 'n/a'}). "
        f"Clinical context: {req.study.clinical_context or 'not provided'}. "
        "Respond ONLY with the JSON object your role requires."
    )

    log.info("pipeline START tenant=%s study=%s agents=%s", tenant, req.study.study_uid, agents)
    audit(
        action="pipeline.start",
        tenant=tenant,
        target={"type": "study", "id": req.study.study_uid},
        meta={"modality": req.study.modality, "body_part": req.study.body_part, "agents": agents},
    )

    outputs = await fan_out(agents, user_prompt)
    agg = aggregate(AggregateRequest(study_uid=req.study.study_uid, outputs=outputs))
    total_ms = (time.perf_counter() - started) * 1000
    log.info(
        "pipeline END   tenant=%s study=%s latency=%.0fms consensus=%.2f review=%s",
        tenant,
        req.study.study_uid,
        total_ms,
        agg.overall_confidence,
        agg.requires_human_review,
    )
    audit(
        action="pipeline.end",
        tenant=tenant,
        target={"type": "study", "id": req.study.study_uid},
        ok=all(o.ok for o in outputs),
        meta={
            "total_latency_ms": int(total_ms),
            "consensus": round(agg.overall_confidence, 3),
            "requires_human_review": agg.requires_human_review,
            "outputs_ok": sum(1 for o in outputs if o.ok),
            "outputs_total": len(outputs),
        },
    )

    return PipelineResponse(
        study_uid=req.study.study_uid,
        dispatched_agents=agents,
        outputs=outputs,
        aggregate=agg,
        total_latency_ms=total_ms,
    )
