"""mcp-bridge FastAPI entrypoint — real implementation.

Endpoints:
  GET  /health     — liveness + backend reachability
  POST /dispatch   — study → agent list from dispatch_rules.yaml
  POST /aggregate  — combine agent outputs into unified report
  POST /pipeline   — one-shot: dispatch → parallel calls → aggregate
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .agents_client import fan_out, fan_out_stream, health_check
from .aggregator import aggregate
from .audit import audit, read_recent
from .dicom_sr import encode_sr, encode_sr_dict
from .dispatcher import Dispatcher
from .hl7_oru import OruSendError, build_oru, send_oru
from .pdf_report import build_pdf
from .phi_redactor import redact_study_prompt
from .report import (
    FinalReport,
    GenerateRequest,
    SignRequest,
    generate_from_aggregate,
    sign_report,
)
from .reports_store import load_report, save_report
from .schemas import (
    AggregateRequest,
    AggregateResponse,
    DispatchRequest,
    DispatchResponse,
    HealthResponse,
    PipelineRequest,
    PipelineResponse,
)
from .share_links import verify as verify_share_token
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
    # midcine is local-only during pilot; expand this list per-hospital when
    # deploying to an on-prem edge box with a hospital-specific hostname.
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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

    # Build a PHI-safe prompt for the agents.
    # Patient name + IDs never reach the cloud LLM. Age coarsened to decade.
    user_prompt, redaction_map = redact_study_prompt(
        modality=req.study.modality,
        body_part=req.study.body_part,
        patient_name=req.study.patient_name,
        patient_id=req.study.patient_id,
        age=None,  # not in StudyMetadata schema; would come from patient store
        sex=None,
        clinical_context=req.study.clinical_context,
    )

    log.info(
        "pipeline START tenant=%s study=%s agents=%s phi_redactions=%d",
        tenant,
        req.study.study_uid,
        agents,
        len(redaction_map),
    )
    audit(
        action="pipeline.start",
        tenant=tenant,
        target={"type": "study", "id": req.study.study_uid},
        meta={
            "modality": req.study.modality,
            "body_part": req.study.body_part,
            "agents": agents,
            "phi_redactions": len(redaction_map),
        },
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


@app.post("/pipeline/stream")
async def pipeline_stream(req: PipelineRequest) -> StreamingResponse:
    """SSE stream — emits each agent's output as it finishes.

    Event schema:
      event: dispatched  data: {"agents": [...]}
      event: agent_done  data: {AgentOutput dict}
      event: aggregate   data: {AggregateResponse dict}
      event: done        data: {"total_latency_ms": N}
    """
    started = time.perf_counter()
    agents, _matched = _dispatcher.match(req.study)
    tenant = req.study.hospital_id or "default"

    user_prompt, redaction_map = redact_study_prompt(
        modality=req.study.modality,
        body_part=req.study.body_part,
        patient_name=req.study.patient_name,
        patient_id=req.study.patient_id,
        age=None,
        sex=None,
        clinical_context=req.study.clinical_context,
    )

    log.info(
        "pipeline/stream START tenant=%s study=%s agents=%s phi_redactions=%d",
        tenant,
        req.study.study_uid,
        agents,
        len(redaction_map),
    )
    audit(
        action="pipeline.stream.start",
        tenant=tenant,
        target={"type": "study", "id": req.study.study_uid},
        meta={
            "modality": req.study.modality,
            "body_part": req.study.body_part,
            "agents": agents,
            "phi_redactions": len(redaction_map),
        },
    )

    async def event_gen():
        yield f"event: dispatched\ndata: {json.dumps({'agents': agents, 'study_uid': req.study.study_uid})}\n\n"

        q = await fan_out_stream(agents, user_prompt)
        outputs: list = []
        while True:
            item = await q.get()
            if item is None:
                break
            outputs.append(item)
            yield f"event: agent_done\ndata: {item.model_dump_json()}\n\n"

        agg = aggregate(
            AggregateRequest(study_uid=req.study.study_uid, outputs=outputs),
            body_part=req.study.body_part,
        )
        yield f"event: aggregate\ndata: {agg.model_dump_json()}\n\n"

        total_ms = (time.perf_counter() - started) * 1000
        audit(
            action="pipeline.stream.end",
            tenant=tenant,
            target={"type": "study", "id": req.study.study_uid},
            ok=all(o.ok for o in outputs),
            meta={
                "total_latency_ms": int(total_ms),
                "consensus": round(agg.overall_confidence, 3),
                "outputs_ok": sum(1 for o in outputs if o.ok),
                "outputs_total": len(outputs),
            },
        )
        yield f"event: done\ndata: {json.dumps({'total_latency_ms': total_ms})}\n\n"

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
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
    """Stamp with radiologist + license + timestamp. Persist so share links can retrieve."""
    signed = sign_report(req)
    save_report(signed)
    audit(
        action="report.sign",
        tenant=signed.hospital_id,
        actor={"type": "radiologist", "id": signed.signed_by or "?"},
        target={"type": "study", "id": signed.study_uid},
        meta={"license_no": signed.license_no},
    )
    return signed


@app.get("/reports/{study_uid}", response_model=FinalReport | None)
def report_get(study_uid: str) -> FinalReport | None:
    """Retrieve a persisted signed report by study_uid."""
    return load_report(study_uid)


@app.get("/reports/{study_uid}/pdf")
def report_pdf_get(study_uid: str) -> Response:
    """Return the PDF of a persisted report, or 404."""
    rpt = load_report(study_uid)
    if rpt is None:
        return Response(status_code=404, content=b"Report not found")
    data = build_pdf(rpt)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (f'inline; filename="report-{study_uid[-12:]}.pdf"'),
        },
    )


@app.get("/reports/{study_uid}/sr")
def report_sr_get(study_uid: str) -> Response:
    """Return the DICOM SR of a persisted report, or 404."""
    rpt = load_report(study_uid)
    if rpt is None:
        return Response(status_code=404, content=b"Report not found")
    data = encode_sr(rpt)
    return Response(
        content=data,
        media_type="application/dicom",
        headers={
            "Content-Disposition": (f'attachment; filename="report-{study_uid[-12:]}.dcm"'),
        },
    )


@app.post("/whatsapp/send", response_model=WhatsAppMessage)
def whatsapp_send(req: SendReportRequest) -> WhatsAppMessage:
    """Deliver a signed report via WhatsApp (mock: writes to JSONL, returns delivered)."""
    return send_report(req)


class OruSendRequest(BaseModel):
    report: FinalReport
    host: str
    port: int = 2575
    receiving_facility: str = "HOSPITAL"


@app.post("/hl7/oru")
def hl7_oru_send(req: OruSendRequest) -> dict:
    """Send a signed FinalReport to the HIS as HL7 v2.5 ORU^R01 over MLLP."""
    msg = build_oru(req.report, receiving_facility=req.receiving_facility)
    try:
        code, ctrl_id = send_oru(msg, req.host, req.port)
    except OruSendError as e:
        audit(
            action="hl7.oru.fail",
            tenant=req.report.hospital_id,
            target={"type": "study", "id": req.report.study_uid},
            ok=False,
            meta={"host": req.host, "port": req.port, "error": str(e)},
        )
        return {"ok": False, "error": str(e)}
    audit(
        action="hl7.oru.sent",
        tenant=req.report.hospital_id,
        target={"type": "study", "id": req.report.study_uid},
        meta={"host": req.host, "port": req.port, "control_id": ctrl_id},
    )
    return {"ok": True, "ack_code": code, "control_id": ctrl_id}


@app.post("/hl7/oru/preview")
def hl7_oru_preview(req: OruSendRequest) -> dict:
    """Build the HL7 message without sending — for debugging."""
    return {"message": build_oru(req.report, receiving_facility=req.receiving_facility)}


class SrRequest(BaseModel):
    report: FinalReport


@app.post("/report/sr/summary")
def report_sr_summary(req: SrRequest) -> dict:
    """Build a DICOM SR from the FinalReport, return summary + byte size."""
    summary = encode_sr_dict(req.report)
    audit(
        action="report.sr.built",
        tenant=req.report.hospital_id,
        target={"type": "study", "id": req.report.study_uid},
        meta=summary,
    )
    return summary


@app.post("/report/sr")
def report_sr_download(req: SrRequest) -> Response:
    """Return the raw DICOM SR bytes (application/dicom)."""
    data = encode_sr(req.report)
    audit(
        action="report.sr.downloaded",
        tenant=req.report.hospital_id,
        target={"type": "study", "id": req.report.study_uid},
        meta={"bytes": len(data)},
    )
    return Response(content=data, media_type="application/dicom")


@app.post("/report/pdf")
def report_pdf_download(req: SrRequest) -> Response:
    """Render FinalReport to Arabic RTL PDF and return as application/pdf."""
    data = build_pdf(req.report)
    audit(
        action="report.pdf.built",
        tenant=req.report.hospital_id,
        target={"type": "study", "id": req.report.study_uid},
        meta={"bytes": len(data)},
    )
    return Response(
        content=data,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (f'inline; filename="report-{req.report.study_uid[-12:]}.pdf"'),
        },
    )


@app.get("/share/{token}")
def share_resolve(token: str) -> dict:
    """Verify + describe a shareable link token. Web layer redirects using this."""
    payload = verify_share_token(token)
    if not payload:
        return {"ok": False, "error": "invalid or expired token"}
    return {
        "ok": True,
        "study_uid": payload["sid"],
        "kind": payload["k"],
        "recipient": payload.get("r", ""),
        "expires_at": payload["exp"],
    }


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
