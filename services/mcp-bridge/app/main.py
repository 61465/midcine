"""mcp-bridge FastAPI entrypoint (scaffold — implementation in Sprint 1).

Endpoints:
- POST /dispatch    → given study metadata, return list of NEXUS agents to invoke
- POST /aggregate   → given specialist outputs, return consensus AggregateResponse
- GET  /health      → simple liveness
"""
from __future__ import annotations

from fastapi import FastAPI

app = FastAPI(title="midcine mcp-bridge", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "mcp-bridge", "version": "0.1.0"}


@app.post("/dispatch")
async def dispatch(payload: dict) -> dict:
    """Stub. Real implementation reads config/dispatch_rules.yaml and matches
    (modality, body_part) → list of NEXUS agent names. Sprint 1 deliverable.
    """
    return {
        "study_uid": payload.get("study_uid"),
        "agents": ["vision_ai", "clinical_llm"],
        "_note": "stub — see docs/13-BUILD-PLAN-v3.md Sprint 1",
    }


@app.post("/aggregate")
async def aggregate(payload: dict) -> dict:
    """Stub. Real implementation adapts docs/reference/v12-extracts/aggregator_pattern.py
    to merge NEXUS agent outputs into a unified AggregateResponse.
    """
    return {
        "study_uid": payload.get("study_uid"),
        "findings": [],
        "overall_confidence": 0.0,
        "requires_human_review": True,
        "_note": "stub — see docs/13-BUILD-PLAN-v3.md Sprint 1",
    }
