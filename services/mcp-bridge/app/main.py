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
from .audit import audit, read_recent
from .dispatcher import Dispatcher
from .report import (
    FinalReport,
    GenerateRequest,
    SignRequest,
    generate_from_aggregate,
    sign_report,
)
from .schemas import (
    AggregateRequest,
    AggregateResponse,
    DispatchRequest,
    DispatchResponse,
    HealthResponse,
    PipelineRequest,
    PipelineResponse,
)
from .studies_store import (
    PatientRecord,
    StudyRecord,
    get_patient,
    get_study,
    list_by_patient,
    list_patients,
    list_studies,
)
from .whatsapp_mock import (
    SendReportRequest,
    WhatsAppMessage,
    list_messages,
    send_report,
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
    agg = aggregate(
        AggregateRequest(study_uid=req.study.study_uid, outputs=outputs),
        body_part=req.study.body_part,
    )
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


# ─────────────────────────────────────────────────────────────────────────────
# Report + WhatsApp endpoints
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/report/generate", response_model=FinalReport)
def report_generate(req: GenerateRequest) -> FinalReport:
    """Build an editable Arabic report draft from AI outputs."""
    report = generate_from_aggregate(req.study, req.aggregate, req.outputs)
    audit(
        action="report.generate",
        tenant=report.hospital_id,
        target={"type": "study", "id": report.study_uid},
        meta={"modality": report.modality, "body_part": report.body_part},
    )
    return report


@app.post("/report/sign", response_model=FinalReport)
def report_sign(req: SignRequest) -> FinalReport:
    """Stamp the report with radiologist name + license + timestamp."""
    signed = sign_report(req)
    audit(
        action="report.sign",
        tenant=signed.hospital_id,
        actor={"type": "radiologist", "id": signed.signed_by or "?"},
        target={"type": "study", "id": signed.study_uid},
        meta={"license_no": signed.license_no},
    )
    return signed


@app.post("/whatsapp/send", response_model=WhatsAppMessage)
def whatsapp_send(req: SendReportRequest) -> WhatsAppMessage:
    """Deliver a signed report via WhatsApp (mock: writes to JSONL, returns delivered)."""
    return send_report(req)


@app.get("/whatsapp/messages")
def whatsapp_list(hospital_id: str, limit: int = 50) -> list[dict]:
    """List recent WhatsApp deliveries for a hospital tenant."""
    return list_messages(hospital_id=hospital_id, limit=limit)


# ─────────────────────────────────────────────────────────────────────────────
# Real data endpoints — read from local store. Empty until ingested.
# Never fabricates patient data.
# ─────────────────────────────────────────────────────────────────────────────


@app.get("/studies", response_model=list[StudyRecord])
def studies_list(hospital_id: str | None = None, limit: int = 200) -> list[StudyRecord]:
    """Return studies actually present in the local store. Empty until Orthanc/PACS wires in."""
    return list_studies(hospital_id=hospital_id, limit=limit)


@app.get("/studies/{study_uid}", response_model=StudyRecord)
def studies_get(study_uid: str) -> StudyRecord:
    rec = get_study(study_uid)
    if rec is None:
        # Return an empty shell so the reader page can still call /pipeline on any UID.
        return StudyRecord(
            study_uid=study_uid,
            patient_id="",
            patient_name="",
            modality="CT",
            body_part="BRAIN",
            study_date="",
        )
    return rec


@app.get("/patients/{patient_id}", response_model=PatientRecord | None)
def patients_get(patient_id: str) -> PatientRecord | None:
    return get_patient(patient_id)


@app.get("/patients", response_model=list[PatientRecord])
def patients_list(hospital_id: str | None = None) -> list[PatientRecord]:
    return list_patients(hospital_id=hospital_id)


@app.get("/patients/{patient_id}/studies", response_model=list[StudyRecord])
def patient_studies(patient_id: str) -> list[StudyRecord]:
    return list_by_patient(patient_id)


@app.get("/audit/recent")
def audit_recent(hospital_id: str | None = None, limit: int = 100) -> list[dict]:
    """Return recent audit-log entries (actual events, no fabrication)."""
    return read_recent(hospital_id=hospital_id, limit=limit)


@app.get("/integrations/health")
async def integrations_health() -> dict:
    """Probe actual dependencies. Reports true state (up/down/not-configured)."""
    naraya_ok = await health_check()
    return {
        "naraya": {
            "connected": naraya_ok,
            "backend": "mistral-large",
            "hint": "Cloud AI backend for NEXUS ensemble",
        },
        "orthanc": {
            "connected": False,
            "hint": "لم يُوصَل بعد — DICOM C-STORE :11113 عند التوصيل",
        },
        "hl7_ris": {
            "connected": False,
            "hint": "لم يُوصَل — تكامل HL7 v2 مع RIS المشفى",
        },
        "fhir_gateway": {
            "connected": False,
            "hint": "لم يُوصَل — FHIR R4 ImagingStudy + DiagnosticReport",
        },
        "whatsapp": {
            "connected": True,
            "mode": "mock",
            "hint": "Baileys محلي (mock) — يخزّن في data/whatsapp/. للإنتاج: Business API",
        },
        "backup": {
            "connected": False,
            "hint": "لم يُفعَّل — MinIO/S3 لنسخ احتياطي يومي",
        },
    }
