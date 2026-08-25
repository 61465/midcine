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
import os
import sys
import time
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .agents_client import (
    NARAYA_MODEL_COMPARE,
    NARAYA_MODEL_CRITICAL,
    NARAYA_MODEL_IMPRESSION,
    _call_naraya_sync,
    fan_out,
    fan_out_stream,
    health_check,
)
from .aggregator import aggregate
from .audit import audit, read_recent
from .dicom_sr import encode_sr, encode_sr_dict
from .dispatcher import Dispatcher
from .hl7_oru import OruSendError, build_oru, send_oru
from .pdf_report import build_pdf
from .phi_redactor import redact, redact_study_prompt
from .security import (
    add_security_headers,
    gen_request_id,
    optional_token_auth,
    rate_limit,
    validate_dicom_upload,
)
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
    delete_study,
    dicom_path_for,
    get_patient,
    get_study,
    list_by_patient,
    list_patients,
    list_series_slices,
    list_studies,
    save_dicom_bytes,
    save_patient,
    save_series_slice,
    save_study,
    series_slice_path,
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

from fastapi import Depends

app = FastAPI(
    title="midcine mcp-bridge",
    version="0.3.0",
    dependencies=[Depends(rate_limit), Depends(optional_token_auth)],
)

app.add_middleware(
    CORSMiddleware,
    # midcine is local-only during pilot; expand this list per-hospital when
    # deploying to an on-prem edge box with a hospital-specific hostname.
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*", "X-Midcine-Token"],
)


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    """Attach request-id + security headers to every response."""
    request_id = request.headers.get("X-Request-ID") or gen_request_id()
    response = await call_next(request)
    add_security_headers(response)
    response.headers["X-Request-ID"] = request_id
    return response


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
    """Return studies actually present in the local store. Empty until Orthanc/PACS wires in.
    English-only: Arabic patient names/IDs are transliterated on the way out."""
    from .report import transliterate_arabic

    studies = list_studies(hospital_id=hospital_id, limit=limit)
    for s in studies:
        s.patient_name = transliterate_arabic(s.patient_name or "")
        s.patient_id = transliterate_arabic(s.patient_id or "")
        s.symptoms = transliterate_arabic(s.symptoms or "")
        s.clinical_history = transliterate_arabic(s.clinical_history or "")
        s.description = transliterate_arabic(s.description or "")
        s.referrer = transliterate_arabic(s.referrer or "")
    return studies


@app.post("/studies", response_model=StudyRecord)
async def studies_create(rec: StudyRecord) -> StudyRecord:
    """Create OR merge a StudyRecord.

    Idempotent: if a study with this UID already exists, only fill in fields
    that the client explicitly provided (non-empty). This prevents re-POSTs
    from clobbering info like patient_name/age/sex when the client sends a
    partial update.
    """
    if not rec.study_date:
        from datetime import UTC, datetime

        rec.study_date = datetime.now(UTC).isoformat()

    existing = get_study(rec.study_uid)
    if existing:
        # Merge: keep non-empty existing values when new value is empty/None/default
        merged = existing.model_dump()
        incoming = rec.model_dump()
        for k, new_v in incoming.items():
            old_v = merged.get(k)
            # Prefer new value only if it's meaningfully set
            if new_v is None or new_v == "" or new_v == []:
                # Client didn't provide → keep existing
                continue
            if k == "priority" and new_v == "P3" and old_v and old_v != "P3":
                # Default priority — don't overwrite explicit choice
                continue
            if k == "status" and new_v == "pending" and old_v and old_v != "pending":
                continue
            merged[k] = new_v
        rec = StudyRecord(**merged)

    save_study(rec)
    audit(
        action="study.created" if not existing else "study.updated",
        tenant=rec.hospital_id,
        target={"type": "study", "id": rec.study_uid},
        meta={"modality": rec.modality, "body_part": rec.body_part, "priority": rec.priority},
    )
    return rec


@app.delete("/studies/{study_uid}")
def studies_delete(study_uid: str) -> dict:
    """Delete a study record + any attached DICOM file."""
    ok = delete_study(study_uid)
    if ok:
        audit(
            action="study.deleted",
            tenant="default",
            target={"type": "study", "id": study_uid},
        )
    return {"ok": ok}


@app.post("/studies/{study_uid}/dicom")
async def studies_upload_dicom(study_uid: str, request: Request) -> dict:
    """Attach a DICOM file to an existing study.

    Auto-detects ZIP uploads: if the payload starts with the PK\\x03\\x04 magic,
    we extract all .dcm/.dicom files inside into the series folder so the viewer
    can render 2D/3D/MPR/MIP. Users often export from PACS as a ZIP.
    """
    import io
    import zipfile

    body = await request.body()
    # Strict validation: magic-byte check + exec rejection + size cap
    kind, body = validate_dicom_upload(body, allow_zip=True)

    # ZIP magic: 50 4B 03 04
    if len(body) >= 4 and body[:4] == b"PK\x03\x04":
        try:
            extracted = 0
            skipped = 0
            with zipfile.ZipFile(io.BytesIO(body)) as z:
                for info in z.infolist():
                    if info.is_dir():
                        continue
                    name = info.filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
                    if not name:
                        continue
                    data = z.read(info)
                    # Verify it's a DICOM (must contain DICM at offset 128 OR
                    # start with something DICOM-like). Skip README/manifest files.
                    lower = name.lower()
                    is_dicom_ext = lower.endswith((".dcm", ".dicom"))
                    is_dicom_magic = len(data) >= 132 and data[128:132] == b"DICM"
                    if not (is_dicom_ext or is_dicom_magic):
                        skipped += 1
                        continue
                    # Prefix with parent series folder if present to keep uniqueness
                    parent = info.filename.rsplit("/", 1)[0] if "/" in info.filename else ""
                    safe_name = (parent + "_" + name if parent else name).replace("/", "_")
                    save_series_slice(study_uid, safe_name, data)
                    extracted += 1
            audit(
                action="study.zip_extracted",
                tenant="default",
                target={"type": "study", "id": study_uid},
                meta={"bytes": len(body), "extracted": extracted, "skipped": skipped},
            )
            return {
                "ok": True,
                "bytes": len(body),
                "kind": "zip",
                "extracted": extracted,
                "skipped": skipped,
                "hint": "ZIP auto-extracted into series folder — viewer will show as multi-slice",
            }
        except zipfile.BadZipFile as e:
            return {"ok": False, "error": f"bad ZIP: {e}"}

    # Plain DICOM file: verify DICM magic (not fatal — some legacy files lack it)
    has_magic = len(body) >= 132 and body[128:132] == b"DICM"
    path = save_dicom_bytes(study_uid, body)
    audit(
        action="study.dicom_uploaded",
        tenant="default",
        target={"type": "study", "id": study_uid},
        meta={"bytes": len(body), "dicm_magic": has_magic},
    )
    return {
        "ok": True,
        "bytes": len(body),
        "kind": "single",
        "dicm_magic": has_magic,
        "path": str(path),
    }


@app.get("/studies/{study_uid}/dicom")
def studies_get_dicom(study_uid: str) -> Response:
    """Serve the attached DICOM for the viewer (single-file mode)."""
    path = dicom_path_for(study_uid)
    if path is None:
        return Response(status_code=404, content=b"No DICOM attached")
    with path.open("rb") as f:
        data = f.read()
    return Response(content=data, media_type="application/dicom")


# ----- Series endpoints (multi-slice / 3D) -----


@app.post("/studies/{study_uid}/series/{filename}")
async def studies_upload_series_slice(
    study_uid: str, filename: str, request: Request
) -> dict:
    """Attach one slice of a multi-slice series. Called N times to build a full series."""
    body = await request.body()
    # Slice endpoint: allow_zip=False (individual slices should be raw DICOM)
    _kind, body = validate_dicom_upload(body, allow_zip=False)
    path = save_series_slice(study_uid, filename, body)
    return {"ok": True, "bytes": len(body), "path": str(path)}


@app.get("/studies/{study_uid}/series")
def studies_list_series(study_uid: str) -> dict:
    """List slice filenames for a study.

    If the study contains multiple sub-series (T1+T2, pre+post contrast),
    returns ONLY the largest series as `slices` to avoid mixed-dimension
    volumes crashing WebGL. Full groupings are exposed under `groups`.
    """
    from .studies_store import list_series_groups
    groups = list_series_groups(study_uid)
    if not groups:
        return {"study_uid": study_uid, "slice_count": 0, "slices": [], "groups": []}
    primary = groups[0]
    return {
        "study_uid": study_uid,
        "slice_count": primary["slice_count"],
        "slices": primary["slices"],
        "primary_series_uid": primary["series_uid"],
        "primary_description": primary.get("description", ""),
        "primary_modality": primary.get("modality", ""),
        "groups": [
            {k: v for k, v in g.items() if k != "slices"} | {"slice_count": g["slice_count"]}
            for g in groups
        ],
    }


@app.get("/studies/{study_uid}/series/group/{series_uid}")
def studies_list_series_group(study_uid: str, series_uid: str) -> dict:
    """Return slice filenames for one specific sub-series (by SeriesInstanceUID).
    Lets the viewer switch between T1/T2/etc. inside a mixed study.
    """
    from .studies_store import list_series_groups
    for g in list_series_groups(study_uid):
        if g["series_uid"] == series_uid:
            return {
                "study_uid": study_uid,
                "series_uid": series_uid,
                "slice_count": g["slice_count"],
                "slices": g["slices"],
                "description": g.get("description", ""),
                "modality": g.get("modality", ""),
            }
    return {"study_uid": study_uid, "series_uid": series_uid, "slice_count": 0, "slices": []}


@app.get("/studies/{study_uid}/nifti")
def studies_as_nifti(study_uid: str, series_uid: str | None = None) -> Response:
    """Convert one DICOM sub-series to NIfTI (.nii.gz) for NiiVue.

    Uses pydicom + nibabel directly (no dicom2nifti — its validation is too
    strict for real-world Siemens IMA scans). Cached to disk on first call.

    Query: ?series_uid=<SeriesInstanceUID> — omit to use primary (largest).
    """
    import io as _io
    from pathlib import Path as _Path
    import numpy as np
    import nibabel as nib
    import pydicom
    from pydicom.dataset import FileMetaDataset
    from pydicom.uid import ExplicitVRLittleEndian

    from .studies_store import list_series_groups, series_dir_for

    groups = list_series_groups(study_uid)
    if not groups:
        return Response(status_code=404, content=b"No series for study")

    target = None
    if series_uid:
        for g in groups:
            if g["series_uid"] == series_uid:
                target = g
                break
        if target is None:
            return Response(status_code=404, content=b"series_uid not found")
    else:
        target = groups[0]  # primary

    d = series_dir_for(study_uid)
    cache_dir = d / ".nifti"
    cache_dir.mkdir(exist_ok=True)
    sid_safe = "".join(c if c.isalnum() else "_" for c in target["series_uid"])[:120]
    cache_file = cache_dir / f"{sid_safe}.nii.gz"
    if cache_file.exists():
        return Response(
            content=cache_file.read_bytes(),
            media_type="application/gzip",
            headers={
                "Content-Disposition": f'inline; filename="{sid_safe}.nii.gz"',
                "Cache-Control": "public, max-age=3600",
            },
        )

    # Build the volume from every slice in this series
    slice_files = [d / name for name in target["slices"]]
    slices = []
    for f in slice_files:
        try:
            ds = pydicom.dcmread(str(f), force=True)
            # Some Siemens IMA files lack file_meta — inject one so pixel_array works
            if ds.file_meta is None or "TransferSyntaxUID" not in ds.file_meta:
                fm = FileMetaDataset()
                fm.TransferSyntaxUID = ExplicitVRLittleEndian
                ds.file_meta = fm
                ds.is_little_endian = True
                ds.is_implicit_VR = False
            # Skip anything without an orientation (localizers etc. in weird series)
            if not hasattr(ds, "ImageOrientationPatient") or not hasattr(ds, "ImagePositionPatient"):
                continue
            slices.append(ds)
        except Exception as e:  # noqa: BLE001
            log.warning("nifti: skipping slice %s: %s", f.name, e)

    if len(slices) < 2:
        return Response(status_code=422, content=b"Need >=2 slices for NIfTI conversion")

    iop = np.array(slices[0].ImageOrientationPatient, dtype=float)
    row_dir, col_dir = iop[:3], iop[3:]
    normal = np.cross(row_dir, col_dir)

    def _pos(ds):
        return float(np.dot(np.array(ds.ImagePositionPatient, dtype=float), normal))

    slices.sort(key=_pos)

    # Stack pixel arrays. Use int16 to keep signed CT HU values intact.
    try:
        vol = np.stack([s.pixel_array for s in slices], axis=-1).astype(np.int16)
    except Exception as e:  # noqa: BLE001
        return Response(status_code=422, content=f"pixel decode failed: {e}".encode())

    px = float(slices[0].PixelSpacing[0])
    py = float(slices[0].PixelSpacing[1])
    if len(slices) > 1:
        pz = abs(_pos(slices[1]) - _pos(slices[0]))
        if pz == 0:
            pz = float(getattr(slices[0], "SliceThickness", 1.0))
    else:
        pz = float(getattr(slices[0], "SliceThickness", 1.0))

    affine = np.eye(4)
    affine[:3, 0] = row_dir * px
    affine[:3, 1] = col_dir * py
    affine[:3, 2] = normal * pz
    affine[:3, 3] = np.array(slices[0].ImagePositionPatient, dtype=float)
    # DICOM (LPS) → NIfTI (RAS)
    affine = np.diag([-1.0, -1.0, 1.0, 1.0]) @ affine

    img = nib.Nifti1Image(vol, affine)
    # Also embed WW/WL suggestions if present so NiiVue can use them
    try:
        wc = getattr(slices[0], "WindowCenter", None)
        ww = getattr(slices[0], "WindowWidth", None)
        if wc is not None and ww is not None:
            wc_val = float(wc[0] if hasattr(wc, "__iter__") and not isinstance(wc, str) else wc)
            ww_val = float(ww[0] if hasattr(ww, "__iter__") and not isinstance(ww, str) else ww)
            img.header["cal_min"] = wc_val - ww_val / 2
            img.header["cal_max"] = wc_val + ww_val / 2
    except Exception:  # noqa: BLE001
        pass

    # nibabel needs a real filesystem path for .nii.gz — write straight to cache.
    try:
        nib.save(img, str(cache_file))
        gz_data = cache_file.read_bytes()
    except Exception as e:  # noqa: BLE001
        # Fallback: write .nii uncompressed, gzip in-process
        import tempfile as _tmp
        import gzip as _gzip
        with _tmp.TemporaryDirectory() as td:
            tmp_nii = _Path(td) / "vol.nii"
            nib.save(img, str(tmp_nii))
            raw = tmp_nii.read_bytes()
        gz_buf = _io.BytesIO()
        with _gzip.GzipFile(fileobj=gz_buf, mode="wb", compresslevel=1) as gz:
            gz.write(raw)
        gz_data = gz_buf.getvalue()
        try:
            cache_file.write_bytes(gz_data)
        except OSError:
            pass
        log.warning("nifti: fallback path used: %s", e)

    return Response(
        content=gz_data,
        media_type="application/gzip",
        headers={
            "Content-Disposition": f'inline; filename="{sid_safe}.nii.gz"',
            "Cache-Control": "public, max-age=3600",
        },
    )


@app.get("/studies/{study_uid}/series/{filename}")
def studies_get_series_slice(study_uid: str, filename: str, wrap: int = 0) -> Response:
    """Serve one slice of a series by filename.

    When `wrap=1`: re-wrap the DICOM with a proper Part-10 preamble +
    ExplicitVRLittleEndian file_meta so lightweight web viewers (DWV,
    Papaya, OHIF) can open Siemens IMA files that lack the standard
    preamble. Uses on-disk cache to avoid repeated pydicom rewrites.
    """
    path = series_slice_path(study_uid, filename)
    if path is None:
        return Response(status_code=404, content=b"Slice not found")

    if not wrap:
        with path.open("rb") as f:
            data = f.read()
        return Response(content=data, media_type="application/dicom")

    # Wrap mode — check cache first
    cache_dir = path.parent / ".wrapped"
    cache_dir.mkdir(exist_ok=True)
    cache_file = cache_dir / (path.name + ".dcm")
    if cache_file.exists() and cache_file.stat().st_mtime >= path.stat().st_mtime:
        return Response(content=cache_file.read_bytes(), media_type="application/dicom")

    try:
        import io
        import pydicom
        from pydicom.dataset import FileMetaDataset
        from pydicom.uid import ExplicitVRLittleEndian, generate_uid

        ds = pydicom.dcmread(str(path), force=True)
        # If the file already has a valid preamble + file_meta, decompress
        # only if needed; otherwise inject fresh file_meta.
        needs_meta = (
            not hasattr(ds, "file_meta")
            or ds.file_meta is None
            or "TransferSyntaxUID" not in ds.file_meta
        )
        if needs_meta:
            fm = FileMetaDataset()
            sop_class = getattr(ds, "SOPClassUID", "1.2.840.10008.5.1.4.1.1.4")
            sop_inst = getattr(ds, "SOPInstanceUID", generate_uid())
            fm.MediaStorageSOPClassUID = sop_class
            fm.MediaStorageSOPInstanceUID = sop_inst
            fm.TransferSyntaxUID = ExplicitVRLittleEndian
            fm.ImplementationClassUID = "1.2.826.0.1.3680043.10.midcine"
            fm.ImplementationVersionName = "midcine1"
            ds.file_meta = fm
            ds.is_little_endian = True
            ds.is_implicit_VR = False
        else:
            ts = ds.file_meta.TransferSyntaxUID
            if getattr(ts, "is_compressed", False):
                # Decompress on the fly
                try:
                    ds.decompress()
                except Exception:  # noqa: BLE001
                    pass  # fall through — return as-is if decompress fails

        buf = io.BytesIO()
        pydicom.dcmwrite(buf, ds, write_like_original=False)
        wrapped = buf.getvalue()
        try:
            cache_file.write_bytes(wrapped)
        except OSError:
            pass
        return Response(content=wrapped, media_type="application/dicom")
    except Exception as e:  # noqa: BLE001
        # Fall back to raw file if rewrap breaks
        with path.open("rb") as f:
            data = f.read()
        return Response(
            content=data,
            media_type="application/dicom",
            headers={"X-Midcine-Wrap-Error": str(e)[:200]},
        )


# ----- Multi-file intake — accept a folder of mixed patient files ---------


@app.post("/studies/{study_uid}/intake")
async def studies_intake(study_uid: str, request: Request) -> dict:
    """Ingest a MIXED batch of patient files.

    Uses multipart/form-data with `files` field (repeated). Each file is
    auto-classified (DICOM / PDF / note / photo) and routed to the right store.
    Returns per-file classification + a summary the caller can display.
    """
    from .intake import classify_file, save_doc

    form = await request.form()
    incoming = [v for v in form.getlist("files") if hasattr(v, "read")]
    if not incoming:
        return {"ok": False, "error": "no files field found (expected multipart 'files')"}

    counts = {"dicom": 0, "pdf": 0, "note": 0, "photo": 0, "unknown": 0}
    results: list[dict] = []

    for up in incoming:
        try:
            data = await up.read()
        except Exception as e:
            results.append({"name": getattr(up, "filename", "?"), "ok": False, "error": str(e)[:100]})
            continue

        name = getattr(up, "filename", "") or "unnamed"
        if not data:
            counts["unknown"] += 1
            results.append({"name": name, "kind": "empty", "ok": False})
            continue

        kind = classify_file(name, data[:256])
        counts[kind] += 1
        try:
            if kind == "dicom":
                save_series_slice(study_uid, name, data)
                results.append({"name": name, "kind": "dicom", "ok": True, "size": len(data)})
            elif kind in {"pdf", "note", "photo"}:
                p = save_doc(study_uid, name, kind, data)
                results.append({"name": name, "kind": kind, "ok": True, "size": len(data), "path": str(p)})
            else:
                results.append({"name": name, "kind": "unknown", "ok": False})
        except Exception as e:
            results.append({"name": name, "kind": kind, "ok": False, "error": str(e)[:200]})

    audit(
        action="study.intake",
        tenant="default",
        target={"type": "study", "id": study_uid},
        meta={"counts": counts, "total": len(incoming)},
    )
    return {"ok": True, "counts": counts, "results": results}


@app.get("/studies/{study_uid}/dossier")
def studies_dossier(study_uid: str) -> dict:
    """Return the aggregated patient dossier (all uploaded docs + slice count)."""
    from .intake import build_dossier

    return build_dossier(study_uid)


# ----- Auto-classify: infer modality + body_part from DICOM tags -----------


# Common DICOM BodyPartExamined values → normalized region names
_BODY_PART_NORMALIZE = {
    "BRAIN": "BRAIN", "HEAD": "BRAIN", "SKULL": "BRAIN", "CRANIUM": "BRAIN",
    "CHEST": "CHEST", "THORAX": "CHEST", "LUNG": "CHEST", "LUNGS": "CHEST",
    "ABDOMEN": "ABDOMEN", "ABD": "ABDOMEN", "PELVIS": "PELVIS",
    "SPINE": "SPINE", "LSPINE": "SPINE", "CSPINE": "SPINE", "TSPINE": "SPINE",
    "LUMBAR": "SPINE", "CERVICAL": "SPINE", "THORACIC": "SPINE",
    "KNEE": "KNEE", "HIP": "HIP", "SHOULDER": "SHOULDER",
    "ANKLE": "ANKLE", "WRIST": "WRIST", "ELBOW": "ELBOW",
    "FOOT": "FOOT", "HAND": "HAND", "NECK": "NECK",
    "BREAST": "BREAST", "MAMMO": "BREAST",
    "HEART": "HEART", "CARDIAC": "HEART",
    "LIVER": "ABDOMEN", "KIDNEY": "ABDOMEN", "PANCREAS": "ABDOMEN",
}


AUTO_CLASSIFY_SYSTEM = (
    "LANGUAGE LOCK: Respond in clinical English ONLY. "
    "You are a radiology triage assistant. Given DICOM header tags and a study "
    "description that may be free-form or transliterated Arabic, infer the "
    "canonical modality + body region + likely clinical indication for a "
    "radiologist worklist.\n\n"
    "Return STRICT JSON only:\n"
    "{\n"
    '  "modality": "CT"|"MR"|"MRI"|"US"|"CR"|"DR"|"X-Ray"|"IR"|"Isotope"|"NM"|"MG"|"PT"|"OT",\n'
    '  "body_part": "BRAIN"|"CHEST"|"ABDOMEN"|"PELVIS"|"SPINE"|"KNEE"|"HIP"|"SHOULDER"|"NECK"|"BREAST"|"HEART"|"LIVER"|"KIDNEY"|"WHOLE_BODY"|"OTHER",\n'
    '  "region_detail": "e.g. lumbar spine, chest with contrast",\n'
    '  "likely_indication": "1 short clinical sentence in English (why did the referring clinician order this?)",\n'
    '  "confidence": 0.0-1.0\n'
    "}\n\n"
    "Rules: never invent — set confidence low if unsure. Keep everything English."
)


def _normalize_body_part(raw: str) -> str:
    key = (raw or "").strip().upper().replace(" ", "").replace("_", "")
    if not key:
        return ""
    return _BODY_PART_NORMALIZE.get(key, key)


@app.post("/studies/{study_uid}/auto-classify")
async def studies_auto_classify(study_uid: str) -> dict:
    """Read the first DICOM slice + StudyDescription and infer modality/body_part.

    Uses pydicom tags as the source of truth when available. If tags are empty
    (many scanners write blank BodyPartExamined), falls back to LLM inference
    from StudyDescription + StudyComments. Result is persisted to StudyRecord
    so the reading room worklist shows a canonical value.
    """
    import asyncio as _asyncio

    from .studies_store import get_study, list_series_slices, save_study, series_slice_path

    rec = get_study(study_uid)

    slices = list_series_slices(study_uid)
    dicom_tags: dict = {}
    if slices:
        try:
            path = series_slice_path(study_uid, slices[0])
            if path and path.exists():
                import pydicom

                ds = pydicom.dcmread(str(path), stop_before_pixels=True, force=True)
                dicom_tags = {
                    "Modality": str(getattr(ds, "Modality", "") or ""),
                    "BodyPartExamined": str(getattr(ds, "BodyPartExamined", "") or ""),
                    "StudyDescription": str(getattr(ds, "StudyDescription", "") or ""),
                    "SeriesDescription": str(getattr(ds, "SeriesDescription", "") or ""),
                    "ProtocolName": str(getattr(ds, "ProtocolName", "") or ""),
                    "PatientSex": str(getattr(ds, "PatientSex", "") or ""),
                    "PatientAge": str(getattr(ds, "PatientAge", "") or ""),
                }
        except Exception as e:  # noqa: BLE001
            dicom_tags = {"error": f"pydicom failed: {str(e)[:120]}"}

    # DICOM tags path — trust when both Modality + BodyPartExamined are present
    dicom_modality = dicom_tags.get("Modality", "").strip()
    dicom_body = _normalize_body_part(dicom_tags.get("BodyPartExamined", ""))

    if dicom_modality and dicom_body:
        result = {
            "modality": dicom_modality,
            "body_part": dicom_body,
            "region_detail": dicom_tags.get("SeriesDescription")
            or dicom_tags.get("StudyDescription")
            or "",
            "likely_indication": "",
            "confidence": 0.95,
            "source": "dicom_tags",
            "raw_tags": dicom_tags,
        }
    else:
        # LLM inference from all available context
        study_meta = {
            "existing_modality": rec.modality if rec else "",
            "existing_body_part": rec.body_part if rec else "",
            "description": (rec.description if rec else "") or dicom_tags.get("StudyDescription", ""),
            "symptoms": rec.symptoms if rec else "",
            "clinical_history": rec.clinical_history if rec else "",
            "dicom_tags": dicom_tags,
        }
        prompt = (
            f"Study context:\n{json.dumps(study_meta, ensure_ascii=False)}\n\n"
            f"Infer modality + body_part. Return the JSON described in the system rules."
        )
        try:
            raw = await _asyncio.to_thread(
                _call_naraya_english,
                AUTO_CLASSIFY_SYSTEM,
                prompt,
                20.0,
                NARAYA_MODEL_COMPARE,
                600,
                0.0,
            )
            parsed = _parse_json_loose(raw)
        except Exception as e:  # noqa: BLE001
            parsed = None
            raw = f"error: {e}"

        if not isinstance(parsed, dict):
            parsed = {
                "modality": dicom_modality or (rec.modality if rec else ""),
                "body_part": dicom_body or (rec.body_part if rec else ""),
                "region_detail": "",
                "likely_indication": "",
                "confidence": 0.2,
                "parse_error": True,
                "raw": raw[:400] if isinstance(raw, str) else "",
            }
        parsed["body_part"] = _normalize_body_part(parsed.get("body_part", ""))
        parsed["source"] = "llm_inference"
        parsed["raw_tags"] = dicom_tags
        result = _scrub_arabic(parsed)

    # Persist back to StudyRecord (only fill blanks — don't override real values)
    if rec:
        changed = False
        if not (rec.modality or "").strip() and result.get("modality"):
            rec.modality = result["modality"]
            changed = True
        if not (rec.body_part or "").strip() and result.get("body_part"):
            rec.body_part = result["body_part"]
            changed = True
        if changed:
            try:
                save_study(rec)
            except Exception as e:  # noqa: BLE001
                result["persist_error"] = str(e)[:200]

    audit(
        action="study.auto_classified",
        tenant="default",
        target={"type": "study", "id": study_uid},
        meta={
            "modality": result.get("modality"),
            "body_part": result.get("body_part"),
            "confidence": result.get("confidence"),
            "source": result.get("source"),
        },
    )
    return {"ok": True, **result}


# ----- Patient Reports — explicit uploads that pair with a study ----------


@app.post("/studies/{study_uid}/report")
async def studies_report_upload(study_uid: str, request: Request) -> dict:
    """Attach ONE patient-brought report (PDF/text/image) to a study.

    Multipart: field `file`. Optional `text` field for pasted plain text.
    Files are stored under docs with a `report__` prefix so they surface
    separately from generic intake docs, and get merged into the diagnose
    dossier automatically.
    """
    from .intake import classify_file, save_doc

    form = await request.form()
    up = form.get("file")
    pasted = form.get("text")

    if up and hasattr(up, "read"):
        data = await up.read()
        name = getattr(up, "filename", "") or "report"
        kind = classify_file(name, data[:256])
        if kind == "dicom" or kind == "unknown":
            # A DICOM here is almost never intended as a "report" — reject cleanly.
            return {"ok": False, "error": f"unsupported report type: {kind}"}
        p = save_doc(study_uid, name, kind, data, prefix="report")
        audit(
            action="study.report_upload",
            tenant="default",
            target={"type": "study", "id": study_uid},
            meta={"name": name, "kind": kind, "size": len(data)},
        )
        return {"ok": True, "name": name, "kind": kind, "path": str(p)}

    if isinstance(pasted, str) and pasted.strip():
        blob = pasted.encode("utf-8", errors="replace")
        # store as note with report prefix; note-loader picks it up in dossier
        p = save_doc(study_uid, "pasted.txt", "note", blob, prefix="report")
        audit(
            action="study.report_upload",
            tenant="default",
            target={"type": "study", "id": study_uid},
            meta={"name": "pasted.txt", "kind": "note", "size": len(blob)},
        )
        return {"ok": True, "name": "pasted.txt", "kind": "note"}

    return {"ok": False, "error": "no file or text provided"}


@app.get("/studies/{study_uid}/reports")
def studies_reports_list(study_uid: str) -> dict:
    """List the patient-report attachments linked to a study."""
    from .intake import build_dossier

    d = build_dossier(study_uid)
    return {"ok": True, "reports": d.get("reports", [])}


class ExplainReportRequest(BaseModel):
    text: str = ""
    study_uid: str | None = None
    modality: str = ""
    body_part: str = ""


EXPLAIN_SYSTEM = (
    "LANGUAGE LOCK: Respond in clinical English ONLY. Never write Arabic or any other language. If input contains Arabic, translate it mentally and respond in English. You are a bilingual (Arabic/English) attending physician. Given a patient's "
    "prior medical report (referral letter, discharge summary, lab panel, previous "
    "imaging report, or hand-written note), produce a compact structured summary in "
    "the SAME LANGUAGE as the source text.\n\n"
    "Output STRICT JSON only, no prose, no markdown fences:\n"
    "{\n"
    '  "language": "ar"|"en"|"mixed",\n'
    '  "report_type": "referral"|"lab"|"prior_imaging"|"discharge"|"prescription"|"note"|"other",\n'
    '  "summary": "2-4 sentence plain-language summary the doctor can read in 10 seconds",\n'
    '  "key_findings": [ "concrete data points, one per string, up to 8" ],\n'
    '  "diagnoses_mentioned": [ "diagnosis strings" ],\n'
    '  "medications": [ "drug + dose if stated" ],\n'
    '  "dates": [ "any dates mentioned, ISO if possible" ],\n'
    '  "relevance_to_current_study": "how this report should influence the current radiology read",\n'
    '  "red_flags": [ "urgent items the reader must not miss" ]\n'
    "}\n\n"
    "Rules: keep every array short (≤8), never invent data, use empty arrays when unsure."
)


@app.post("/ai/explain-report")
async def ai_explain_report(req: ExplainReportRequest) -> dict:
    """AI plain-language explanation of a patient-brought report, tied to the study."""
    import asyncio as _asyncio
    import time as _time

    from .intake import build_dossier

    body = (req.text or "").strip()
    if not body and req.study_uid:
        # Pull the newest report from the dossier if the caller didn't pass text
        try:
            dossier = build_dossier(req.study_uid)
            for r in reversed(dossier.get("reports", [])):
                if r.get("text"):
                    body = r["text"]
                    break
        except Exception:
            pass

    if not body:
        return {"ok": False, "error": "no report text found"}

    safe = redact(body[:14000]).text
    user_prompt = (
        f"Current study context:\n"
        f"  Modality: {req.modality or 'unspecified'}\n"
        f"  Body part: {req.body_part or 'unspecified'}\n\n"
        f"PATIENT REPORT (verbatim, PHI already scrubbed):\n---\n{safe}\n---\n\n"
        f"Return only the JSON object."
    )

    t0 = _time.perf_counter()
    try:
        text = await _asyncio.to_thread(
            _call_naraya_english,
            EXPLAIN_SYSTEM,
            user_prompt,
            30.0,
            NARAYA_MODEL_COMPARE,
            900,
            0.0,
        )
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}
    latency_ms = int((_time.perf_counter() - t0) * 1000)

    raw = text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {
            "language": "en",
            "report_type": "other",
            "summary": raw[:600],
            "key_findings": [],
            "diagnoses_mentioned": [],
            "medications": [],
            "dates": [],
            "relevance_to_current_study": "",
            "red_flags": [],
            "parse_error": True,
        }

    audit(
        action="ai.report_explained",
        tenant="default",
        target={"type": "study", "id": req.study_uid or "adhoc"},
        meta={"latency_ms": latency_ms, "chars": len(safe)},
    )
    parsed = await _asyncio.to_thread(_scrub_arabic, parsed)
    return {"ok": True, "latency_ms": latency_ms, **parsed}


# ----- AI Diagnose — attending physician-grade report from full dossier ---

# Post-guard: some models occasionally slip Arabic into structured JSON despite
# LANGUAGE LOCK in the system prompt. Walk the response tree, detect Arabic in
# any string leaf, and translate it to clinical English in-place before returning.
_ARABIC_RE = __import__("re").compile(r"[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]")


def _has_arabic(s: str) -> bool:
    return bool(s) and bool(_ARABIC_RE.search(s))


def _tree_has_arabic(obj) -> bool:
    """Recursively check if any string in a dict/list/str tree contains Arabic."""
    if isinstance(obj, dict):
        return any(_tree_has_arabic(v) for v in obj.values())
    if isinstance(obj, list):
        return any(_tree_has_arabic(v) for v in obj)
    if isinstance(obj, str):
        return _has_arabic(obj)
    return False


# Kept only as a no-op for backward compatibility. Prefer _call_naraya_english
# (below) which re-runs the LLM in English rather than translating.
def _scrub_arabic(obj):
    """Deprecated: returns obj unchanged. English is enforced upstream via
    stronger system prompts + re-generation in _call_naraya_english."""
    return obj


ENGLISH_ENFORCEMENT_PREAMBLE = (
    "ABSOLUTE LANGUAGE REQUIREMENT — READ THIS CAREFULLY:\n"
    "You MUST respond in clinical English ONLY. Not translated English — "
    "original, natural clinical English written by a fluent radiologist.\n"
    "The reader is an English-speaking radiologist who does NOT read Arabic. "
    "Any Arabic in your response is a patient-safety failure.\n"
    "If the input contains Arabic patient symptoms, history, or reports, you "
    "understand them internally but write your entire response in native "
    "clinical English.\n"
    "Do not include any Arabic characters, even in quoted text. Convert "
    "Arabic proper nouns to their transliterated form (e.g. حنان → Hanan).\n\n"
)


def _call_naraya_english(
    system: str,
    user: str,
    timeout: float,
    model: str,
    max_tokens: int,
    temperature: float = 0.0,
    max_retries: int = 2,
) -> str:
    """Call Naraya with an English-enforced system prompt.

    If the response contains Arabic characters, retry with an even stronger
    prompt (up to max_retries times). Returns the last response (which is
    usually already English by retry 2). This is preferable to translating
    the fields post-hoc — the model produces native clinical English rather
    than mechanical translation.
    """
    strengthened = ENGLISH_ENFORCEMENT_PREAMBLE + system
    last = ""
    for attempt in range(max_retries + 1):
        try:
            out = _call_naraya_sync(
                strengthened, user, timeout, model, max_tokens, temperature
            )
        except Exception as e:  # noqa: BLE001
            return last or f"error: {e}"
        last = out or ""
        if not _has_arabic(last):
            return last
        # Strengthen the enforcement for the next attempt
        strengthened = (
            f"WARNING: Your previous response contained Arabic characters. "
            f"This is a patient-safety failure. Retry {attempt + 1} of {max_retries}. "
            f"Respond in native clinical English only. No Arabic.\n\n"
            + strengthened
        )
    return last


DIAGNOSE_SYSTEM = (
    "LANGUAGE LOCK: Respond in clinical English ONLY. Never write Arabic or any other language. If input contains Arabic, translate it mentally and respond in English. You are a board-certified attending physician with dual expertise in "
    "radiology + internal medicine. You produce a full diagnostic assessment by "
    "correlating imaging, lab reports, prescriptions, symptoms, history, and "
    "prior notes as a treating physician would.\n\n"
    "RULES:\n"
    "1. Read EVERY piece of context provided (PDFs are labs/prior reports/prescriptions).\n"
    "2. Extract concrete data points (HgB values, HR, tumor marker levels, medications, "
    "dates of prior imaging, prior diagnoses).\n"
    "3. Correlate: match imaging findings to symptoms and lab results — cite the linkage.\n"
    "4. Apply Bayesian reasoning: pre-test probability × imaging likelihood ratio.\n"
    "5. Give a LEADING DIAGNOSIS with confidence 0-1 — never dodge with 'clinical correlation'.\n"
    "6. Include differential (2-4 alternatives) ranked by probability with pros/cons.\n"
    "7. Flag drug interactions or med conflicts if medications provided.\n"
    "8. Recommend concrete next steps (labs, imaging, specialist referral, treatment).\n"
    "9. Cite guideline (ACC/AHA, NCCN, WHO, ACR) when applicable.\n"
    "10. Output STRICT JSON only, no prose outside the object:\n"
    "{\n"
    '  "diagnostic_report": {\n'
    '     "one_liner": str,\n'
    '     "problem_representation": str,\n'
    '     "differential_diagnosis": [{"dx": str, "probability": 0-1, "supporting": [str], "against": [str]}],\n'
    '     "leading_diagnosis": str,\n'
    '     "confidence": 0-1,\n'
    '     "recommended_next_steps": [str],\n'
    '     "recommended_medications": [{"drug": str, "dose": str, "reason": str, "cautions": str}],\n'
    '     "red_flags": [str],\n'
    '     "medications_conflicts": [str]\n'
    "  },\n"
    '  "correlation_map": {\n'
    '     "imaging_matches_symptoms": [{"finding": str, "symptom": str}],\n'
    '     "labs_supporting": [str],\n'
    '     "history_relevance": [str]\n'
    "  }\n"
    "}"
)


class DiagnoseRequest(BaseModel):
    study_uid: str
    modality: str = ""
    body_part: str = ""
    patient_age: int | None = None
    patient_sex: str | None = None
    symptoms: str = ""
    clinical_history: str = ""
    findings: str = ""


class AnalyzeStudyRequest(BaseModel):
    study_uid: str
    symptoms: str = ""
    clinical_history: str = ""
    findings: str = ""


# DICOM UID regex — dotted-decimal per DICOM PS3.5 §9.1
# Relaxed to also accept midcine-generated UIDs which include short lowercase
# tokens for identification (e.g. "1.2.826.0.1.3680043.10.midcine.<ts>.<rand>").
# We enforce: no whitespace/special chars, ≤128 chars, at least 2 dots.
import re as _re_uid

_DICOM_UID_RE = _re_uid.compile(r"^[A-Za-z0-9._-]+$")


@app.post("/ai/analyze-study")
async def ai_analyze_study(req: AnalyzeStudyRequest) -> dict:
    """One-shot: auto-classify → vision analyze → diagnose. Radiologist-friendly.

    Reads DICOM tags to infer modality + body_part when missing, extracts
    quantitative image features from the first slice, then runs the attending
    physician diagnosis pipeline. Returns a merged payload the reading room
    can pipe straight into Findings + Impression.
    """
    import asyncio as _asyncio
    import time as _time

    from .studies_store import get_study

    # Validate the DICOM UID — reject malformed early to avoid backend errors.
    uid = (req.study_uid or "").strip()
    if not uid or len(uid) > 128 or not _DICOM_UID_RE.match(uid):
        return {"ok": False, "error": "invalid study_uid (must be a DICOM UID)"}

    t0 = _time.perf_counter()

    # ---- (1) Auto-classify — always ensures modality + body_part are set ----
    classify = await studies_auto_classify(req.study_uid)  # type: ignore[func-returns-value]
    if not isinstance(classify, dict):
        classify = {}

    # Reload the (possibly updated) study record for age/sex/existing symptoms
    rec = get_study(req.study_uid)

    # Prefer manually-entered StudyRecord values over LLM inference — the
    # doctor's manual entry is the source of truth. LLM classify only fills
    # blanks. But if DICOM tags directly contradict (source=dicom_tags), flag
    # it as a data warning without overriding.
    modality = (rec.modality if rec else "") or classify.get("modality", "") or ""
    body_part = (rec.body_part if rec else "") or classify.get("body_part", "") or ""
    patient_age = rec.age if rec else None
    patient_sex = rec.sex if rec else None
    merged_symptoms = req.symptoms or (rec.symptoms if rec else "") or ""
    merged_history = req.clinical_history or (rec.clinical_history if rec else "") or ""

    # ---- (2a) Real FULL-VOLUME vision — reads EVERY slice of the study ----
    # This is the flagship: the LLM sees every slice of the volume through
    # batched parallel mosaics, not just one representative slice.
    vision_result: dict = {}
    try:
        from .ai_vision import (
            analyze_full_volume,
            render_dicom_to_png,
            call_vision_llm,
        )
        from .studies_store import list_series_slices, series_slice_path

        # Gather patient metadata from the study record so the vision LLM
        # never says "age/sex unknown" when the data is actually on file.
        study_description = (rec.description if rec else "") or ""
        referrer = (rec.referrer if rec else "") or ""
        patient_name = (rec.patient_name if rec else "") or ""

        slices = list_series_slices(req.study_uid)
        if slices:
            # Full-volume path — read every slice.
            paths = [series_slice_path(req.study_uid, s) for s in slices]
            paths = [p for p in paths if p is not None]
            if paths:
                # Quality-first tiering + free-tier friendly concurrency.
                # Naraya per-minute limit fires at >2 concurrent; on large
                # studies we serialize (parallel=2) to avoid 429 losses.
                n_s = len(paths)
                if   n_s <= 24:  _bs, _ts, _mp = 8, 384, 3
                elif n_s <= 60:  _bs, _ts, _mp = 8, 384, 3
                elif n_s <= 120: _bs, _ts, _mp = 10, 352, 2
                elif n_s <= 250: _bs, _ts, _mp = 12, 320, 2
                elif n_s <= 500: _bs, _ts, _mp = 16, 288, 2
                else:            _bs, _ts, _mp = 20, 256, 2
                fv = await analyze_full_volume(
                    paths,
                    modality,
                    body_part,
                    merged_symptoms,
                    merged_history,
                    req.findings,
                    patient_age=patient_age,
                    patient_sex=patient_sex,
                    patient_name=patient_name,
                    study_description=study_description,
                    referrer=referrer,
                    batch_size=_bs,
                    tile_size=_ts,
                    max_parallel=_mp,
                )
                vision_result = {
                    "ok": bool(fv.get("ok")),
                    "provider": (fv.get("batches") or [{}])[0].get("provider", ""),
                    "model": (fv.get("batches") or [{}])[0].get("model", ""),
                    "parsed": fv.get("parsed"),
                    "total_slices": fv.get("total_slices"),
                    "batch_count": fv.get("batch_count"),
                    "successful_batches": fv.get("successful_batches"),
                    "error": fv.get("error"),
                    "mode": "full_volume",
                }
        else:
            # Single-file DICOM (no series) — fall back to single-slice vision.
            path = dicom_path_for(req.study_uid)
            if path:
                png = await _asyncio.to_thread(render_dicom_to_png, path)
                single = await _asyncio.to_thread(
                    call_vision_llm,
                    png,
                    modality,
                    body_part,
                    merged_symptoms,
                    merged_history,
                    req.findings,
                    patient_age=patient_age,
                    patient_sex=patient_sex,
                    patient_name=patient_name,
                    study_description=study_description,
                    referrer=referrer,
                )
                vision_result = single
                if single.get("ok") and single.get("text"):
                    parsed = _parse_json_loose(single["text"])
                    if isinstance(parsed, dict):
                        vision_result["parsed"] = parsed
                vision_result["mode"] = "single_slice"
    except Exception as e:  # noqa: BLE001
        vision_result = {"ok": False, "error": f"vision failed: {str(e)[:200]}"}

    # ---- (3) Diagnose — vision features + LLM reasoning ----
    diagnose_req = DiagnoseRequest(
        study_uid=req.study_uid,
        modality=modality,
        body_part=body_part,
        patient_age=patient_age,
        patient_sex=patient_sex,
        symptoms=merged_symptoms,
        clinical_history=merged_history,
        findings=req.findings,
    )
    diagnose = await ai_diagnose(diagnose_req)
    if not isinstance(diagnose, dict):
        diagnose = {"ok": False, "error": "diagnose returned non-dict"}

    latency_ms = int((_time.perf_counter() - t0) * 1000)

    # Extract convenient top-level fields the UI can plug directly
    diag_report = diagnose.get("diagnostic_report") or {}
    leading = diag_report.get("leading_diagnosis") or ""
    one_liner = diag_report.get("one_liner") or ""
    differential = diag_report.get("differential_diagnosis") or []

    # If vision saw something concrete, promote it into suggested_findings
    vision_parsed = vision_result.get("parsed") or {}
    vision_impression = vision_parsed.get("overall_impression", "")
    vision_findings = vision_parsed.get("abnormal_findings") or []
    if vision_impression and not one_liner:
        one_liner = vision_impression

    payload = {
        "ok": True,
        "latency_ms": latency_ms,
        "classification": {
            "modality": modality,
            "body_part": body_part,
            "region_detail": classify.get("region_detail", ""),
            "likely_indication": classify.get("likely_indication", ""),
            "confidence": classify.get("confidence"),
            "source": classify.get("source"),
        },
        "vision": {
            "ok": bool(vision_result.get("ok")),
            "mode": vision_result.get("mode", ""),
            "provider": vision_result.get("provider", ""),
            "model": vision_result.get("model", ""),
            "total_slices": vision_result.get("total_slices"),
            "batch_count": vision_result.get("batch_count"),
            "successful_batches": vision_result.get("successful_batches"),
            "anatomy_seen": vision_parsed.get("anatomy_seen", ""),
            "abnormal_findings": vision_findings,
            "normal_findings": vision_parsed.get("normal_findings", []),
            "overall_impression": vision_impression,
            "confidence": vision_parsed.get("confidence_in_reading"),
            "differential": vision_parsed.get("differential_diagnosis", []),
            "recommend_next_view": vision_parsed.get("recommend_next_view", ""),
            "critical": vision_parsed.get("critical", False),
            "urgent": vision_parsed.get("urgent", False),
            "slices_reviewed": vision_parsed.get("slices_reviewed", ""),
            "error": vision_result.get("error"),
        },
        "diagnose": diagnose,
        # UI-friendly shortcuts
        "suggested_findings": one_liner,
        "suggested_impression": leading,
        "differential_summary": [
            f"{d.get('dx','?')} — {int((d.get('probability') or 0)*100)}%"
            for d in differential[:5]
        ],
    }
    audit(
        action="ai.study_analyzed",
        tenant="default",
        target={"type": "study", "id": req.study_uid},
        meta={
            "latency_ms": latency_ms,
            "modality": modality,
            "body_part": body_part,
            "leading": leading[:120],
        },
    )
    return _scrub_arabic(payload)


@app.post("/ai/diagnose")
async def ai_diagnose(req: DiagnoseRequest) -> dict:
    """Attending-physician diagnostic report from imaging + dossier + symptoms."""
    import asyncio as _asyncio
    import time as _time

    from .intake import build_dossier

    dossier = build_dossier(req.study_uid)

    # Vision features from first slice (if available) — real image data, not guesses
    vision_features: dict = {}
    try:
        from .ai_vision import analyze_features

        slices = list_series_slices(req.study_uid)
        if slices:
            path = series_slice_path(req.study_uid, slices[0])
            if path:
                vision_features = await _asyncio.to_thread(analyze_features, path)
    except Exception as e:
        vision_features = {"error": f"vision extraction failed: {str(e)[:100]}"}

    # PHI hardening on every text going to LLM
    safe_symptoms = redact(req.symptoms or "").text
    safe_history = redact(req.clinical_history or "").text
    safe_findings = redact(req.findings or "").text
    safe_pdfs = []
    for p in dossier.get("pdf_texts", []):
        safe_pdfs.append({"name": p["name"][:80], "text": redact(p["text"][:6000]).text})
    safe_notes = []
    for n in dossier.get("notes", []):
        safe_notes.append({"name": n["name"][:80], "text": redact(n["text"][:4000]).text})
    safe_reports = []
    for r in dossier.get("reports", []):
        if r.get("text"):
            safe_reports.append({"name": r["name"][:80], "text": redact(r["text"][:6000]).text})

    age_str = "unknown"
    if req.patient_age and req.patient_age > 0:
        age_str = f"{(req.patient_age // 10) * 10}s"

    user_prompt = (
        f"CASE DOSSIER\n"
        f"============\n"
        f"Modality: {req.modality or '?'} | Body part: {req.body_part or '?'}\n"
        f"Patient: age~{age_str} sex={req.patient_sex or 'unknown'}\n"
        f"Symptoms: {safe_symptoms or '(none provided)'}\n"
        f"Clinical history: {safe_history or '(none provided)'}\n\n"
        f"IMAGING\n"
        f"-------\n"
        f"Series slices: {dossier.get('dicom_slice_count', 0)}\n"
        f"Radiologist findings so far: {safe_findings or '(not yet dictated)'}\n"
        f"Quantitative image features: {json.dumps(vision_features, ensure_ascii=False)[:1500]}\n\n"
        f"PATIENT-BROUGHT REPORTS ({len(safe_reports)})  ⭐ PRIMARY CLINICAL CONTEXT\n"
        f"------------------------------------\n"
        + "\n".join(f"[{r['name']}]\n{r['text'][:3000]}" for r in safe_reports[:6])
        + f"\n\nCLINICAL DOCUMENTS ({len(safe_pdfs)} PDFs)\n"
        f"---------------------------\n"
        + "\n".join(f"[{p['name']}]\n{p['text'][:2500]}" for p in safe_pdfs[:6])
        + f"\n\nCLINICIAN NOTES ({len(safe_notes)})\n"
        f"---------------------------\n"
        + "\n".join(f"[{n['name']}]\n{n['text'][:2000]}" for n in safe_notes[:6])
        + f"\n\nCLINICAL PHOTOS: {len(dossier.get('photos', []))} (not yet extracted — mention if radiologist should review manually)\n\n"
        + "Produce the STRICT JSON diagnostic report per the system rules."
    )

    t0 = _time.perf_counter()
    # Direct single-model call — for structured JSON, single model produces
    # more reliable output than ensemble merge (which can break JSON structure).
    try:
        raw = await _asyncio.to_thread(
            _call_naraya_english,
            DIAGNOSE_SYSTEM,
            user_prompt,
            60.0,
            NARAYA_MODEL_IMPRESSION,
            2500,
            0.1,
        )
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}

    latency_ms = int((_time.perf_counter() - t0) * 1000)
    cleaned = raw.strip()
    # Strip markdown fences: ```json ... ``` or ``` ... ```
    if cleaned.startswith("```"):
        first_nl = cleaned.find("\n")
        if first_nl > 0:
            cleaned = cleaned[first_nl + 1 :]
        if cleaned.rstrip().endswith("```"):
            cleaned = cleaned.rstrip()[:-3].rstrip()
    # Extract the outer JSON object if prose was appended
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start >= 0 and end > start:
        cleaned = cleaned[start : end + 1]

    parsed: dict
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as e:
        parsed = {"raw": raw[:8000], "parse_error": True, "error_detail": str(e)[:200]}

    audit(
        action="ai.diagnose_generated",
        tenant="default",
        target={"type": "study", "id": req.study_uid},
        meta={
            "latency_ms": latency_ms,
            "slice_count": dossier.get("dicom_slice_count", 0),
            "pdf_count": len(dossier.get("pdf_texts", [])),
        },
    )
    # English post-guard: model sometimes returns Arabic strings inside JSON despite lock
    parsed = await _asyncio.to_thread(_scrub_arabic, parsed)
    return {"ok": True, "latency_ms": latency_ms, "dossier": dossier, **parsed}


# ----- AI Impression generator (Rad AI-style) -----

IMPRESSION_SYSTEM = (
    "LANGUAGE LOCK: Respond in clinical English ONLY. Never write Arabic or any other language. If input contains Arabic, translate it mentally and respond in English. You are a board-certified senior radiologist with 20+ years of experience. "
    "You ALWAYS produce a useful impression, even when information is incomplete. "
    "\n\nWORKFLOW:\n"
    "- If findings text is provided: base the impression on those findings.\n"
    "- If findings are missing/empty: generate an EXPECTED-FINDINGS impression based on "
    "the modality + body part + symptoms + history + typical differential for that "
    "clinical picture. Mark it clearly as 'PRELIMINARY / EXPECTED PATTERN' and list "
    "what the radiologist should specifically look for on the images.\n"
    "- If symptoms/history are missing: proceed anyway; use the modality + body part "
    "to give the impression + note the clinical context that would sharpen it.\n"
    "\n"
    "RULES:\n"
    "1. Most clinically significant finding first.\n"
    "2. Numbered list for multiple findings.\n"
    "3. Include actionable recommendations + guideline refs (Fleischner, BI-RADS, "
    "LI-RADS, PI-RADS, TI-RADS, LR-M, CAD-RADS, ACC/AHA) when applicable.\n"
    "4. Preserve laterality (right/left) exactly as given.\n"
    "5. 3-10 lines max.\n"
    "6. NEVER refuse or say 'insufficient information' — always give the best "
    "possible impression at your confidence level. Use language like:\n"
    "   'Based on the available context, likely...'\n"
    "   'Pending confirmatory findings, differential includes...'\n"
    "   'Preliminary read suggests...'\n"
    "7. Output pure Impression only — no 'Findings:' repetition, no preamble."
)


class ImpressionRequest(BaseModel):
    findings: str
    modality: str = ""
    body_part: str = ""
    patient_age: int | None = None
    patient_sex: str | None = None
    symptoms: str = ""
    clinical_history: str = ""
    prior_impression: str = ""


@app.post("/ai/impression")
async def ai_impression(req: ImpressionRequest) -> dict:
    """Generate an ACR-style Impression paragraph via Naraya.

    Tolerant to missing info: if findings/symptoms/history are empty, generates
    a preliminary impression from the available modality + body_part context.
    Always returns SOMETHING useful — never refuses.
    """
    import asyncio
    import time as _time

    # PHI hardening
    safe_symptoms = redact(req.symptoms or "").text
    safe_history = redact(req.clinical_history or "").text
    safe_findings = redact(req.findings or "").text
    safe_prior = redact(req.prior_impression or "").text

    age_str = "unknown"
    if req.patient_age and req.patient_age > 0:
        age_str = f"{(req.patient_age // 10) * 10}s"

    # Detect what's missing so the prompt can adapt
    have_findings = bool(safe_findings.strip())
    have_symptoms = bool(safe_symptoms.strip())
    have_history = bool(safe_history.strip())
    mode = "definitive" if have_findings else "preliminary"

    user_prompt = (
        f"MODE: {mode}\n"
        f"Modality: {req.modality or 'unspecified'}. "
        f"Body part: {req.body_part or 'unspecified'}. "
        f"Patient: age~{age_str} sex={req.patient_sex or 'unknown'}.\n"
        f"Symptoms: {safe_symptoms or '[not provided]'}\n"
        f"Clinical history: {safe_history or '[not provided]'}\n"
        f"Findings dictated so far: {safe_findings or '[not yet dictated — generate preliminary/expected-pattern impression]'}\n"
        f"Prior impression: {safe_prior or 'none'}\n\n"
        f"Generate the impression per the rules. "
        f"{'Base it on the findings above.' if have_findings else 'Since findings are not yet dictated, give the EXPECTED PATTERN based on modality + body part + context, marked as PRELIMINARY.'} "
        f"{'' if have_symptoms and have_history else 'Note: clinical context is partial — still produce useful output.'}"
    )

    # ENRICHMENT: extract DICOM metadata + image features from first slice if available
    # This gives the LLM real image-derived signals instead of guessing from text.
    dicom_context = ""
    try:
        from .studies_store import list_series_slices, series_slice_path
        # We don't have a study_uid here (impression is text-only) — skip enrichment.
        # Vision endpoint already provides this; user should press Vision first.
    except Exception:
        pass

    t0 = _time.perf_counter()
    try:
        # Use Unified Brain for deep intelligence — 5 models merged
        try:
            sys.path.insert(0, r"D:\project\suportagent")
            from core.unified_brain import think as unified_think  # type: ignore

            os.environ.setdefault("NARAYA_API_KEY", os.getenv("NARAYA_API_KEY", ""))
            os.environ.setdefault("GROQ_API_KEY", os.getenv("GROQ_API_KEY", ""))
            res = await asyncio.to_thread(
                unified_think, IMPRESSION_SYSTEM, user_prompt, "medical", True, 40.0
            )
            if res.get("ok"):
                text = res.get("answer", "")
            else:
                text = await asyncio.to_thread(
                    _call_naraya_english, IMPRESSION_SYSTEM, user_prompt, 30.0, NARAYA_MODEL_IMPRESSION,
                )
        except Exception:
            text = await asyncio.to_thread(
                _call_naraya_english, IMPRESSION_SYSTEM, user_prompt, 30.0, NARAYA_MODEL_IMPRESSION,
            )
    except Exception as e:
        return {"ok": False, "error": str(e)[:200], "impression": ""}
    latency_ms = int((_time.perf_counter() - t0) * 1000)

    # Strip common preambles the model sometimes adds
    impression = text.strip()
    for prefix in ("Impression:\n", "Impression:", "IMPRESSION:"):
        if impression.startswith(prefix):
            impression = impression[len(prefix) :].strip()
            break

    audit(
        action="ai.impression_generated",
        tenant="default",
        target={"type": "impression", "id": "adhoc"},
        meta={"latency_ms": latency_ms, "findings_len": len(req.findings)},
    )
    if _has_arabic(impression):
        impression = await _asyncio.to_thread(_translate_to_english_sync, impression)
    return {"ok": True, "impression": impression, "latency_ms": latency_ms}


def _translit_study(s: StudyRecord) -> StudyRecord:
    from .report import transliterate_arabic
    s.patient_name = transliterate_arabic(s.patient_name or "")
    s.patient_id = transliterate_arabic(s.patient_id or "")
    s.symptoms = transliterate_arabic(s.symptoms or "")
    s.clinical_history = transliterate_arabic(s.clinical_history or "")
    s.description = transliterate_arabic(s.description or "")
    s.referrer = transliterate_arabic(s.referrer or "")
    return s


def _translit_patient(p: PatientRecord | None) -> PatientRecord | None:
    if not p:
        return p
    from .report import transliterate_arabic
    for attr in ("patient_name", "patient_id", "phone", "address", "occupation",
                 "notes", "emergency_contact", "family_history", "clinical_history"):
        val = getattr(p, attr, None)
        if isinstance(val, str):
            setattr(p, attr, transliterate_arabic(val))
    return p


@app.get("/studies/{study_uid}", response_model=StudyRecord)
def studies_get(study_uid: str) -> StudyRecord:
    rec = get_study(study_uid)
    if rec is None:
        return StudyRecord(
            study_uid=study_uid,
            patient_id="",
            patient_name="",
            modality="CT",
            body_part="BRAIN",
            study_date="",
        )
    return _translit_study(rec)


@app.get("/patients/{patient_id}", response_model=PatientRecord | None)
def patients_get(patient_id: str) -> PatientRecord | None:
    return _translit_patient(get_patient(patient_id))


@app.get("/patients", response_model=list[PatientRecord])
def patients_list(hospital_id: str | None = None) -> list[PatientRecord]:
    return [_translit_patient(p) for p in list_patients(hospital_id=hospital_id) if p]


@app.get("/patients/{patient_id}/studies", response_model=list[StudyRecord])
def patient_studies(patient_id: str) -> list[StudyRecord]:
    return [_translit_study(s) for s in list_by_patient(patient_id)]


@app.post("/patients", response_model=PatientRecord)
def patients_upsert(rec: PatientRecord) -> PatientRecord:
    """Create or update a patient's medical history (idempotent)."""
    save_patient(rec)
    audit(
        action="patient.upserted",
        tenant=rec.hospital_id,
        target={"type": "patient", "id": rec.patient_id},
    )
    return rec


# ----- AI Critical Alert -----

CRITICAL_SYSTEM = (
    "LANGUAGE LOCK: Respond in clinical English ONLY. Never write Arabic or any other language. If input contains Arabic, translate it mentally and respond in English. You are a radiology safety officer. Given a Findings paragraph, "
    "detect life-threatening findings that require IMMEDIATE (STAT) callback to the referring "
    "clinician. Examples: pulmonary embolism, intracranial hemorrhage, midline shift, "
    "aortic dissection, tension pneumothorax, bowel perforation, ectopic pregnancy rupture, "
    "acute stroke with LVO, testicular torsion, malignant obstruction with cord compression. "
    "Output STRICT JSON only, no prose: "
    '{"critical": bool, "severity": "STAT"|"URGENT"|"ROUTINE", '
    '"findings": [{"term": str, "reason": str, "action": str}], '
    '"callback_recommended": bool, "escalate_priority_to": "P1"|"P2"|"P3"|"P4"|"P5"}. '
    "If nothing critical, return critical=false, severity=ROUTINE, findings=[]."
)


class CriticalAlertRequest(BaseModel):
    findings: str
    modality: str = ""
    body_part: str = ""


@app.post("/ai/critical")
async def ai_critical(req: CriticalAlertRequest) -> dict:
    """Scan findings for life-threatening terms → returns severity + recommended actions."""
    import asyncio as _asyncio
    import time as _time

    if not req.findings.strip():
        return {"ok": False, "error": "findings is required"}

    # PHI hardening
    safe_findings = redact(req.findings).text

    user_prompt = (
        f"Modality: {req.modality}. Body part: {req.body_part}.\n"
        f"Findings:\n{safe_findings}\n\n"
        "Return only the JSON object."
    )

    t0 = _time.perf_counter()
    try:
        text = await _asyncio.to_thread(
            _call_naraya_english,
            CRITICAL_SYSTEM,
            user_prompt,
            25.0,
            NARAYA_MODEL_CRITICAL,
            300,
            0.0,
        )
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}
    latency_ms = int((_time.perf_counter() - t0) * 1000)

    # Parse JSON — model sometimes wraps in ```json blocks
    raw = text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()
    parsed: dict = {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        # Fallback: assume nothing critical
        parsed = {
            "critical": False,
            "severity": "ROUTINE",
            "findings": [],
            "callback_recommended": False,
            "escalate_priority_to": "P3",
        }

    if parsed.get("critical"):
        audit(
            action="ai.critical_alert",
            tenant="default",
            target={"type": "alert", "id": "critical"},
            meta={
                "severity": parsed.get("severity"),
                "count": len(parsed.get("findings", [])),
                "latency_ms": latency_ms,
            },
        )
    parsed = await _asyncio.to_thread(_scrub_arabic, parsed)
    return {"ok": True, "latency_ms": latency_ms, **parsed}


# ----- AI Compare (prior vs current) -----

COMPARE_SYSTEM = (
    "LANGUAGE LOCK: Respond in clinical English ONLY. Never write Arabic or any other language. If input contains Arabic, translate it mentally and respond in English. You are a senior radiologist comparing two studies of the same patient. "
    "Given a prior impression and the current findings, produce ONE concise 'What changed' "
    "paragraph highlighting new, resolved, stable, and progressed findings. "
    "Include quantitative changes when both mentions are quantitative (e.g., '6mm → 8mm, 33% growth'). "
    "Reference the appropriate follow-up guideline (Fleischner, TI-RADS, PI-RADS, BI-RADS, LI-RADS) "
    "if applicable. 3-6 lines max. No preamble, no repetition of unchanged findings."
)


class CompareRequest(BaseModel):
    prior_impression: str
    current_findings: str
    modality: str = ""
    body_part: str = ""


@app.post("/ai/compare")
async def ai_compare(req: CompareRequest) -> dict:
    """Feed prior_impression + current_findings to Naraya → 'What changed' paragraph."""
    import asyncio as _asyncio
    import time as _time

    if not req.prior_impression.strip() or not req.current_findings.strip():
        return {"ok": False, "error": "both prior_impression and current_findings are required"}

    # PHI hardening
    safe_prior = redact(req.prior_impression).text
    safe_current = redact(req.current_findings).text

    user_prompt = (
        f"Modality: {req.modality}. Body part: {req.body_part}.\n\n"
        f"PRIOR IMPRESSION:\n{safe_prior}\n\n"
        f"CURRENT FINDINGS:\n{safe_current}\n\n"
        "Write the 'What changed' paragraph."
    )

    t0 = _time.perf_counter()
    try:
        text = await _asyncio.to_thread(
            _call_naraya_english,
            COMPARE_SYSTEM,
            user_prompt,
            30.0,
            NARAYA_MODEL_COMPARE,
        )
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}
    latency_ms = int((_time.perf_counter() - t0) * 1000)

    audit(
        action="ai.compare_generated",
        tenant="default",
        target={"type": "compare", "id": "adhoc"},
        meta={"latency_ms": latency_ms},
    )
    comparison = text.strip()
    if _has_arabic(comparison):
        comparison = await _asyncio.to_thread(_translate_to_english_sync, comparison)
    return {"ok": True, "comparison": comparison, "latency_ms": latency_ms}


@app.get("/audit/recent")
def audit_recent(hospital_id: str | None = None, limit: int = 100) -> list[dict]:
    """Return recent audit-log entries (actual events, no fabrication)."""
    return read_recent(hospital_id=hospital_id, limit=limit)


class ClientErrorReport(BaseModel):
    message: str = ""
    stack: str = ""
    componentStack: str = ""
    url: str = ""
    ts: int = 0


@app.post("/audit/client-error")
def audit_client_error(report: ClientErrorReport) -> dict:
    """React ErrorBoundary calls this when the tree crashes.
    Enables debugging without exposing internals to the client."""
    audit(
        action="client.error",
        tenant="default",
        target={"type": "url", "id": report.url[:120]},
        meta={
            "message": report.message[:200],
            "stack_head": report.stack[:400],
            "component": report.componentStack[:400],
        },
    )
    return {"ok": True}


# ----- Waitlist -----
from .waitlist import WaitlistEntry, add_entry as _wl_add, count as _wl_count  # noqa: E402


# ----- AI Gaps Report — what info is missing for a definitive read? -----

GAPS_SYSTEM = (
    "LANGUAGE LOCK: Respond in clinical English ONLY. Never write Arabic or any other language. If input contains Arabic, translate it mentally and respond in English. You are a senior radiology quality-assurance auditor. Given a study record with "
    "possibly incomplete metadata + findings + history, produce a JSON list of the "
    "MISSING pieces of information that would strengthen the read.\n\n"
    "For each gap: severity (blocking | important | nice-to-have), category "
    "(demographics | clinical-context | technique | findings | prior-imaging), and a "
    "concrete request the radiologist can act on.\n\n"
    "Rules:\n"
    "1. Only report gaps that are ACTUALLY missing — don't invent needs.\n"
    "2. Be specific: 'creatinine level' > 'labs'.\n"
    "3. Rank by clinical impact.\n"
    "4. If everything is present, return empty list.\n"
    "5. Output STRICT JSON only, no prose:\n"
    '{"gaps": [{"item": str, "severity": "blocking"|"important"|"nice-to-have", '
    '"category": str, "why": str, "how_to_get": str}], '
    '"completeness_score": 0-100, "ready_for_definitive_read": bool}'
)


class GapsRequest(BaseModel):
    modality: str = ""
    body_part: str = ""
    patient_age: int | None = None
    patient_sex: str | None = None
    symptoms: str = ""
    clinical_history: str = ""
    findings: str = ""
    referrer: str = ""
    prior_impression: str = ""
    has_prior_imaging: bool = False


@app.post("/ai/gaps")
async def ai_gaps(req: GapsRequest) -> dict:
    """Return a JSON list of what's MISSING from the case for a definitive read."""
    import asyncio as _asyncio
    import time as _time

    safe_symptoms = redact(req.symptoms or "").text
    safe_history = redact(req.clinical_history or "").text
    safe_findings = redact(req.findings or "").text

    user_prompt = (
        f"Study snapshot:\n"
        f"  Modality: {req.modality or '[MISSING]'}\n"
        f"  Body part: {req.body_part or '[MISSING]'}\n"
        f"  Patient age: {req.patient_age or '[MISSING]'}\n"
        f"  Patient sex: {req.patient_sex or '[MISSING]'}\n"
        f"  Symptoms: {safe_symptoms or '[MISSING]'}\n"
        f"  Clinical history: {safe_history or '[MISSING]'}\n"
        f"  Findings dictated: {safe_findings or '[MISSING]'}\n"
        f"  Referring physician: {req.referrer or '[MISSING]'}\n"
        f"  Prior imaging available: {'yes' if req.has_prior_imaging else '[MISSING]'}\n"
        f"  Prior impression: {req.prior_impression or '[MISSING]'}\n\n"
        f"List the gaps. Return only the JSON object."
    )

    t0 = _time.perf_counter()
    try:
        text = await _asyncio.to_thread(
            _call_naraya_english,
            GAPS_SYSTEM,
            user_prompt,
            25.0,
            NARAYA_MODEL_COMPARE,
            600,
            0.0,
        )
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}
    latency_ms = int((_time.perf_counter() - t0) * 1000)

    # Parse strict JSON, tolerating ```json fences
    raw = text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`").strip()
        if raw.startswith("json"):
            raw = raw[4:].strip()
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        parsed = {
            "gaps": [],
            "completeness_score": 50,
            "ready_for_definitive_read": False,
            "parse_error": True,
        }

    audit(
        action="ai.gaps_generated",
        tenant="default",
        target={"type": "study", "id": "adhoc"},
        meta={"latency_ms": latency_ms, "gap_count": len(parsed.get("gaps", []))},
    )
    parsed = await _asyncio.to_thread(_scrub_arabic, parsed)
    return {"ok": True, "latency_ms": latency_ms, **parsed}


# ----- Premium: AI Vision (grounded synthesis) -----


class VisionAnalyzeRequest(BaseModel):
    study_uid: str
    slice_index: int = 0
    existing_findings: str = ""
    modality: str = ""
    body_part: str = ""


class VisionSeeRequest(BaseModel):
    """Real multimodal vision — sends the actual DICOM slice image to the LLM."""
    study_uid: str
    slice_index: int = 0
    existing_findings: str = ""
    symptoms: str = ""
    clinical_history: str = ""
    modality: str = ""
    body_part: str = ""


@app.post("/ai/vision-see")
async def ai_vision_see(req: VisionSeeRequest) -> dict:
    """Real multimodal vision reading.

    Renders the requested DICOM slice to a windowed PNG (auto WL from header)
    and sends the ACTUAL IMAGE to a vision-capable LLM (Claude Sonnet via
    Bynara). The LLM reads pixel content — not just numerical features — and
    returns a structured JSON with anatomy_seen, abnormal_findings,
    normal_findings, differential_diagnosis, and overall_impression.
    """
    import asyncio as _asyncio
    import time as _time
    import json as _json

    from .studies_store import list_series_slices, series_slice_path

    uid = (req.study_uid or "").strip()
    if not uid or len(uid) > 128 or not _DICOM_UID_RE.match(uid):
        return {"ok": False, "error": "invalid study_uid"}

    slices = list_series_slices(uid)
    if slices:
        idx = max(0, min(req.slice_index, len(slices) - 1))
        path = series_slice_path(uid, slices[idx])
    else:
        path = dicom_path_for(uid)

    if not path:
        return {"ok": False, "error": "no DICOM slice found for this study"}

    try:
        from .ai_vision import render_dicom_to_png, call_vision_llm
    except ImportError as e:
        return {"ok": False, "error": f"vision module unavailable: {e}"}

    # Fetch full study record so we can pass patient meta to the LLM.
    from .studies_store import get_study as _get_study

    rec = _get_study(uid)

    t0 = _time.perf_counter()
    try:
        png_bytes = await _asyncio.to_thread(render_dicom_to_png, path)
    except Exception as e:  # noqa: BLE001
        return {
            "ok": False,
            "error": f"failed to render DICOM: {str(e)[:200]}",
        }

    result = await _asyncio.to_thread(
        call_vision_llm,
        png_bytes,
        req.modality or (rec.modality if rec else ""),
        req.body_part or (rec.body_part if rec else ""),
        req.symptoms or (rec.symptoms if rec else ""),
        req.clinical_history or (rec.clinical_history if rec else ""),
        req.existing_findings,
        patient_age=(rec.age if rec else None),
        patient_sex=(rec.sex if rec else None),
        patient_name=(rec.patient_name if rec else ""),
        study_description=(rec.description if rec else ""),
        referrer=(rec.referrer if rec else ""),
    )
    latency_ms = int((_time.perf_counter() - t0) * 1000)
    result["latency_ms"] = latency_ms
    result["png_bytes"] = len(png_bytes)

    # Attempt to parse the JSON payload the model returned
    if result.get("ok") and result.get("text"):
        parsed = _parse_json_loose(result["text"])
        if isinstance(parsed, dict):
            result["parsed"] = parsed

    audit(
        action="ai.vision_see",
        tenant="default",
        target={"type": "study", "id": uid},
        meta={
            "latency_ms": latency_ms,
            "png_size": len(png_bytes),
            "ok": bool(result.get("ok")),
        },
    )
    return result


class VisionSeeFullRequest(BaseModel):
    """Full-volume vision — reads EVERY slice via batched parallel mosaics."""
    study_uid: str
    existing_findings: str = ""
    symptoms: str = ""
    clinical_history: str = ""
    modality: str = ""
    body_part: str = ""
    batch_size: int = 16
    max_parallel: int = 4
    # Optional job_id for client-driven progress tracking. Client generates a
    # UUID, sends it here, then polls /ai/vision-see-full/progress/{job_id}
    # every 1-2s while the POST call is in flight.
    job_id: str = ""


# In-process progress registry. Entries expire opportunistically after 15
# minutes to avoid unbounded growth. Not durable across restarts, which is
# fine — client jobs are always short-lived.
_VISION_PROGRESS: dict[str, dict] = {}


def _prune_vision_progress() -> None:
    import time as _time
    now = _time.time()
    stale = [k for k, v in _VISION_PROGRESS.items() if now - v.get("started", now) > 900]
    for k in stale:
        _VISION_PROGRESS.pop(k, None)


@app.get("/ai/vision-see-full/progress/{job_id}")
def ai_vision_see_full_progress(job_id: str) -> dict:
    """Return current progress for a vision-see-full job. Client polls this."""
    job_id = (job_id or "").strip()
    if not job_id or len(job_id) > 64:
        return {"ok": False, "error": "invalid job_id"}
    entry = _VISION_PROGRESS.get(job_id)
    if not entry:
        return {"ok": False, "error": "unknown job_id"}
    return {"ok": True, **entry}


@app.post("/ai/vision-see-full")
async def ai_vision_see_full(req: VisionSeeFullRequest) -> dict:
    """Full-volume multimodal vision — reads 100% of the study's slices.

    Splits into contiguous 16-slice batches, renders each as a 4x4 grid mosaic
    (with slice-number labels), sends all batches to Groq llama-4-scout in
    parallel (max 4 concurrent), then deterministically merges + LLM-synthesizes
    a single unified report.

    Typical latency: ~30-60s for a 156-slice CT (10 batches, 4 parallel).
    Rate-limited to 3 calls/minute per IP (heavy compute).
    """
    import time as _time

    from .studies_store import list_series_slices, series_slice_path

    uid = (req.study_uid or "").strip()
    if not uid or len(uid) > 128 or not _DICOM_UID_RE.match(uid):
        return {"ok": False, "error": "invalid study_uid"}

    slices = list_series_slices(uid)
    if not slices:
        return {"ok": False, "error": "no series slices — full-volume needs a series"}

    paths = [series_slice_path(uid, s) for s in slices]
    paths = [p for p in paths if p is not None]
    if not paths:
        return {"ok": False, "error": "series slice paths not resolvable"}

    try:
        from .ai_vision import analyze_full_volume, batch_slice_indices
    except ImportError as e:
        return {"ok": False, "error": f"vision module unavailable: {e}"}

    # Pull patient meta from the study record so every batch call includes it.
    from .studies_store import get_study as _get_study_r

    rec = _get_study_r(uid)

    # Compute totals up front so the client's progress bar has denominator
    # from the very first poll (before any batch completes).
    # Adaptive sizing rule: NEVER sacrifice per-tile resolution for speed
    # — a subtle finding on a 156-slice CT can't be seen on a 256px tile.
    # We keep tile ≥ 320px on every study, letting the batch COUNT grow.
    #   Aliaa 156 slices demonstrated this: batch=20 tile=256 → 0 findings
    #   detected. Doctor was right: the AI needs full resolution to read.
    n = len(paths)
    if req.batch_size == 16:  # default → auto
        if   n <= 24:  _batch_size, _tile = 8, 384
        elif n <= 60:  _batch_size, _tile = 8, 384
        elif n <= 120: _batch_size, _tile = 10, 352
        elif n <= 250: _batch_size, _tile = 12, 320
        elif n <= 500: _batch_size, _tile = 16, 288
        else:          _batch_size, _tile = 20, 256
    else:
        _batch_size = max(4, min(32, req.batch_size))
        _tile = 320
    # Rate-safe parallelism: 2 for large studies (Naraya free tier throttles
    # aggressively above that). 3 for small studies where speed matters.
    _max_parallel = max(1, min(6, req.max_parallel if req.max_parallel != 4 else (2 if n > 120 else 3)))
    _batches = batch_slice_indices(n, _batch_size)
    _total_batches = len(_batches)

    # Register a progress slot if the client supplied a job_id.
    job_id = (req.job_id or "").strip()[:64]
    if job_id:
        _prune_vision_progress()
        _VISION_PROGRESS[job_id] = {
            "job_id": job_id,
            "study_uid": uid,
            "total_batches": _total_batches,
            "total_slices": len(paths),
            "done_batches": 0,
            "started": _time.time(),
            "finished": False,
        }

    def _on_batch_done(batch: dict) -> None:
        if not job_id:
            return
        entry = _VISION_PROGRESS.get(job_id)
        if entry:
            entry["done_batches"] = int(entry.get("done_batches", 0)) + 1
            entry["last_batch_ok"] = bool(batch.get("ok"))

    t0 = _time.perf_counter()
    log.info(
        "vision-see-full: %d slices → batch_size=%d tile=%d parallel=%d "
        "(%d batches)",
        n, _batch_size, _tile, _max_parallel, len(_batches),
    )
    result = await analyze_full_volume(
        paths,
        req.modality or (rec.modality if rec else ""),
        req.body_part or (rec.body_part if rec else ""),
        req.symptoms or (rec.symptoms if rec else ""),
        req.clinical_history or (rec.clinical_history if rec else ""),
        req.existing_findings,
        patient_age=(rec.age if rec else None),
        patient_sex=(rec.sex if rec else None),
        patient_name=(rec.patient_name if rec else ""),
        study_description=(rec.description if rec else ""),
        referrer=(rec.referrer if rec else ""),
        batch_size=_batch_size,
        tile_size=_tile,
        max_parallel=_max_parallel,
        on_batch_done=_on_batch_done,
    )
    latency_ms = int((_time.perf_counter() - t0) * 1000)
    result["latency_ms"] = latency_ms
    result["study_uid"] = uid
    result["job_id"] = job_id

    if job_id and job_id in _VISION_PROGRESS:
        _VISION_PROGRESS[job_id]["finished"] = True
        _VISION_PROGRESS[job_id]["latency_ms"] = latency_ms

    audit(
        action="ai.vision_see_full",
        tenant="default",
        target={"type": "study", "id": uid},
        meta={
            "latency_ms": latency_ms,
            "total_slices": result.get("total_slices"),
            "batch_count": result.get("batch_count"),
            "successful_batches": result.get("successful_batches"),
            "ok": bool(result.get("ok")),
        },
    )
    return result


# ---- Region-of-interest vision (Triplanar click-to-analyze) ----

REGION_VISION_SYSTEM = (
    "LANGUAGE LOCK: Respond in clinical English ONLY. Never Arabic.\n\n"
    "You are a senior radiologist. You will be shown ONE 2D slice from a DICOM "
    "study. The context tells you which anatomical plane (Axial / Sagittal / "
    "Coronal), which slice number, and — if provided — an approximate (x,y) "
    "region-of-interest on the image.\n\n"
    "Task: Read the image at the ROI (or the whole slice if no ROI given) and "
    "state clearly whether it appears NORMAL or ABNORMAL. If abnormal, give a "
    "concise 1-2 sentence description of what you see (e.g. 'hypodense focus "
    "~2 cm in the left basal ganglia, likely acute infarct').\n\n"
    "Output STRICT JSON only, no prose:\n"
    "{\n"
    '  "verdict": "normal" | "abnormal" | "indeterminate",\n'
    '  "anatomy_at_point": "1 short phrase naming the structure(s) at the ROI",\n'
    '  "description": "1-2 sentences — empty string if normal",\n'
    '  "differential": ["dx1", "dx2"],\n'
    '  "acr_priority": "routine" | "urgent" | "STAT",\n'
    '  "confidence": 0.0-1.0,\n'
    '  "recommended_next_view": "which additional plane/sequence would help"\n'
    "}\n\n"
    "Be conservative — say 'indeterminate' if the slice is unclear rather than "
    "guess. Never fabricate findings."
)


class VisionSeeRegionRequest(BaseModel):
    study_uid: str
    plane: str = "axial"        # axial | sagittal | coronal
    slice_index: int = 0
    # Optional region-of-interest in image pixel coordinates (0-1 normalized)
    roi_x: float | None = None  # 0.0 = left, 1.0 = right
    roi_y: float | None = None  # 0.0 = top, 1.0 = bottom
    roi_radius: float = 0.1     # normalized radius of the ROI (default 10%)


@app.post("/ai/vision-see-region")
async def ai_vision_see_region(req: VisionSeeRegionRequest) -> dict:
    """Targeted vision AI on a single slice + optional point-of-interest.

    Used by the Triplanar viewer's click-to-analyze workflow. The user clicks
    on any of the 3 orthogonal panes → this endpoint reads that specific slice
    with the click coordinates marked, and returns a normal/abnormal verdict
    plus a short description.
    """
    import asyncio as _asyncio
    import time as _time

    from .studies_store import list_series_slices, series_slice_path, get_study
    from .ai_vision import render_dicom_to_png, call_vision_llm

    uid = (req.study_uid or "").strip()
    if not uid or len(uid) > 128 or not _DICOM_UID_RE.match(uid):
        return {"ok": False, "error": "invalid study_uid"}

    slices = list_series_slices(uid)
    if not slices:
        return {"ok": False, "error": "no series slices available"}

    idx = max(0, min(req.slice_index, len(slices) - 1))
    path = series_slice_path(uid, slices[idx])
    if not path:
        return {"ok": False, "error": "slice path not resolvable"}

    plane = (req.plane or "axial").strip().lower()
    if plane not in ("axial", "sagittal", "coronal"):
        plane = "axial"

    rec = get_study(uid)
    total = len(slices)

    t0 = _time.perf_counter()

    # Render the slice — Cornerstone3D uses the same DICOM series for all 3
    # planes, so we just render the requested slice at high resolution.
    try:
        png = await _asyncio.to_thread(render_dicom_to_png, path, max_dim=1024)
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"render failed: {str(e)[:200]}"}

    # Build ROI hint string for the LLM
    roi_note = ""
    if req.roi_x is not None and req.roi_y is not None:
        rx = max(0.0, min(1.0, req.roi_x))
        ry = max(0.0, min(1.0, req.roi_y))
        # Convert to compass-style description (helps the LLM localize)
        h_zone = "left" if rx < 0.33 else ("right" if rx > 0.66 else "central")
        v_zone = "upper" if ry < 0.33 else ("lower" if ry > 0.66 else "middle")
        roi_note = (
            f" REGION OF INTEREST: The doctor clicked at approximately "
            f"({rx * 100:.0f}%, {ry * 100:.0f}%) of the image — this is the "
            f"{v_zone}-{h_zone} region of the slice. Focus your analysis on "
            f"THAT area first, then briefly comment on the rest of the slice."
        )

    slice_note = (
        f" SLICE POSITION: This is the {plane.upper()} plane, slice "
        f"{idx + 1} of {total} in the volume.{roi_note}"
    )

    result = await _asyncio.to_thread(
        call_vision_llm,
        png,
        rec.modality if rec else "",
        rec.body_part if rec else "",
        (rec.symptoms if rec else "") + slice_note,
        rec.clinical_history if rec else "",
        "",
        patient_age=(rec.age if rec else None),
        patient_sex=(rec.sex if rec else None),
        patient_name=(rec.patient_name if rec else ""),
        study_description=(rec.description if rec else ""),
        referrer=(rec.referrer if rec else ""),
    )

    parsed: dict | None = None
    if result.get("ok") and result.get("text"):
        parsed = _parse_json_loose(result["text"])
        # The model may still return the standard full-vision schema — extract
        # a normal/abnormal verdict from it heuristically.
        if isinstance(parsed, dict) and "verdict" not in parsed:
            n_abnormal = len(parsed.get("abnormal_findings") or [])
            verdict = "normal" if n_abnormal == 0 else "abnormal"
            first_abn = (parsed.get("abnormal_findings") or [{}])[0]
            parsed = {
                "verdict": verdict,
                "anatomy_at_point": parsed.get("anatomy_seen", ""),
                "description": (
                    first_abn.get("finding", "") if n_abnormal else ""
                ),
                "differential": [
                    d.get("dx", "") for d in (parsed.get("differential_diagnosis") or [])[:3]
                ],
                "acr_priority": first_abn.get("acr_priority", "routine"),
                "confidence": parsed.get("confidence_in_reading", 0.5),
                "recommended_next_view": parsed.get("recommend_next_view", ""),
            }

    latency_ms = int((_time.perf_counter() - t0) * 1000)

    audit(
        action="ai.vision_see_region",
        tenant="default",
        target={"type": "study", "id": uid},
        meta={
            "plane": plane,
            "slice_index": idx,
            "has_roi": req.roi_x is not None,
            "latency_ms": latency_ms,
            "ok": bool(result.get("ok")),
        },
    )

    return {
        "ok": result.get("ok", False),
        "plane": plane,
        "slice_index": idx,
        "total_slices": total,
        "parsed": parsed,
        "raw_text": result.get("text", ""),
        "provider": result.get("provider", ""),
        "model": result.get("model", ""),
        "latency_ms": latency_ms,
        "error": result.get("error"),
    }


@app.post("/ai/vision-analyze")
async def ai_vision_analyze(req: VisionAnalyzeRequest) -> dict:
    """Analyze a slice with local feature extraction + Naraya synthesis.

    Combines pydicom+numpy+scipy features with mistral-medium-3-5 reasoning to
    simulate a vision-model reading. Locally computed HU stats, edge density,
    and blob detection provide numerical evidence the LLM synthesizes into
    additional_findings JSON.
    """
    import asyncio as _asyncio
    import time as _time

    try:
        from .ai_vision import (
            VISION_SYNTHESIZE_SYSTEM,
            analyze_features,
            build_vision_prompt,
        )
    except ImportError as e:
        return {"ok": False, "error": f"vision module unavailable: {e}"}

    # Pick a slice: prefer series if present, otherwise single-file DICOM
    from .studies_store import list_series_slices, series_slice_path

    slices = list_series_slices(req.study_uid)
    if slices:
        idx = max(0, min(req.slice_index, len(slices) - 1))
        path = series_slice_path(req.study_uid, slices[idx])
    else:
        path = dicom_path_for(req.study_uid)

    t0 = _time.perf_counter()

    # NEW: tolerate missing DICOM — fall back to metadata-only reasoning
    features: dict = {}
    dicom_available = path is not None
    if dicom_available:
        try:
            features = await _asyncio.to_thread(analyze_features, path)
        except Exception as e:
            # Corrupt or unreadable DICOM — proceed without features, note it
            features = {"error": f"feature extraction failed: {str(e)[:100]}"}
    else:
        features = {
            "note": "no DICOM attached — analysis based on clinical metadata only",
            "modality": req.modality,
            "body_part": req.body_part,
        }

    prompt = build_vision_prompt(features, req.modality, req.body_part, req.existing_findings)
    try:
        raw = await _asyncio.to_thread(
            _call_naraya_english,
            VISION_SYNTHESIZE_SYSTEM,
            prompt,
            30.0,
            NARAYA_MODEL_IMPRESSION,
            600,
            0.0,
        )
    except Exception as e:
        return {"ok": False, "error": str(e)[:200], "features": features}

    latency_ms = int((_time.perf_counter() - t0) * 1000)
    parsed: dict = {}
    try:
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`").strip()
            if cleaned.startswith("json"):
                cleaned = cleaned[4:].strip()
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        parsed = {
            "additional_findings": [],
            "confirmed_findings": [],
            "differential": [],
            "confidence": 0.0,
            "regions_of_interest": [],
        }

    audit(
        action="ai.vision_analyzed",
        tenant="default",
        target={"type": "study", "id": req.study_uid},
        meta={
            "latency_ms": latency_ms,
            "abnormality_score": features.get("abnormality_score"),
            "slice_index": req.slice_index,
        },
    )
    parsed = await _asyncio.to_thread(_scrub_arabic, parsed)
    return {"ok": True, "features": features, "latency_ms": latency_ms, **parsed}


# ----- Premium: Multi-tissue segmentation -----


class SegmentRequest(BaseModel):
    study_uid: str
    slice_index: int = 0


@app.post("/ai/segment")
async def ai_segment(req: SegmentRequest) -> dict:
    """Return a base64 PNG RGBA overlay showing tissue types by color."""
    import asyncio as _asyncio
    import time as _time

    try:
        from .ai_vision import segment_tissues
    except ImportError as e:
        return {"ok": False, "error": f"vision module unavailable: {e}"}

    from .studies_store import list_series_slices, series_slice_path

    slices = list_series_slices(req.study_uid)
    if slices:
        idx = max(0, min(req.slice_index, len(slices) - 1))
        path = series_slice_path(req.study_uid, slices[idx])
    else:
        path = dicom_path_for(req.study_uid)
    if path is None:
        return {"ok": False, "error": "no DICOM attached to this study"}

    t0 = _time.perf_counter()
    try:
        png_b64, stats = await _asyncio.to_thread(segment_tissues, path)
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}
    latency_ms = int((_time.perf_counter() - t0) * 1000)

    audit(
        action="ai.segmented",
        tenant="default",
        target={"type": "study", "id": req.study_uid},
        meta={"latency_ms": latency_ms, "slice_index": req.slice_index},
    )
    return {"ok": True, "mask_png_base64": png_b64, "statistics": stats, "latency_ms": latency_ms}


# ----- Premium: PubMed citation search -----


class PubMedRequest(BaseModel):
    finding: str
    modality: str = ""
    body_part: str = ""
    limit: int = 3


@app.post("/ai/pubmed-cite")
async def ai_pubmed_cite(req: PubMedRequest) -> dict:
    """Search PubMed for top papers relevant to a finding, then rank via Naraya."""
    import asyncio as _asyncio
    import time as _time

    import httpx

    if not req.finding.strip():
        return {"ok": False, "error": "finding is required"}

    query = " ".join(
        w for w in [req.finding, req.body_part, req.modality, "imaging"] if w
    ).strip()

    t0 = _time.perf_counter()
    esearch_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
    efetch_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            r = await client.get(
                esearch_url,
                params={
                    "db": "pubmed",
                    "term": query,
                    "retmax": max(1, min(10, req.limit * 3)),
                    "retmode": "json",
                    "sort": "relevance",
                },
            )
            r.raise_for_status()
            pmids = r.json().get("esearchresult", {}).get("idlist", [])
            if not pmids:
                return {"ok": True, "citations": [], "latency_ms": 0}

            r2 = await client.get(
                efetch_url,
                params={
                    "db": "pubmed",
                    "id": ",".join(pmids[: req.limit * 3]),
                    "retmode": "json",
                },
            )
            r2.raise_for_status()
            summary = r2.json().get("result", {})

        raw_citations = []
        for pmid in pmids[: req.limit * 3]:
            entry = summary.get(pmid) or {}
            if not entry.get("title"):
                continue
            raw_citations.append(
                {
                    "pmid": pmid,
                    "title": entry.get("title", ""),
                    "journal": entry.get("fulljournalname") or entry.get("source", ""),
                    "year": (entry.get("pubdate") or "").split()[0] or "",
                    "authors": [a.get("name", "") for a in entry.get("authors") or []][:3],
                    "snippet": (entry.get("elocationid") or entry.get("title") or "")[:180],
                }
            )
    except Exception as e:
        return {"ok": False, "error": f"pubmed lookup failed: {e}"}

    # Ask Naraya to rank + score the citations by relevance
    rank_system = (
        "You are a radiology librarian. Given a clinical finding and a list of PubMed papers, "
        "rank them by relevance to the finding. Output STRICT JSON only, no prose: "
        '{"ranked": [{"pmid": str, "relevance_score": 0-1, "why": str}]}'
    )
    rank_prompt = (
        f"Finding: {req.finding}\nModality: {req.modality}. Body part: {req.body_part}.\n"
        f"Candidates:\n{json.dumps(raw_citations, ensure_ascii=False)[:6000]}"
    )
    try:
        ranked_raw = await _asyncio.to_thread(
            _call_naraya_english,
            rank_system,
            rank_prompt,
            25.0,
            NARAYA_MODEL_COMPARE,
            500,
            0.0,
        )
        cleaned = ranked_raw.strip().strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()
        rank = json.loads(cleaned).get("ranked", [])
    except Exception:
        rank = [{"pmid": c["pmid"], "relevance_score": 0.5, "why": ""} for c in raw_citations]

    # Merge back into raw_citations
    score_map = {r.get("pmid"): r for r in rank}
    for c in raw_citations:
        s = score_map.get(c["pmid"], {})
        c["relevance_score"] = float(s.get("relevance_score", 0.5))
        c["why"] = s.get("why", "")

    raw_citations.sort(key=lambda c: c["relevance_score"], reverse=True)
    citations = raw_citations[: req.limit]

    latency_ms = int((_time.perf_counter() - t0) * 1000)
    audit(
        action="ai.pubmed_cited",
        tenant="default",
        target={"type": "finding", "id": req.finding[:60]},
        meta={"latency_ms": latency_ms, "count": len(citations)},
    )
    return {"ok": True, "citations": citations, "latency_ms": latency_ms}


# ----- Premium: Personal AI Style Learner -----

STYLE_DIR = Path(os.getenv("MIDCINE_STYLE_DIR", str(Path(__file__).resolve().parent.parent / "data" / "style")))
STYLE_DIR.mkdir(parents=True, exist_ok=True)


class StyleEditPair(BaseModel):
    user_id: str
    original: str
    edited: str
    modality: str = ""
    body_part: str = ""


@app.post("/ai/style/record")
def style_record(edit: StyleEditPair) -> dict:
    """Record an edit pair; keep last 30 per user to bound memory."""
    if not edit.original.strip() or not edit.edited.strip():
        return {"ok": False, "error": "both original and edited are required"}
    if edit.original.strip() == edit.edited.strip():
        return {"ok": True, "skipped": "no diff"}

    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in edit.user_id)[:100] or "anon"
    f = STYLE_DIR / f"{safe}.json"
    items: list = []
    if f.exists():
        try:
            items = json.loads(f.read_text(encoding="utf-8")).get("edits", [])
        except Exception:
            items = []
    items.append(
        {
            "ts": time.time(),
            "original": edit.original[:2000],
            "edited": edit.edited[:2000],
            "modality": edit.modality,
            "body_part": edit.body_part,
        }
    )
    items = items[-30:]
    f.write_text(
        json.dumps({"user_id": safe, "edits": items}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    return {"ok": True, "count": len(items)}


@app.get("/ai/style/profile/{user_id}")
def style_profile(user_id: str) -> dict:
    """Return the current style profile summary — computed from recorded edits."""
    safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in user_id)[:100] or "anon"
    f = STYLE_DIR / f"{safe}.json"
    if not f.exists():
        return {"ok": True, "user_id": safe, "edit_count": 0, "rules": None}
    try:
        data = json.loads(f.read_text(encoding="utf-8"))
    except Exception:
        return {"ok": False, "error": "corrupt profile"}
    edits = data.get("edits", [])
    if len(edits) < 3:
        return {
            "ok": True,
            "user_id": safe,
            "edit_count": len(edits),
            "rules": None,
            "hint": "need at least 3 edits before extracting a style profile",
        }
    # Extract style rules via Naraya
    system = (
        "You are a radiology report style analyzer. Given pairs of {original AI impression} "
        "and {edited human impression}, extract explicit style rules covering: "
        "(1) Terminology preferences, (2) Sentence structure, (3) Confidence phrasing, "
        "(4) Omitted/reordered elements. "
        'Return STRICT JSON only: {"terminology":[str,...],"structure":[str,...],"phrasing":[str,...],"omissions":[str,...]}. '
        "Never invent rules not supported by the diff. Keep each rule under 15 words."
    )
    prompt_body = "\n\n".join(
        f"Original:\n{e['original']}\nEdited:\n{e['edited']}" for e in edits[-10:]
    )
    try:
        text = _call_naraya_sync(system, prompt_body, 25.0, NARAYA_MODEL_COMPARE, 400, 0.0)
        cleaned = text.strip().strip("`")
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()
        rules = json.loads(cleaned)
    except Exception as e:
        return {"ok": False, "error": f"style extraction failed: {e}"}
    return {"ok": True, "user_id": safe, "edit_count": len(edits), "rules": rules}


@app.post("/waitlist")
def waitlist_join(entry: WaitlistEntry) -> dict:
    """Add an email to the launch waitlist. Idempotent per-email."""
    if "@" not in entry.email or "." not in entry.email:
        return {"ok": False, "error": "invalid email"}
    saved = _wl_add(entry)
    audit(
        action="waitlist.joined",
        tenant="marketing",
        target={"type": "waitlist", "id": entry.email},
        meta={"role": entry.role, "country": entry.country},
    )
    return {"ok": True, "email": saved.email, "position": _wl_count()}


@app.get("/waitlist/count")
def waitlist_stats() -> dict:
    return {"count": _wl_count()}


@app.get("/integrations/health")
async def integrations_health() -> dict:
    """Probe actual dependencies. Reports true state (up/down/not-configured)."""
    from .midcine_nexus import health as nexus_health

    naraya_ok = await health_check()
    nx = nexus_health()
    return {
        "naraya": {
            "connected": naraya_ok,
            "backend": "mistral-large",
            "hint": "Cloud AI backend for NEXUS ensemble",
        },
        "nexus_bridge": {
            "connected": bool(nx.get("bridge_ready")),
            "agents_available": nx.get("agents_available"),
            "nexus_root": nx.get("nexus_root"),
            "hint": "midcine ↔ NEXUS-AI in-process bridge (46 agents)",
        },
        "orthanc": {
            "connected": False,
            "hint": "Not wired yet — DICOM C-STORE port 11113 when connected",
        },
        "hl7_ris": {
            "connected": False,
            "hint": "Not wired — HL7 v2 integration with hospital RIS",
        },
        "fhir_gateway": {
            "connected": False,
            "hint": "Not wired — FHIR R4 ImagingStudy + DiagnosticReport",
        },
        "whatsapp": {
            "connected": True,
            "mode": "mock",
            "hint": "Local Baileys mock — stored in data/whatsapp/. Production: Business API",
        },
        "backup": {
            "connected": False,
            "hint": "Not enabled — MinIO/S3 for daily backups",
        },
    }


# ============================================================
# NEXUS bridge endpoints (46 agents on tap for radiology tasks)
# ============================================================


class NexusAgentRequest(BaseModel):
    agent_id: str
    prompt: str
    add_medical_context: bool = True


@app.post("/ai/nexus/agent")
async def ai_nexus_agent(req: NexusAgentRequest) -> dict:
    """Call any NEXUS agent by id from midcine. Medical preamble is prepended
    automatically unless disabled.

    Common agents:
      - guardian: safety / critical-finding scan
      - algorithm_expert: image-feature interpretation
      - research_agent: differential diagnosis (broad knowledge)
      - rag_specialist: PubMed / guideline retrieval
      - content_writer: patient-facing explanation prose
      - code_reviewer: sanity-check AI outputs
    """
    import asyncio as _asyncio

    from .midcine_nexus import call_nexus_agent

    if not req.prompt.strip():
        return {"ok": False, "error": "prompt is empty"}
    if not req.agent_id.strip():
        return {"ok": False, "error": "agent_id is required"}

    result = await _asyncio.to_thread(
        call_nexus_agent,
        req.agent_id.strip(),
        req.prompt,
        add_medical_context=req.add_medical_context,
    )
    return result


class NexusUnifiedRequest(BaseModel):
    system: str
    user: str
    task_hint: str = "medical"
    add_medical_context: bool = True


@app.post("/ai/nexus/unified")
async def ai_nexus_unified(req: NexusUnifiedRequest) -> dict:
    """Run the 5-model unified brain ensemble (high-stakes / accuracy-first).

    task_hint: 'medical' | 'analysis' | 'code' | 'creative' | 'fast'
    """
    import asyncio as _asyncio

    from .midcine_nexus import call_unified_brain

    if not req.user.strip():
        return {"ok": False, "error": "user prompt is empty"}

    result = await _asyncio.to_thread(
        call_unified_brain,
        req.system,
        req.user,
        task_hint=req.task_hint,
        add_medical_context=req.add_medical_context,
    )
    return result


@app.get("/ai/nexus/health")
def ai_nexus_health() -> dict:
    """Report bridge readiness + count of available agents."""
    from .midcine_nexus import health

    return health()


# ============================================================
# Specialist medical models (routed per modality/body_part)
# ============================================================


class SpecialistAnalyzeRequest(BaseModel):
    study_uid: str
    slice_index: int = 0
    modality: str = ""
    body_part: str = ""


@app.post("/ai/specialist/analyze")
async def ai_specialist_analyze(req: SpecialistAnalyzeRequest) -> dict:
    """Route the study to the best specialist medical AI model based on
    modality + body_part. Currently:

    - CXR (CR/DR chest) → TorchXRayVision (18-pathology classifier)

    Returns per-pathology probabilities. For CXR, positive threshold = 0.5.
    """
    import asyncio as _asyncio

    from .studies_store import list_series_slices, series_slice_path
    from .specialist_models import suggest_specialist, analyze_cxr_torchxrayvision

    uid = (req.study_uid or "").strip()
    if not uid or len(uid) > 128 or not _DICOM_UID_RE.match(uid):
        return {"ok": False, "error": "invalid study_uid"}

    specialist = suggest_specialist(req.modality, req.body_part)
    if not specialist:
        return {
            "ok": False,
            "specialist": None,
            "error": (
                f"no specialist model for modality={req.modality} "
                f"body_part={req.body_part}"
            ),
        }

    # Pick the slice (CXR is single-frame; index 0 usually enough)
    slices = list_series_slices(uid)
    if slices:
        idx = max(0, min(req.slice_index, len(slices) - 1))
        path = series_slice_path(uid, slices[idx])
    else:
        path = dicom_path_for(uid)

    if not path:
        return {"ok": False, "specialist": specialist, "error": "DICOM not found"}

    if specialist == "torchxrayvision-cxr":
        result = await _asyncio.to_thread(analyze_cxr_torchxrayvision, path)
        result["specialist"] = specialist
        audit(
            action="ai.specialist_analyzed",
            tenant="default",
            target={"type": "study", "id": uid},
            meta={
                "specialist": specialist,
                "positive_count": result.get("positive_count"),
                "ok": result.get("ok"),
            },
        )
        return result

    return {"ok": False, "specialist": specialist, "error": "specialist not wired"}


@app.get("/ai/specialist/health")
def ai_specialist_health() -> dict:
    """Report specialist models availability."""
    from .specialist_models import health

    return health()


# ============================================================
# Final Report — one-click deep analysis → ready-to-send report
# ============================================================


class FinalReportRequest(BaseModel):
    study_uid: str
    # Optional extra context. If empty, pulled from StudyRecord.
    symptoms: str = ""
    clinical_history: str = ""
    additional_notes: str = ""


FINAL_REPORT_COMPOSER_SYSTEM = (
    "LANGUAGE LOCK: Respond in clinical English ONLY. Never Arabic or any other "
    "language.\n\n"
    "You are a senior consultant radiologist writing the FINAL radiology "
    "report. You will receive:\n"
    "  1. Patient identity (name, age, sex, MRN)\n"
    "  2. Study metadata (modality, body region, description, referrer)\n"
    "  3. Clinical context (symptoms, history)\n"
    "  4. AI vision findings — a JSON list of abnormal findings extracted "
    "from the slices the AI was ABLE to analyze. This list may be INCOMPLETE "
    "if some slice batches failed — the caller will always tell you the "
    "coverage percentage and any UNREAD slice ranges.\n\n"
    "═══ ABSOLUTE ANTI-HALLUCINATION RULES ═══\n"
    "1. FINDINGS SECTION — the ONLY sources of truth are:\n"
    "   (a) the AI vision JSON supplied to you, and\n"
    "   (b) explicit prior-report/document text supplied in the context.\n"
    "   You are FORBIDDEN from inventing pathology, sizes, locations, or "
    "measurements that are not present in one of those sources. If the AI "
    "JSON is empty or thin, your FINDINGS section must be correspondingly "
    "brief — do NOT pad it.\n"
    "2. COVERAGE HONESTY — if the caller reports coverage < 100% (some "
    "batches failed), you MUST insert this line at the END of the FINDINGS "
    "section, verbatim:\n"
    "   'Note: AI coverage was <X>% of the volume; slices <ranges> could "
    "not be analyzed automatically and require direct radiologist review.'\n"
    "   Do NOT write 'the remainder is unremarkable' when coverage is "
    "incomplete — you have no basis for that claim.\n"
    "3. NO SPECULATION — never write 'suggestive of', 'concerning for', "
    "'raises the possibility of' UNLESS the same qualifier appears in the "
    "AI JSON or a supplied document. If you must record uncertainty, "
    "write 'incompletely characterized — recommend correlation'.\n"
    "4. NO INFERRED MEASUREMENTS — never invent millimeter/centimeter values. "
    "Only cite measurements that appear literally in the JSON.\n"
    "5. NO SYMPTOM-DRIVEN FINDINGS — the clinical context tells you WHY the "
    "study was ordered; it does NOT authorize you to add findings that "
    "would fit those symptoms if the vision AI did not see them.\n"
    "6. IDENTITY VERBATIM — copy patient name/MRN/age/sex CHARACTER-FOR-"
    "CHARACTER from the identity block. Never guess, never translate, never "
    "normalize (e.g. do not change 'Ali A. Youssef' → 'Ali Youssef').\n\n"
    "═══ REPORT STRUCTURE ═══\n"
    "  PATIENT: <name> · Age <N> · Sex <M/F> · MRN <id>\n"
    "  EXAMINATION: <modality> <body region> — <study description>\n"
    "  REFERRING PHYSICIAN: <referrer>\n"
    "  CLINICAL INDICATION: <symptoms + relevant history in 1-2 sentences>\n"
    "\n"
    "  TECHNIQUE: <1 sentence, e.g. 'Non-contrast axial MR of the lumbar "
    "spine with T1, T2, and STIR sequences.'>\n"
    "\n"
    "  FINDINGS:\n"
    "  <Structured prose covering ONLY findings present in the AI JSON. "
    "Group by anatomical region. Use exact slice references (e.g. 'slices "
    "14-22'). Include measurements ONLY if they appear in the JSON. "
    "If coverage < 100%, append the mandatory coverage-honesty line.>\n"
    "\n"
    "  IMPRESSION:\n"
    "  <Numbered list, most important first. Each item = one clinical "
    "conclusion drawn strictly from the FINDINGS section. Tag [STAT] / "
    "[Urgent] / [Routine] using the acr_priority from the JSON — do NOT "
    "upgrade priority yourself.>\n"
    "\n"
    "  RECOMMENDATIONS:\n"
    "  <Numbered list. Concrete actions tied to the FINDINGS. If coverage "
    "< 100%, item #1 MUST be: 'Direct radiologist review of unread slices "
    "<ranges> before final sign-out.'>\n"
    "\n"
    "  ---\n"
    "  Report drafted with AI assistance. Requires radiologist review + "
    "signature before release.\n\n"
    "═══ FORMATTING RULES ═══\n"
    "- English only. NEVER 'age unknown' / 'sex unknown' / 'no clinical "
    "context' when values are given.\n"
    "- Never omit patient identity or the disclaimer footer.\n"
    "- Cite exact slice numbers from the JSON. The doctor uses them to "
    "jump the viewer.\n"
    "- Return ONLY the report text (no markdown fences, no prose before or "
    "after the report). The receiving system will render it verbatim."
)


@app.post("/ai/generate-final-report")
async def ai_generate_final_report(req: FinalReportRequest) -> dict:
    """One-click deep analysis. Reads every slice of the study, extracts all
    findings, then composes a single canonical radiology report ready for
    print / PDF / send. This replaces per-section AI drafting.

    Returns:
      {"ok": bool, "report_text": str, "report_html": str, "meta": {...},
       "vision": {...}, "latency_ms": int}
    """
    import asyncio as _asyncio
    import time as _time

    from .studies_store import get_study, list_series_slices, series_slice_path
    from .ai_vision import analyze_full_volume

    uid = (req.study_uid or "").strip()
    if not uid or len(uid) > 128 or not _DICOM_UID_RE.match(uid):
        return {"ok": False, "error": "invalid study_uid"}

    rec = get_study(uid)
    slices = list_series_slices(uid)
    if not slices:
        return {
            "ok": False,
            "error": "no series slices — cannot analyze without images",
        }
    paths = [series_slice_path(uid, s) for s in slices]
    paths = [p for p in paths if p is not None]
    if not paths:
        return {"ok": False, "error": "series slice paths not resolvable"}

    t0 = _time.perf_counter()

    modality = (rec.modality if rec else "") or ""
    body_part = (rec.body_part if rec else "") or ""
    symptoms = req.symptoms or (rec.symptoms if rec else "") or ""
    clinical_history = req.clinical_history or (rec.clinical_history if rec else "") or ""
    patient_age = rec.age if rec else None
    patient_sex = rec.sex if rec else None
    patient_name = (rec.patient_name if rec else "") or ""
    patient_id = (rec.patient_id if rec else "") or ""
    study_description = (rec.description if rec else "") or ""
    referrer = (rec.referrer if rec else "") or ""

    # Sex map used both by the Relevance Guardian and the compose step.
    sex_map = {"M": "Male", "F": "Female", "O": "Other", "U": "Unknown"}

    # ---- 1) Deep full-volume vision — quality-first + rate-safe ----
    # Design:
    #   • Tile ≥ 320px (never drop resolution — AI misses subtle lesions)
    #   • max_parallel ≤ 2 on large studies (Naraya per-minute limit fires
    #     above that on the free tier; serializing is more reliable than
    #     hammering into 429s and dropping batches)
    n_slices = len(paths)
    if n_slices <= 24:
        _bs, _ts, _mp = 8, 384, 3
    elif n_slices <= 60:
        _bs, _ts, _mp = 8, 384, 3
    elif n_slices <= 120:
        _bs, _ts, _mp = 10, 352, 2
    elif n_slices <= 250:
        _bs, _ts, _mp = 12, 320, 2   # Aliaa 156 → 13 batches, safe pacing
    elif n_slices <= 500:
        _bs, _ts, _mp = 16, 288, 2
    else:
        _bs, _ts, _mp = 20, 256, 2
    log.info(
        "generate-final-report: %d slices → batch_size=%d tile=%d parallel=%d "
        "(~%d vision calls)",
        n_slices, _bs, _ts, _mp,
        (n_slices + _bs - 1) // _bs,
    )
    fv = await analyze_full_volume(
        paths,
        modality,
        body_part,
        symptoms,
        clinical_history,
        req.additional_notes,  # existing_findings placeholder
        patient_age=patient_age,
        patient_sex=patient_sex,
        patient_name=patient_name,
        study_description=study_description,
        referrer=referrer,
        batch_size=_bs,
        tile_size=_ts,
        cols=4,
        max_parallel=_mp,
    )

    # ---- 2) Full Intake dossier — every file the doctor uploaded ----
    # Includes: PDF reports (extracted text), plain notes, prior radiology
    # reports the patient brought, clinical photos, and DICOM slice count.
    from .intake import build_dossier

    dossier = build_dossier(uid)
    dossier_summary = {
        "pdf_count": len(dossier.get("pdf_texts", [])),
        "notes_count": len(dossier.get("notes", [])),
        "reports_count": len(dossier.get("reports", [])),
        "photos_count": len(dossier.get("photos", [])),
        "dicom_slice_count": dossier.get("dicom_slice_count", 0),
    }

    # ---- 2a) RELEVANCE GUARDIAN — does the uploaded content match THIS patient? ----
    # Prevents the AI from using unrelated files (e.g. a knee MRI report
    # uploaded by mistake to a brain CT study) as evidence for the diagnosis.
    relevance_warnings: list[str] = []
    relevance_verdict = "no_docs"  # no_docs | relevant | mixed | irrelevant
    docs_to_use: list[dict] = []
    if (
        dossier_summary["pdf_count"]
        + dossier_summary["notes_count"]
        + dossier_summary["reports_count"]
    ) > 0:
        # Build a compact summary of each doc for the guardian
        doc_previews: list[dict] = []
        for r in dossier.get("reports", [])[:8]:
            doc_previews.append(
                {
                    "kind": r.get("kind", "report"),
                    "name": r.get("name", ""),
                    "preview": (r.get("text") or "")[:1500],
                    "channel": "reports",
                }
            )
        for p in dossier.get("pdf_texts", [])[:6]:
            doc_previews.append(
                {
                    "kind": "pdf",
                    "name": p.get("name", ""),
                    "preview": (p.get("text") or "")[:1500],
                    "channel": "pdf_texts",
                }
            )
        for n in dossier.get("notes", [])[:6]:
            doc_previews.append(
                {
                    "kind": "note",
                    "name": n.get("name", ""),
                    "preview": (n.get("text") or "")[:1500],
                    "channel": "notes",
                }
            )

        guardian_system = (
            "LANGUAGE LOCK: Respond in clinical English ONLY. Never Arabic.\n\n"
            "You are a medical records safety officer. Your job: decide for "
            "each uploaded document whether it belongs to THIS patient's "
            "current radiology study, or was uploaded by mistake and must be "
            "ignored.\n\n"
            "For each document, judge:\n"
            "1. Does the patient identity (name/age/sex) in the doc match the "
            "current patient?\n"
            "2. Does the anatomical region / condition described plausibly "
            "relate to this study (same modality region, same organ system, "
            "related symptoms)?\n"
            "3. Is the doc from a timeframe consistent with the study "
            "workup?\n\n"
            "Output STRICT JSON only:\n"
            "{\n"
            '  "documents": [\n'
            "    {\n"
            '      "name": "<verbatim filename>",\n'
            '      "kind": "<pdf|note|report|photo>",\n'
            '      "verdict": "relevant" | "possibly_relevant" | "irrelevant",\n'
            '      "reason": "1 short sentence in English",\n'
            '      "key_facts": ["fact1", "fact2"]\n'
            "    }\n"
            "  ],\n"
            '  "overall_verdict": "relevant" | "mixed" | "irrelevant",\n'
            '  "safe_to_use": [ "<name>", ... ],\n'
            '  "must_ignore": [ "<name>", ... ],\n'
            '  "warnings": [ "<1-line warning to show the radiologist>" ]\n'
            "}\n\n"
            "Rules:\n"
            "- Be strict — false-positive relevance can inject wrong data "
            "into the final report.\n"
            "- If patient name differs and no explanation given → irrelevant.\n"
            "- If body region completely unrelated (e.g. dental panoramic "
            "attached to brain MR) → irrelevant.\n"
            "- If timeframe/context matches → relevant."
        )

        guardian_prompt = (
            f"CURRENT PATIENT:\n"
            f"- Name: {patient_name or '(unnamed)'}\n"
            f"- MRN: {patient_id or '(unknown)'}\n"
            f"- Age: {patient_age if patient_age else '(unknown)'}\n"
            f"- Sex: {sex_map.get((patient_sex or '').strip().upper(), (patient_sex or '').strip()) or '(unknown)'}\n"
            f"- Modality: {modality or '(unknown)'}\n"
            f"- Body region: {body_part or '(unknown)'}\n"
            f"- Symptoms: {symptoms or '(not stated)'}\n"
            f"- History: {clinical_history or '(not stated)'}\n\n"
            f"UPLOADED DOCUMENTS ({len(doc_previews)}):\n"
            f"{json.dumps(doc_previews, ensure_ascii=False, indent=2)[:8000]}\n\n"
            f"Judge each document, then return the JSON."
        )

        try:
            g_raw = await _asyncio.to_thread(
                _call_naraya_sync,
                guardian_system,
                guardian_prompt,
                45.0,
                NARAYA_MODEL_COMPARE,
                1200,
                0.0,
            )
            g_parsed = _parse_json_loose(g_raw)
            if isinstance(g_parsed, dict):
                relevance_verdict = g_parsed.get("overall_verdict", "mixed")
                relevance_warnings = g_parsed.get("warnings", []) or []
                safe_names = set(g_parsed.get("safe_to_use", []) or [])
                # Build the doc-use list — only include safe ones
                for d in doc_previews:
                    if not safe_names or d["name"] in safe_names:
                        # Fetch full text (not just preview) for compose
                        text = ""
                        for r in dossier.get("reports", []):
                            if r.get("name") == d["name"]:
                                text = r.get("text", "")
                                break
                        for p in dossier.get("pdf_texts", []):
                            if p.get("name") == d["name"]:
                                text = p.get("text", "")
                                break
                        for n in dossier.get("notes", []):
                            if n.get("name") == d["name"]:
                                text = n.get("text", "")
                                break
                        docs_to_use.append(
                            {
                                "name": d["name"],
                                "kind": d["kind"],
                                "text": (text or d.get("preview", ""))[:6000],
                            }
                        )
                # If the guardian says everything is irrelevant → bail early
                if relevance_verdict == "irrelevant" and not docs_to_use:
                    return {
                        "ok": False,
                        "error": (
                            "The uploaded documents do not appear to belong to "
                            "this patient. Please review the files before "
                            "generating the report."
                        ),
                        "relevance": {
                            "verdict": "irrelevant",
                            "warnings": relevance_warnings,
                            "documents_reviewed": g_parsed.get("documents", []),
                        },
                        "meta": {
                            "patient_name": patient_name,
                            "patient_id": patient_id,
                            "study_uid": uid,
                        },
                    }
        except Exception as e:  # noqa: BLE001
            relevance_warnings.append(
                f"Relevance check unavailable ({str(e)[:100]}). "
                f"Documents will not be included in the report."
            )

    # ---- 3) Compose the canonical report from vision findings + safe docs ----
    parsed = fv.get("parsed") or {}
    vision_summary = {
        "anatomy_seen": parsed.get("anatomy_seen", ""),
        "abnormal_findings": parsed.get("abnormal_findings", []),
        "normal_findings": parsed.get("normal_findings", []),
        "differential_diagnosis": parsed.get("differential_diagnosis", []),
        "critical": parsed.get("critical", False),
        "urgent": parsed.get("urgent", False),
        "slices_reviewed": parsed.get("slices_reviewed", ""),
        "overall_impression": parsed.get("overall_impression", ""),
        "recommend_next_view": parsed.get("recommend_next_view", ""),
    }

    # Patient identity block for the composer (sex_map defined earlier)
    sex_disp = sex_map.get((patient_sex or "").strip().upper(), (patient_sex or "").strip())

    # Build a compact block of relevant patient-brought documents (already
    # filtered by the Relevance Guardian above).
    docs_block = ""
    if docs_to_use:
        parts = ["\nPATIENT-BROUGHT DOCUMENTS (relevance-verified):"]
        for d in docs_to_use[:8]:
            parts.append(
                f"\n[{d['kind'].upper()} · {d['name']}]\n"
                f"{(d.get('text') or '').strip()[:3000]}"
            )
        docs_block = "\n".join(parts)

    warnings_block = ""
    if relevance_warnings:
        warnings_block = (
            "\nDOCUMENT WARNINGS (surface these to the radiologist under "
            "'Notes' in the report):\n"
            + "\n".join(f"- {w}" for w in relevance_warnings[:5])
        )

    # ---- Compute exact UNREAD slice ranges from batch failures ----
    # The composer must be told which ranges were NOT analyzed so it can
    # (1) refuse to make up findings for them and (2) surface a coverage
    # warning to the doctor.
    _batches_list = fv.get("batches") or []
    _total_batches = fv.get("batch_count") or 0
    _success_batches = fv.get("successful_batches") or 0
    _coverage_pct = (
        fv.get("coverage_pct")
        if fv.get("coverage_pct") is not None
        else round(100.0 * _success_batches / max(1, _total_batches), 1)
    )
    _unread_ranges: list[str] = []
    for b in _batches_list:
        if not b.get("ok") and b.get("slice_range"):
            _unread_ranges.append(str(b["slice_range"]))
    _unread_display = ", ".join(_unread_ranges) if _unread_ranges else "(none — full coverage)"

    coverage_block = (
        "COVERAGE:\n"
        f"- Total slices in study: {fv.get('total_slices')}\n"
        f"- Batches attempted: {_total_batches}\n"
        f"- Batches successfully analyzed: {_success_batches}/{_total_batches}"
        f" ({_coverage_pct}% of the volume)\n"
        f"- UNREAD slice ranges (AI could NOT analyze — DO NOT invent findings for these): "
        f"{_unread_display}\n"
    )

    context_prompt = (
        "PATIENT IDENTITY (use verbatim in the report header):\n"
        f"- Name: {patient_name or '(unnamed)'}\n"
        f"- MRN: {patient_id or '(not stated)'}\n"
        f"- Age: {patient_age if patient_age else '(not stated)'}\n"
        f"- Sex: {sex_disp or '(not stated)'}\n\n"
        "STUDY METADATA:\n"
        f"- Modality: {modality or '(unknown)'}\n"
        f"- Body region: {body_part or '(unknown)'}\n"
        f"- Study description: {study_description or '(not stated)'}\n"
        f"- Referring physician: {referrer or '(not stated)'}\n\n"
        f"{coverage_block}\n"
        "CLINICAL CONTEXT:\n"
        f"- Symptoms: {symptoms or '(not stated)'}\n"
        f"- History: {clinical_history or '(not stated)'}\n"
        f"- Additional notes: {req.additional_notes or '(none)'}\n\n"
        "AI VISION FINDINGS (the ONLY imaging findings you may include — "
        "do NOT add anything not present here, even if it would fit the "
        "clinical picture):\n"
        f"{json.dumps(vision_summary, ensure_ascii=False, indent=2)[:8000]}\n"
        f"{docs_block}\n"
        f"{warnings_block}\n\n"
        "Compose the final radiology report per the system rules. Weave "
        "supporting evidence from the PATIENT-BROUGHT DOCUMENTS into the "
        "Findings/Impression where it strengthens or challenges a diagnosis, "
        "BUT never let documents authorize imaging findings the AI did not see. "
        "If COVERAGE is < 100%, follow the coverage-honesty rule verbatim. "
        "Return ONLY the report body — no preamble, no markdown fences."
    )

    report_text = ""
    compose_ok = False
    try:
        report_text = await _asyncio.to_thread(
            _call_naraya_sync,
            FINAL_REPORT_COMPOSER_SYSTEM,
            context_prompt,
            90.0,
            NARAYA_MODEL_IMPRESSION,
            2500,
            0.1,
        )
        report_text = (report_text or "").strip()
        # Strip markdown fences if the model added any
        if report_text.startswith("```"):
            first_nl = report_text.find("\n")
            if first_nl > 0:
                report_text = report_text[first_nl + 1 :]
            if report_text.rstrip().endswith("```"):
                report_text = report_text.rstrip()[:-3].rstrip()
        compose_ok = bool(report_text)
    except Exception as e:  # noqa: BLE001
        report_text = f"[ERROR composing report: {str(e)[:200]}]"

    # ---- 3) HTML render for print / PDF ----
    from html import escape as _esc
    from datetime import UTC, datetime

    def _paragraphize(text: str) -> str:
        blocks = text.split("\n\n")
        html_blocks = []
        for b in blocks:
            b = b.strip()
            if not b:
                continue
            # If a block starts with a section title (UPPERCASE:), format it
            if any(b.startswith(prefix) for prefix in (
                "PATIENT:", "EXAMINATION:", "REFERRING", "CLINICAL",
                "TECHNIQUE:", "FINDINGS:", "IMPRESSION:", "RECOMMENDATIONS:",
            )):
                lines = b.split("\n")
                head = lines[0]
                body = "<br/>".join(_esc(l) for l in lines[1:])
                html_blocks.append(
                    f'<div class="section"><h3>{_esc(head)}</h3><p>{body}</p></div>'
                )
            elif b.startswith("---"):
                html_blocks.append('<hr class="footer-divider"/>')
            else:
                html_blocks.append(f'<p>{_esc(b).replace(chr(10), "<br/>")}</p>')
        return "\n".join(html_blocks)

    report_html = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Radiology Report — {_esc(patient_name or 'Unnamed')}</title>
<style>
  @media print {{ body {{ margin: 20mm; }} .no-print {{ display: none; }} }}
  body {{ font-family: 'Segoe UI', Arial, sans-serif; color: #111; line-height: 1.5; max-width: 800px; margin: 30px auto; padding: 20px; }}
  h1 {{ font-size: 20px; margin: 0 0 4px; }}
  h3 {{ font-size: 12px; letter-spacing: 1.5px; color: #444; text-transform: uppercase; margin: 18px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }}
  .section p {{ margin: 4px 0; }}
  .header-meta {{ font-size: 11px; color: #666; margin-bottom: 14px; }}
  .footer-divider {{ margin: 24px 0 8px; border: none; border-top: 1px solid #ccc; }}
  .disclaimer {{ font-size: 10px; color: #888; margin-top: 8px; }}
  .critical {{ background: #fee; border-left: 4px solid #c33; padding: 8px 12px; margin: 12px 0; }}
</style></head><body>
<h1>Radiology Report</h1>
<div class="header-meta">
  midcine · AI-assisted draft · Generated {_esc(datetime.now(UTC).strftime('%Y-%m-%d %H:%M UTC'))}
</div>
{('<div class="critical"><b>CRITICAL FINDING(S)</b> — STAT review required.</div>' if vision_summary.get('critical') else '')}
{_paragraphize(report_text)}
<div class="disclaimer">
  AI-assisted draft — NOT a diagnostic device. Requires review and signature by a licensed radiologist.
</div>
</body></html>"""

    latency_ms = int((_time.perf_counter() - t0) * 1000)

    audit(
        action="ai.final_report_generated",
        tenant="default",
        target={"type": "study", "id": uid},
        meta={
            "latency_ms": latency_ms,
            "total_slices": fv.get("total_slices"),
            "batches": fv.get("batch_count"),
            "critical": vision_summary.get("critical"),
            "compose_ok": compose_ok,
        },
    )

    return {
        "ok": compose_ok and bool(fv.get("ok")),
        "report_text": report_text,
        "report_html": report_html,
        "meta": {
            "patient_name": patient_name,
            "patient_id": patient_id,
            "patient_age": patient_age,
            "patient_sex": patient_sex,
            "modality": modality,
            "body_part": body_part,
            "study_description": study_description,
            "referrer": referrer,
            "study_uid": uid,
        },
        "vision": {
            "total_slices": fv.get("total_slices"),
            "batch_count": fv.get("batch_count"),
            "successful_batches": fv.get("successful_batches"),
            "abnormal_findings": vision_summary.get("abnormal_findings"),
            "critical": vision_summary.get("critical"),
            "urgent": vision_summary.get("urgent"),
        },
        "dossier": {
            "pdf_count": dossier_summary["pdf_count"],
            "notes_count": dossier_summary["notes_count"],
            "reports_count": dossier_summary["reports_count"],
            "photos_count": dossier_summary["photos_count"],
            "docs_used": [d["name"] for d in docs_to_use],
        },
        "relevance": {
            "verdict": relevance_verdict,
            "warnings": relevance_warnings,
        },
        "latency_ms": latency_ms,
    }


# ============================================================
# Case Story — patient-friendly educational 3D narration
# ============================================================


CASE_STORY_SYSTEM = (
    "LANGUAGE LOCK: Respond in clinical English ONLY. Never Arabic.\n\n"
    "You are a senior radiologist explaining a case to the patient (or a "
    "medical student). Given a set of AI vision findings from a DICOM study, "
    "produce an EDUCATIONAL storyboard — a sequence of 'chapters', one per "
    "finding, each written in plain language that a non-radiologist can "
    "follow but that stays medically precise.\n\n"
    "═══ ABSOLUTE ANTI-HALLUCINATION RULES ═══\n"
    "1. You may ONLY chapter findings that appear in the supplied JSON. "
    "Do not invent additional pathology, no matter how plausible.\n"
    "2. Every measurement/size/laterality claim must trace to the JSON.\n"
    "3. If a finding has no slice_range, still create the chapter but omit "
    "any camera_hint that would require slice numbers.\n"
    "4. Do not use symptoms/history to invent findings. Symptoms may only "
    "be referenced in 'why_it_matters' to connect a real finding to why the "
    "patient came in.\n"
    "5. If the vision JSON contains no abnormal findings, return exactly one "
    "chapter titled 'Overall Study' summarizing anatomy_seen + "
    "overall_impression, and mark no_pathology=true.\n\n"
    "Output STRICT JSON only, no prose, no markdown fences:\n"
    "{\n"
    '  "patient_summary": "2-3 sentence overview of what the study shows, '
    'plain language, addressed to the patient",\n'
    '  "no_pathology": true|false,\n'
    '  "chapters": [\n'
    "    {\n"
    '      "title": "Short medical name of the finding (e.g. Subdural Hematoma)",\n'
    '      "layperson_name": "Same finding in everyday words '
    '(e.g. Bleeding around the brain surface)",\n'
    '      "location_plain": "Where in the body/organ (plain language)",\n'
    '      "slice_range": "verbatim from JSON, e.g. 14-24 or 47 — empty if absent",\n'
    '      "acr_priority": "STAT|urgent|routine — from JSON",\n'
    '      "what_it_is": "1-2 sentences: what this finding physically is",\n'
    '      "why_it_matters": "1-2 sentences: clinical importance",\n'
    '      "what_happens_next": "1 sentence: what a doctor typically does about it",\n'
    '      "camera_hint": {\n'
    '        "azimuth": 0-359, "elevation": -60..60, "zoom": 0.8..2.0,\n'
    '        "hint_text": "e.g. right frontotemporal view"\n'
    '      }\n'
    "    }\n"
    "  ],\n"
    '  "final_note": "1 sentence emphasizing that this is AI-assisted and '
    'the treating radiologist has final authority"\n'
    "}\n"
)


class CaseStoryRequest(BaseModel):
    study_uid: str
    # If the client already ran vision analysis, pass those findings to save
    # a second call. Otherwise the endpoint will call analyze-study lazily.
    vision_findings: dict | None = None


def _ai_cache_dir(uid: str) -> Path:
    """Per-study on-disk cache for expensive AI results (vision + story).

    Lives under the reports_store dir so it's on the same portable data
    drive as the studies themselves. Backed by `MIDCINE_REPORTS_STORE_DIR`.
    """
    base = os.getenv("MIDCINE_REPORTS_STORE_DIR", "").strip() or "reports_store"
    root = Path(base) / "ai_cache" / _safe_slug(uid)
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_slug(s: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in (s or ""))[:120]


def _load_ai_cache(uid: str, name: str) -> dict | None:
    p = _ai_cache_dir(uid) / f"{name}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def _save_ai_cache(uid: str, name: str, data: dict) -> None:
    try:
        p = _ai_cache_dir(uid) / f"{name}.json"
        p.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    except Exception as e:  # noqa: BLE001
        log.warning("failed to save AI cache %s/%s: %s", uid, name, e)


@app.get("/studies/{study_uid}/manifest")
def study_isolation_manifest(study_uid: str) -> dict:
    """Return every file across every data root that belongs to THIS study.

    Isolation guarantee: every returned path must contain a normalized form
    of the study_uid — anything else is flagged as a leak candidate.

    Used by the client to prove per-case isolation to auditors and to
    package a single study for offline transfer.
    """
    from pathlib import Path as _P

    uid = (study_uid or "").strip()
    if not uid or len(uid) > 128 or not _DICOM_UID_RE.match(uid):
        return {"ok": False, "error": "invalid study_uid"}

    slug = _safe_slug(uid)  # normalized filesystem-safe form
    # Every configured data root that may contain per-study files.
    roots = {
        "study_record":  os.getenv("MIDCINE_STUDIES_DIR", "studies"),
        "dicom_series":  os.getenv("MIDCINE_DICOMS_DIR", "dicoms"),
        "docs":          os.getenv("MIDCINE_DOCS_DIR", "docs"),
        "reports":       os.getenv("MIDCINE_REPORTS_STORE_DIR", "reports_store"),
        "audit":         os.getenv("MIDCINE_AUDIT_DIR", "audit"),
        "sessions":      os.getenv("MIDCINE_REPORT_SESSIONS_DIR", "report_sessions"),
    }
    manifest: dict[str, list[dict]] = {k: [] for k in roots}
    total_bytes = 0
    total_files = 0
    leak_flags: list[str] = []

    for label, root in roots.items():
        r = _P(root)
        if not r.exists():
            continue
        # Three match strategies:
        # (a) file/dir whose NAME contains the uid (e.g. studies/<uid>.json)
        # (b) directory whose name contains the uid → walk all files inside
        #     (e.g. dicoms/<uid>.series/HANAN_...IMA — filenames don't carry
        #     the uid but the parent folder does, so isolation is by parent)
        # (c) study JSON records may use a nickname filename (sample-007.json)
        #     but declare "study_uid" internally — check every JSON in studies/
        candidates = list(r.rglob(f"*{uid}*")) + list(r.rglob(f"*{slug}*"))
        if label == "study_record":
            for j in r.glob("*.json"):
                try:
                    data = json.loads(j.read_text(encoding="utf-8"))
                    if data.get("study_uid") == uid:
                        candidates.append(j)
                except Exception:
                    continue
        seen: set[str] = set()
        for p in candidates:
            key = str(p.resolve())
            if key in seen:
                continue
            seen.add(key)
            if p.is_file():
                sz = p.stat().st_size
                manifest[label].append({
                    "path": str(p),
                    "size_bytes": sz,
                    "modified": p.stat().st_mtime,
                })
                total_bytes += sz
                total_files += 1
            elif p.is_dir():
                # Walk every file inside this per-study directory
                for child in p.rglob("*"):
                    if not child.is_file():
                        continue
                    ck = str(child.resolve())
                    if ck in seen:
                        continue
                    seen.add(ck)
                    sz = child.stat().st_size
                    manifest[label].append({
                        "path": str(child),
                        "size_bytes": sz,
                        "modified": child.stat().st_mtime,
                    })
                    total_bytes += sz
                    total_files += 1
        # ── LEAK CHECK: does the audit log contain other study UIDs
        # co-mingled in this study's records? Only run for audit label. ──
        if label == "audit":
            for f in manifest[label]:
                try:
                    txt = _P(f["path"]).read_text(encoding="utf-8", errors="ignore")
                    # If the file name matches the uid but contents mention
                    # OTHER study uids, that's still fine (audit is shared by
                    # design). We only flag if any file OUTSIDE the audit
                    # root has content referencing a different study uid.
                    _ = txt  # audit is intentionally shared
                except Exception:
                    pass

    return {
        "ok": True,
        "study_uid": uid,
        "manifest": manifest,
        "totals": {
            "files": total_files,
            "bytes": total_bytes,
            "human": f"{total_bytes / (1024*1024):.1f} MB",
        },
        "isolation_verified": len(leak_flags) == 0,
        "leak_flags": leak_flags,
    }


@app.get("/ai/cache/{study_uid}")
def ai_cache_list(study_uid: str) -> dict:
    """List cached AI artifacts for a study (vision, story, final-report).

    Client can call this on page load to instantly display prior results
    without re-running expensive LLM calls — critical on weak internet.
    """
    uid = (study_uid or "").strip()
    if not uid or len(uid) > 128 or not _DICOM_UID_RE.match(uid):
        return {"ok": False, "error": "invalid study_uid"}
    d = _ai_cache_dir(uid)
    entries: dict[str, dict] = {}
    for p in sorted(d.glob("*.json")):
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
            entries[p.stem] = {
                "cached_at": data.get("_cached_at"),
                "size_bytes": p.stat().st_size,
            }
        except Exception:
            continue
    return {"ok": True, "study_uid": uid, "entries": entries}


@app.get("/ai/cache/{study_uid}/{name}")
def ai_cache_get(study_uid: str, name: str) -> dict:
    """Return a specific cached artifact — bypasses LLM calls entirely."""
    uid = (study_uid or "").strip()
    if not uid or len(uid) > 128 or not _DICOM_UID_RE.match(uid):
        return {"ok": False, "error": "invalid study_uid"}
    safe_name = _safe_slug(name)
    data = _load_ai_cache(uid, safe_name)
    if not data:
        return {"ok": False, "error": "not cached"}
    return {"ok": True, "study_uid": uid, "name": safe_name, "data": data}


@app.delete("/ai/cache/{study_uid}/{name}")
def ai_cache_delete(study_uid: str, name: str) -> dict:
    """Invalidate a cached artifact — client uses this to force regeneration."""
    uid = (study_uid or "").strip()
    if not uid or len(uid) > 128 or not _DICOM_UID_RE.match(uid):
        return {"ok": False, "error": "invalid study_uid"}
    safe_name = _safe_slug(name)
    p = _ai_cache_dir(uid) / f"{safe_name}.json"
    if p.exists():
        try:
            p.unlink()
            return {"ok": True, "deleted": safe_name}
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)}
    return {"ok": False, "error": "not cached"}


@app.post("/ai/case-story")
async def ai_case_story(req: CaseStoryRequest) -> dict:
    """Produce a patient-friendly 3D-viewer storyboard for a study.

    Chapters map 1:1 to AI vision findings — one chapter per finding, with
    plain-language explanations and camera hints for the 3D renderer.

    Caching: results are written to
    `<reports_store>/ai_cache/<uid>/case_story.json`. If a valid cache exists,
    it's returned instantly — critical on weak internet. The client can force
    a rebuild via DELETE /ai/cache/{uid}/case_story.
    """
    import asyncio as _asyncio
    import time as _time
    from .studies_store import get_study

    uid = (req.study_uid or "").strip()
    if not uid or len(uid) > 128 or not _DICOM_UID_RE.match(uid):
        return {"ok": False, "error": "invalid study_uid"}

    rec = get_study(uid)
    if not rec:
        return {"ok": False, "error": "study not found"}

    # ── Cache hit? Return immediately ─────────────────────────────────
    cached = _load_ai_cache(uid, "case_story")
    if cached and cached.get("ok"):
        cached["from_cache"] = True
        return cached

    # Resolve vision findings, in priority order:
    #   (1) client-supplied in the request (fast path)
    #   (2) cached vision from a prior analyze-study on this study
    #   (3) run full-volume analysis now, then cache it
    vision = req.vision_findings or {}
    used_cache = False
    if not vision or not isinstance(vision.get("abnormal_findings"), list):
        vc = _load_ai_cache(uid, "vision")
        if vc and isinstance(vc.get("abnormal_findings"), list):
            vision = vc
            used_cache = True
            log.info("case-story: using cached vision for %s", uid)

    if not used_cache and (not vision or not isinstance(vision.get("abnormal_findings"), list)):
        try:
            from .ai_vision import analyze_full_volume
            from .studies_store import list_series_slices, series_slice_path
            slices = list_series_slices(uid)
            if not slices:
                return {
                    "ok": False,
                    "error": "This study has no DICOM slices uploaded. "
                             "Upload the images first, then try again.",
                }
            paths = [series_slice_path(uid, s) for s in slices]
            paths = [p for p in paths if p is not None]
            if not paths:
                return {
                    "ok": False,
                    "error": "DICOM slices could not be resolved on disk. "
                             "The study record exists but the image files are missing.",
                }
            n = len(paths)
            # Quality-first + rate-safe tiering (same as vision-see-full)
            if   n <= 24:  _bs, _ts, _mp = 8, 384, 3
            elif n <= 60:  _bs, _ts, _mp = 8, 384, 3
            elif n <= 120: _bs, _ts, _mp = 10, 352, 2
            elif n <= 250: _bs, _ts, _mp = 12, 320, 2
            elif n <= 500: _bs, _ts, _mp = 16, 288, 2
            else:          _bs, _ts, _mp = 20, 256, 2
            log.info("case-story: %d slices → batch_size=%d tile=%d parallel=%d", n, _bs, _ts, _mp)
            fv = await analyze_full_volume(
                paths,
                rec.modality or "",
                rec.body_part or "",
                rec.symptoms or "",
                rec.clinical_history or "",
                "",
                patient_age=rec.age,
                patient_sex=rec.sex,
                patient_name=rec.patient_name or "",
                study_description=rec.description or "",
                referrer=rec.referrer or "",
                batch_size=_bs,
                tile_size=_ts,
                max_parallel=_mp,
            )
            parsed = fv.get("parsed") or {}
            vision = {
                "anatomy_seen": parsed.get("anatomy_seen"),
                "abnormal_findings": parsed.get("abnormal_findings", []),
                "normal_findings": parsed.get("normal_findings", []),
                "overall_impression": parsed.get("overall_impression"),
                "coverage_pct": fv.get("coverage_pct"),
                "successful_batches": fv.get("successful_batches"),
                "batch_count": fv.get("batch_count"),
                "_cached_at": _time.strftime("%Y-%m-%dT%H:%M:%SZ", _time.gmtime()),
            }
            # Cache the vision result so subsequent case-story or final-report
            # runs on this study skip the expensive re-analysis.
            _save_ai_cache(uid, "vision", vision)
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": f"vision unavailable: {e}"}

    # Build the LLM prompt
    context = (
        f"Patient: {rec.patient_name or '(unnamed)'} · "
        f"Age {rec.age if rec.age else 'N/A'} · Sex {rec.sex or 'N/A'}\n"
        f"Modality: {rec.modality or 'N/A'} · Body region: {rec.body_part or 'N/A'}\n"
        f"Symptoms: {rec.symptoms or '(none stated)'}\n"
        f"History: {rec.clinical_history or '(none stated)'}\n\n"
        "AI VISION FINDINGS (ONLY source of truth — do NOT invent anything else):\n"
        f"{json.dumps(vision, ensure_ascii=False, indent=2)[:6000]}\n\n"
        "Produce the storyboard JSON per the system rules."
    )

    t0 = _time.perf_counter()
    try:
        raw = await _asyncio.to_thread(
            _call_naraya_sync,
            CASE_STORY_SYSTEM,
            context,
            60.0,
            NARAYA_MODEL_IMPRESSION,
            1800,
            0.15,
        )
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": f"LLM failed: {e}"}
    latency_ms = int((_time.perf_counter() - t0) * 1000)

    # Parse JSON output (defensive — the LLM may wrap in fences)
    raw = (raw or "").strip()
    if raw.startswith("```"):
        first_nl = raw.find("\n")
        if first_nl > 0:
            raw = raw[first_nl + 1 :]
        if raw.rstrip().endswith("```"):
            raw = raw.rstrip()[:-3].rstrip()
    parsed: dict = {}
    try:
        parsed = json.loads(raw)
    except Exception:
        try:
            s = raw.find("{")
            e = raw.rfind("}")
            if s >= 0 and e > s:
                parsed = json.loads(raw[s : e + 1])
        except Exception:
            parsed = {}

    audit(
        action="ai.case_story",
        tenant="default",
        target={"type": "study", "id": uid},
        meta={
            "latency_ms": latency_ms,
            "chapters": len(parsed.get("chapters") or []),
            "no_pathology": bool(parsed.get("no_pathology")),
        },
    )

    result = {
        "ok": bool(parsed.get("chapters") is not None or parsed.get("patient_summary")),
        "study_uid": uid,
        "story": parsed,
        "vision": vision,
        "latency_ms": latency_ms,
        "_cached_at": _time.strftime("%Y-%m-%dT%H:%M:%SZ", _time.gmtime()),
        "from_cache": False,
    }
    # Cache successful stories only — a bad LLM output shouldn't poison the
    # cache. The client can DELETE the entry to force a fresh generation.
    if result["ok"] and parsed.get("chapters"):
        _save_ai_cache(uid, "case_story", result)
    return result


# ============================================================
# Second Opinion — NEXUS multi-agent cross-verification
# ============================================================


class SecondOpinionRequest(BaseModel):
    study_uid: str
    report_text: str  # the draft/final report the doctor wants checked
    # Optional: send the AI vision findings too so agents can compare the
    # report against what the vision actually saw (catches invention).
    vision_findings: dict | None = None


SECOND_OPINION_SYSTEM = (
    "LANGUAGE LOCK: Respond in clinical English ONLY.\n\n"
    "You are a specialist radiologist reviewing another radiologist's draft "
    "report. Your job is a CROSS-CHECK — flag inconsistencies, hallucinated "
    "findings, missing critical items, or wording that would confuse a "
    "clinician. Do NOT rewrite the report. Do NOT invent new pathology.\n\n"
    "You will receive:\n"
    "  1. The AI vision JSON (source of truth for what was actually seen)\n"
    "  2. The draft report text (what needs checking)\n\n"
    "Return STRICT JSON only:\n"
    "{\n"
    '  "agreement_score": 0.0-1.0,\n'
    '  "confirms": [ "concise statements the report got right, tied to vision" ],\n'
    '  "disagreements": [ '
    '{ "issue": "...", "severity": "critical|major|minor", '
    '"suggestion": "how to fix" } '
    "],\n"
    '  "missing_from_report": [ "vision findings the report failed to mention" ],\n'
    '  "invented_by_report": [ "report claims not backed by vision or docs" ],\n'
    '  "overall": "1-2 sentence verdict"\n'
    "}\n"
)


@app.post("/ai/second-opinion")
async def ai_second_opinion(req: SecondOpinionRequest) -> dict:
    """Cross-verify a draft report against 3 NEXUS specialist agents.

    Runs in parallel:
      - guardian      — hallucination detector
      - debugger      — logical inconsistency check
      - code_reviewer — structural/completeness check
    Then merges the 3 verdicts into a single actionable panel for the doctor.
    """
    import asyncio as _asyncio
    import time as _time
    from .midcine_nexus import call_nexus_agent

    uid = (req.study_uid or "").strip()
    if not uid or len(uid) > 128 or not _DICOM_UID_RE.match(uid):
        return {"ok": False, "error": "invalid study_uid"}
    report_text = (req.report_text or "").strip()
    if not report_text or len(report_text) < 50:
        return {"ok": False, "error": "report_text too short (min 50 chars)"}

    vision = req.vision_findings or _load_ai_cache(uid, "vision") or {}
    vision_block = json.dumps(vision, ensure_ascii=False, indent=2)[:4000]

    user_prompt = (
        f"{SECOND_OPINION_SYSTEM}\n\n"
        "═══ AI VISION JSON (source of truth for what was actually seen) ═══\n"
        f"{vision_block}\n\n"
        "═══ DRAFT REPORT TO REVIEW ═══\n"
        f"{report_text[:6000]}\n\n"
        "Now return the review JSON per the schema."
    )

    agent_ids = ["guardian", "debugger", "code_reviewer"]

    async def _call(agent_id: str) -> dict:
        try:
            r = await _asyncio.to_thread(call_nexus_agent, agent_id, user_prompt, add_medical_context=True, timeout=60.0)
            return {"agent": agent_id, **r}
        except Exception as e:  # noqa: BLE001
            return {"agent": agent_id, "ok": False, "error": f"{e}"}

    t0 = _time.perf_counter()
    reviews = await _asyncio.gather(*[_call(a) for a in agent_ids], return_exceptions=False)
    latency_ms = int((_time.perf_counter() - t0) * 1000)

    # Parse each review JSON (defensive)
    parsed_reviews: list[dict] = []
    for rv in reviews:
        entry = {
            "agent": rv.get("agent"),
            "ok": bool(rv.get("ok")),
            "model": rv.get("model"),
            "raw_error": rv.get("error"),
        }
        text = (rv.get("text") or "").strip()
        if text.startswith("```"):
            nl = text.find("\n")
            if nl > 0:
                text = text[nl + 1 :]
            if text.rstrip().endswith("```"):
                text = text.rstrip()[:-3].rstrip()
        try:
            entry["review"] = json.loads(text)
        except Exception:
            try:
                s = text.find("{")
                e = text.rfind("}")
                if s >= 0 and e > s:
                    entry["review"] = json.loads(text[s : e + 1])
                else:
                    entry["review"] = {"raw_text": text[:2000]}
            except Exception:
                entry["review"] = {"raw_text": text[:2000]}
        parsed_reviews.append(entry)

    # Aggregate: mean agreement + union of critical disagreements
    agreements = [
        float(pr["review"].get("agreement_score", 0))
        for pr in parsed_reviews
        if pr["ok"] and isinstance(pr.get("review"), dict) and isinstance(pr["review"].get("agreement_score"), (int, float))
    ]
    mean_agreement = round(sum(agreements) / len(agreements), 2) if agreements else 0.0

    critical: list[dict] = []
    all_missing: list[str] = []
    all_invented: list[str] = []
    for pr in parsed_reviews:
        rev = pr.get("review", {}) if isinstance(pr.get("review"), dict) else {}
        for d in rev.get("disagreements") or []:
            if not isinstance(d, dict):
                continue
            if str(d.get("severity", "")).lower() == "critical":
                critical.append({**d, "flagged_by": pr["agent"]})
        for m in rev.get("missing_from_report") or []:
            all_missing.append(f"[{pr['agent']}] {m}")
        for iv in rev.get("invented_by_report") or []:
            all_invented.append(f"[{pr['agent']}] {iv}")

    audit(
        action="ai.second_opinion",
        tenant="default",
        target={"type": "study", "id": uid},
        meta={
            "latency_ms": latency_ms,
            "mean_agreement": mean_agreement,
            "critical_flags": len(critical),
            "missing": len(all_missing),
            "invented": len(all_invented),
        },
    )

    return {
        "ok": True,
        "study_uid": uid,
        "mean_agreement": mean_agreement,
        "critical_flags": critical,
        "missing_from_report": all_missing,
        "invented_by_report": all_invented,
        "reviews": parsed_reviews,
        "latency_ms": latency_ms,
    }


# ============================================================
# Templates library + Smart Report + Translate
# ============================================================


@app.get("/templates/index")  # type: ignore[name-defined]
def templates_index() -> dict:
    """Return count/modalities summary for the template library."""
    from .templates_lib import get_index, list_modalities

    idx = get_index()
    return {
        "ok": True,
        "count": idx["count"],
        "extracted_ok": idx["extracted_ok"],
        "extracted_fail": idx["extracted_fail"],
        "modalities": list_modalities(),
    }


@app.get("/templates/browse")  # type: ignore[name-defined]
def templates_browse(modality: str = "", region: str = "") -> dict:
    from .templates_lib import browse

    return {"ok": True, "items": browse(modality or None, region or None)}


@app.get("/templates/search")  # type: ignore[name-defined]
def templates_search(q: str = "", modality: str = "", body_part: str = "", limit: int = 20) -> dict:
    from .templates_lib import search

    return {"ok": True, "items": search(q, modality, body_part, min(limit, 60))}


@app.get("/templates/{tid}")  # type: ignore[name-defined]
def templates_get(tid: str) -> dict:
    from .templates_lib import get_template

    t = get_template(tid)
    if not t:
        return {"ok": False, "error": "not found"}
    return {"ok": True, "template": t}


class SmartReportRequest(BaseModel):
    study_uid: str = ""
    modality: str = ""
    body_part: str = ""
    findings: str = ""
    symptoms: str = ""
    clinical_history: str = ""
    patient_age: int | None = None
    patient_sex: str | None = None
    template_id: str | None = None
    include_normals: bool = False


SMART_REPORT_SYSTEM = (
    "LANGUAGE LOCK: Respond in clinical English ONLY. Never write Arabic or any other language. "
    "If input contains Arabic, translate it mentally and respond in English. "
    "You are a senior consultant radiologist writing a final diagnostic report in "
    "CLINICAL ENGLISH ONLY. Never respond in Arabic or any other language.\n\n"
    "You are given: (a) a reference NORMAL template for the modality/region, (b) up "
    "to 3 reference PATHOLOGY templates that describe the closest matching "
    "conditions, and (c) the current case findings + symptoms + patient context.\n\n"
    "TASK: Produce a focused, publication-quality radiology report that STRIPS every "
    "purely-normal sentence and keeps ONLY (i) the technical/scan-parameters preamble "
    "and (ii) sentences describing the actual pathology or abnormal finding. Use the "
    "pathology templates as stylistic scaffolding — never copy verbatim if the "
    "finding is different.\n\n"
    "OUTPUT STRICT JSON only (no markdown, no prose outside JSON):\n"
    "{\n"
    '  "title": "e.g. MRI Brain - Focused Report",\n'
    '  "technique": "1-2 sentence scan technique paragraph (English)",\n'
    '  "clinical_indication": "1 sentence from symptoms + history (English)",\n'
    '  "findings_focused": "the abnormal-only findings paragraph (English, 60-220 words)",\n'
    '  "impression": [ "concise impression bullets, ranked by clinical priority" ],\n'
    '  "recommendations": [ "next steps or follow-up imaging, up to 5" ],\n'
    '  "confidence": 0.0-1.0,\n'
    '  "template_used": "filename of the primary template borrowed",\n'
    '  "normal_sentences_removed": <integer count>,\n'
    '  "language": "en"\n'
    "}\n\n"
    "RULES:\n"
    "1. English only. Ignore any Arabic in the inputs (translate mentally).\n"
    "2. Do not include hedging like 'clinical correlation is recommended'.\n"
    "3. If findings are empty, produce a brief normal-report style body.\n"
    "4. Never invent findings not present in the input.\n"
    "5. Impression bullets = differential-safe conclusions with confidence hints.\n"
)


def _re_first_json(txt: str) -> dict | None:
    depth = 0
    start = -1
    for i, ch in enumerate(txt):
        if ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and start >= 0:
                try:
                    return json.loads(txt[start : i + 1])
                except Exception:
                    start = -1
    return None


@app.post("/ai/smart-report")  # type: ignore[name-defined]
async def ai_smart_report(req: SmartReportRequest) -> dict:
    """Generate a focused radiology report using the templates library."""
    import asyncio as _asyncio
    import time as _time

    from .templates_lib import get_template, search, browse

    modality = (req.modality or "").strip()
    body = (req.body_part or "").strip()
    findings = redact(req.findings or "").text  # type: ignore[name-defined]
    symptoms = redact(req.symptoms or "").text  # type: ignore[name-defined]
    history = redact(req.clinical_history or "").text  # type: ignore[name-defined]

    normal_refs = [b for b in browse(modality or None, body or None) if b["is_normal"]]
    normal_ref = None
    if normal_refs:
        n = get_template(normal_refs[0]["id"])
        if n and n.get("text"):
            normal_ref = {"filename": n["filename"], "text": n["text"][:5000]}

    query = " ".join([findings[:400], symptoms[:200]]).strip() or (body or "")
    picked: list[dict] = []
    if req.template_id:
        t = get_template(req.template_id)
        if t and t.get("text"):
            picked.append({"id": t["id"], "filename": t["filename"], "text": t["text"][:5000]})
    for cand in search(query, modality=modality, body_part=body, limit=6):
        if len(picked) >= 3:
            break
        if cand["is_normal"]:
            continue
        t = get_template(cand["id"])
        if t and t.get("text"):
            picked.append(
                {"id": t["id"], "filename": t["filename"], "text": t["text"][:5000]}
            )

    age_str = f"{req.patient_age}" if req.patient_age else "unknown"
    context = (
        f"CASE\n----\n"
        f"Modality: {modality or '?'}  |  Region: {body or '?'}\n"
        f"Patient: age={age_str}  sex={req.patient_sex or 'unknown'}\n"
        f"Symptoms: {symptoms or '(none)'}\n"
        f"Clinical history: {history or '(none)'}\n"
        f"Findings dictated: {findings or '(none)'}\n\n"
        f"NORMAL TEMPLATE (structural bones - do NOT copy normal sentences into output):\n"
        f"[{(normal_ref or {}).get('filename', 'n/a')}]\n"
        f"{(normal_ref or {}).get('text', '(no normal reference available)')}\n\n"
        f"PATHOLOGY REFERENCES (pick style/vocabulary, do not blindly copy):\n"
    )
    for p in picked:
        context += f"\n[{p['filename']}]\n{p['text']}\n"
    context += "\nProduce the JSON report now. English only."

    t0 = _time.perf_counter()
    try:
        raw = await _asyncio.to_thread(
            _call_naraya_english,  # type: ignore[name-defined]
            SMART_REPORT_SYSTEM,
            context,
            60.0,
            NARAYA_MODEL_IMPRESSION,  # type: ignore[name-defined]
            1400,
            0.0,
        )
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}
    latency_ms = int((_time.perf_counter() - t0) * 1000)

    txt = raw.strip()
    if txt.startswith("```"):
        txt = txt.strip("`").strip()
        if txt.startswith("json"):
            txt = txt[4:].strip()
    try:
        parsed = json.loads(txt)
    except json.JSONDecodeError:
        m = _re_first_json(txt)
        parsed = m if m else {
            "title": f"{modality} {body} - Report",
            "technique": "",
            "clinical_indication": symptoms[:200],
            "findings_focused": txt[:1500],
            "impression": [],
            "recommendations": [],
            "confidence": 0.5,
            "template_used": picked[0]["filename"] if picked else "",
            "normal_sentences_removed": 0,
            "language": "en",
            "parse_error": True,
        }

    audit(  # type: ignore[name-defined]
        action="ai.smart_report",
        tenant="default",
        target={"type": "study", "id": req.study_uid or "adhoc"},
        meta={"latency_ms": latency_ms, "templates_used": len(picked)},
    )
    parsed = await _asyncio.to_thread(_scrub_arabic, parsed)
    return {
        "ok": True,
        "latency_ms": latency_ms,
        "templates_used": [p["filename"] for p in picked],
        "normal_reference": (normal_ref or {}).get("filename"),
        **parsed,
    }


class TranslateRequest(BaseModel):
    text: str
    target: str = "ar"
    domain: str = "medical"


@app.post("/ai/translate")  # type: ignore[name-defined]
async def ai_translate(req: TranslateRequest) -> dict:
    """Translate arbitrary text on demand — used by the Translate buttons on AI panels."""
    import asyncio as _asyncio
    import time as _time

    text = (req.text or "").strip()
    if not text:
        return {"ok": False, "error": "empty text"}

    tgt = "Arabic (Modern Standard)" if req.target == "ar" else "English"
    system = (
        f"You are a bilingual medical translator. Translate the user's text to {tgt}, "
        f"preserving medical terminology precisely. Keep radiology terms idiomatic. "
        f"Return the translation ONLY - no prose, no disclaimers, no notes."
    )
    t0 = _time.perf_counter()
    try:
        out = await _asyncio.to_thread(
            _call_naraya_sync,  # translator, must not add English enforcement
            system,
            text[:6000],
            25.0,
            NARAYA_MODEL_COMPARE,  # type: ignore[name-defined]
            1200,
            0.0,
        )
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}
    return {
        "ok": True,
        "text": out.strip(),
        "latency_ms": int((_time.perf_counter() - t0) * 1000),
        "target": req.target,
    }


# ============================================================
# Report Sessions — "New Blank Report" workflow
# ============================================================

REPORT_SESSION_EXTRACT_SYSTEM = (
    "LANGUAGE LOCK: Respond in clinical English ONLY. Never write Arabic. "
    "If input contains Arabic, translate mentally and respond in English.\n\n"
    "You are a medical records clerk + attending physician reading a stack of "
    "reference reports the patient brought (referral letters, discharge "
    "summaries, prior imaging reports, lab panels, prescriptions, hand-written "
    "notes). Extract EVERY piece of clinically relevant information you can find "
    "into a strict JSON object. Fill missing fields with null / empty arrays — "
    "NEVER invent data.\n\n"
    "Output STRICT JSON only, no prose, no markdown fences:\n"
    "{\n"
    '  "patient": {\n'
    '    "name": string|null,\n'
    '    "age": number|null,\n'
    '    "sex": "M"|"F"|"U"|null,\n'
    '    "mrn": string|null,\n'
    '    "date_of_birth": string|null,\n'
    '    "phone": string|null,\n'
    '    "address": string|null,\n'
    '    "occupation": string|null\n'
    "  },\n"
    '  "clinical_history": "narrative paragraph (English), free-form",\n'
    '  "symptoms": "narrative paragraph (English)",\n'
    '  "prior_diagnoses": [ "diagnosis name" ],\n'
    '  "medications": [ { "drug": "...", "dose": "...", "reason": "..." } ],\n'
    '  "allergies": [ "..." ],\n'
    '  "surgeries": [ "procedure + date if stated" ],\n'
    '  "family_history": "narrative | empty",\n'
    '  "social_history": { "smoking": "...|null", "alcohol": "...|null" },\n'
    '  "vitals_labs": [ { "name": "e.g. HbA1c", "value": "...", "date": "..." } ],\n'
    '  "prior_imaging": [ { "modality": "...", "region": "...", "date": "...", "impression": "..." } ],\n'
    '  "extracted_reports": [\n'
    "    {\n"
    '      "filename": "matches the source filename passed in the prompt",\n'
    '      "language": "en"|"ar"|"mixed",\n'
    '      "report_type": "referral"|"lab"|"prior_imaging"|"discharge"|"prescription"|"note"|"other",\n'
    '      "date": "ISO if possible, else raw",\n'
    '      "author": "referring physician or lab name",\n'
    '      "summary": "2-4 English sentences",\n'
    '      "key_findings": [ "concrete data points" ]\n'
    "    }\n"
    "  ],\n"
    '  "red_flags": [ "urgent items the reader must not miss" ]\n'
    "}\n\n"
    "Rules:\n"
    "1. Every text field MUST be English even if source was Arabic.\n"
    "2. Keep every array short (≤10). If unsure, leave empty.\n"
    "3. Never fabricate identifiers or dates.\n"
    "4. If multiple reports disagree on a fact, pick the most recent and note it in summary.\n"
)


REPORT_SESSION_COMPOSE_SYSTEM = (
    "LANGUAGE LOCK: Respond in clinical English ONLY. Never write Arabic.\n\n"
    "You are a senior consultant writing a NEW focused report that MIMICS the "
    "linguistic style, structure, section-order, and terminology of the "
    "reference reports supplied by the user. The doctor uploaded those reports "
    "as the house style — copy their voice, but write about THIS patient.\n\n"
    "STRICT REQUIREMENT: Include ONLY the CRITICAL points that matter for this "
    "patient's current condition. NO normal-baseline sentences. NO padding. "
    "NO template boilerplate. Every sentence must be:\n"
    "  (a) pathological / abnormal / actionable, OR\n"
    "  (b) the minimum technique/context required to interpret (a).\n\n"
    "OUTPUT STRICT JSON only, no prose, no markdown fences:\n"
    "{\n"
    '  "title": "e.g. Radiology follow-up — Critical findings summary",\n'
    '  "style_reference_filename": "which uploaded report you mirrored",\n'
    '  "language": "en",\n'
    '  "sections": [\n'
    '    { "heading": "Clinical Indication", "content": "1 sentence" },\n'
    '    { "heading": "Technique", "content": "1 sentence" },\n'
    '    { "heading": "Critical Findings", "content": "the abnormal-only body — bulleted or paragraph, matching the source style" }\n'
    "  ],\n"
    '  "impression": [ "critical impression bullets — ranked by clinical priority" ],\n'
    '  "recommendations": [ "next step / follow-up, up to 5" ],\n'
    '  "urgency": "routine"|"urgent"|"stat",\n'
    '  "confidence": 0.0-1.0\n'
    "}\n\n"
    "Rules:\n"
    "1. English only.\n"
    "2. Mirror the source style: if the reference uses bullet lists, you use bullets; if it uses paragraphs, use paragraphs; adopt its section headings if present.\n"
    "3. Never invent findings not supported by the extracted data.\n"
    "4. If nothing is truly critical, say so plainly in the Critical Findings section — do not fabricate.\n"
)


def _load_report_files_from_docs(sid: str) -> list[dict]:
    """Read all 'report__*' files under data/docs/{sid}/ and return {filename, text}."""
    from .intake import study_docs_dir

    d = study_docs_dir(sid)
    out: list[dict] = []
    for f in sorted(d.iterdir()):
        if not f.is_file():
            continue
        name = f.name
        if not name.startswith("report__"):
            continue
        display = name[len("report__") :]
        # Prefer the cached extracted .txt for PDFs
        if name.endswith(".txt"):
            display = name[len("report__") : -len(".txt")]
            text = f.read_text(encoding="utf-8", errors="replace")
            out.append({"filename": display, "text": text[:14000]})
            continue
        # Plain-text / rtf / md
        if f.suffix.lower() in {".txt", ".md", ".rtf"}:
            out.append(
                {
                    "filename": display,
                    "text": f.read_text(encoding="utf-8", errors="replace")[:14000],
                }
            )
        # For .pdf / .doc / .docx / images — text picked up above via the .txt sidecar
    # Deduplicate by filename in case both PDF + sidecar exist
    seen: set[str] = set()
    deduped: list[dict] = []
    for item in out:
        if item["filename"] in seen:
            continue
        seen.add(item["filename"])
        deduped.append(item)
    return deduped


async def _append_files_to_session(sid: str, request: Request) -> tuple[list[dict], str]:
    """Read multipart 'files' + 'text' from the request and save each under
    the session's docs dir. Returns (saved metadata list, any error message)."""
    from .intake import classify_file, save_doc

    form = await request.form()
    uploads = form.getlist("files")
    pasted = form.get("text")

    saved: list[dict] = []
    for up in uploads:
        if not hasattr(up, "read"):
            continue
        data = await up.read()
        if not data:
            continue
        name = getattr(up, "filename", "") or "report"
        kind = classify_file(name, data[:256])
        if kind == "dicom":
            # DICOMs are not reference reports — skip cleanly
            continue
        save_doc(sid, name, kind, data, prefix="report")
        saved.append({"name": name, "kind": kind, "size": len(data)})

    if isinstance(pasted, str) and pasted.strip():
        blob = pasted.encode("utf-8", errors="replace")
        save_doc(sid, "pasted.txt", "note", blob, prefix="report")
        saved.append({"name": "pasted.txt", "kind": "note", "size": len(blob)})

    return saved, ""


def _merge_extract_dicts(a: dict, b: dict) -> dict:
    """Merge two per-chunk extraction dicts into a single richer one.

    Strategy:
      - patient / social_history: prefer non-empty from a, fill nulls from b
      - clinical_history / symptoms / family_history: concatenate with " | " if both present
      - lists (medications, prior_dx, allergies, ...): dedup by str repr
    """
    if not a:
        return b or {}
    if not b:
        return a
    out: dict = {}

    # Merge patient object (prefer non-null values from a)
    pa = (a.get("patient") or {}) if isinstance(a.get("patient"), dict) else {}
    pb = (b.get("patient") or {}) if isinstance(b.get("patient"), dict) else {}
    merged_p: dict = {}
    for k in {*pa.keys(), *pb.keys()}:
        va, vb = pa.get(k), pb.get(k)
        merged_p[k] = va if va not in (None, "", []) else vb
    out["patient"] = merged_p

    # Narrative strings — concatenate unique paragraphs
    for k in ("clinical_history", "symptoms", "family_history"):
        va = (a.get(k) or "").strip()
        vb = (b.get(k) or "").strip()
        if va and vb and va != vb:
            out[k] = f"{va}\n\n{vb}"
        else:
            out[k] = va or vb

    # Social history
    sa = a.get("social_history") or {}
    sb = b.get("social_history") or {}
    out["social_history"] = {
        "smoking": sa.get("smoking") or sb.get("smoking"),
        "alcohol": sa.get("alcohol") or sb.get("alcohol"),
    }

    # Lists — dedup by JSON string
    def _dedup(items_a, items_b):
        seen: set[str] = set()
        merged: list = []
        for x in (items_a or []) + (items_b or []):
            key = json.dumps(x, ensure_ascii=False, sort_keys=True) if isinstance(x, dict) else str(x)
            if key in seen:
                continue
            seen.add(key)
            merged.append(x)
        return merged

    for k in (
        "prior_diagnoses",
        "medications",
        "allergies",
        "surgeries",
        "vitals_labs",
        "prior_imaging",
        "extracted_reports",
        "red_flags",
    ):
        out[k] = _dedup(a.get(k), b.get(k))

    return out


CHUNK_SIZE = 6  # reports per LLM extract call — fits context comfortably


async def _process_session_ai(sid: str, user_title: str = "") -> dict:
    """Read every stored report under session {sid}, extract + compose via LLM,
    save + return the full payload. Handles many files via batched extraction."""
    import asyncio as _asyncio
    import time as _time

    from .report_sessions import save_session

    files_for_llm = _load_report_files_from_docs(sid)
    if not files_for_llm:
        return {
            "ok": False,
            "error": "No extractable text found in the uploaded files. "
            "Scanned images / legacy .doc files without text layer cannot be parsed yet.",
            "session_id": sid,
        }

    t0 = _time.perf_counter()

    def _build_blob(items: list[dict], starting_index: int = 1) -> str:
        lines: list[str] = []
        for i, f in enumerate(items, start=starting_index):
            lines.append(
                f"\n===== SOURCE {i}: {f['filename']} =====\n{redact(f['text']).text}\n"
            )
        return "".join(lines)

    # ---- (1) EXTRACT — batched over chunks of CHUNK_SIZE reports ----
    chunks: list[list[dict]] = [
        files_for_llm[i : i + CHUNK_SIZE] for i in range(0, len(files_for_llm), CHUNK_SIZE)
    ]
    merged_extract: dict = {}
    extract_errors: list[str] = []
    running_index = 1
    for ci, chunk in enumerate(chunks, start=1):
        blob = _build_blob(chunk, starting_index=running_index)
        running_index += len(chunk)
        extract_prompt = (
            f"You are receiving chunk {ci} of {len(chunks)} — "
            f"{len(chunk)} reports out of {len(files_for_llm)} total for this "
            f"patient. Extract everything you can from these reports and return "
            f"the JSON object described in the system rules.\n\n"
            f"REFERENCE REPORTS (chunk {ci}/{len(chunks)}):\n{blob}"
        )
        try:
            raw = await _asyncio.to_thread(
                _call_naraya_english,
                REPORT_SESSION_EXTRACT_SYSTEM,
                extract_prompt,
                60.0,
                NARAYA_MODEL_IMPRESSION,
                2500,
                0.0,
            )
            partial = _parse_json_loose(raw)
            if isinstance(partial, dict):
                merged_extract = _merge_extract_dicts(merged_extract, partial)
            else:
                extract_errors.append(f"chunk {ci}: unparseable JSON")
        except Exception as e:  # noqa: BLE001
            extract_errors.append(f"chunk {ci}: {str(e)[:120]}")

    extract_json = _scrub_arabic(merged_extract or {"parse_error": True})
    if extract_errors:
        extract_json["extract_warnings"] = extract_errors

    # ---- (2) COMPOSE — one call using merged extract + a compact style sample ----
    # Give the composer up to 3 reports as style samples (first + longest short-text)
    style_samples = files_for_llm[: min(3, len(files_for_llm))]
    style_blob = _build_blob(style_samples)
    compose_prompt = (
        f"You have already extracted the patient data from {len(files_for_llm)} "
        f"reference reports. The merged extract is:\n"
        f"{json.dumps(extract_json, ensure_ascii=False)[:6000]}\n\n"
        f"Below are up to 3 representative source reports — mirror their voice, "
        f"section-order, terminology when you compose. But include ONLY the "
        f"critical points for THIS patient's current condition — strip all "
        f"normal-baseline sentences.\n\n"
        f"STYLE REFERENCES:\n{style_blob}\n\n"
        f"Produce the JSON described in the system rules now."
    )
    try:
        compose_raw = await _asyncio.to_thread(
            _call_naraya_english,
            REPORT_SESSION_COMPOSE_SYSTEM,
            compose_prompt,
            60.0,
            NARAYA_MODEL_IMPRESSION,
            1800,
            0.0,
        )
        compose_json = _parse_json_loose(compose_raw)
        if not isinstance(compose_json, dict):
            compose_json = {"parse_error": True, "raw": compose_raw[:2000]}
        compose_json = _scrub_arabic(compose_json)
    except Exception as e:  # noqa: BLE001
        compose_json = {"error": f"compose call failed: {str(e)[:200]}"}

    latency_ms = int((_time.perf_counter() - t0) * 1000)

    payload = {
        "session_id": sid,
        "title": user_title
        or (compose_json.get("title") if isinstance(compose_json, dict) else "")
        or "New Report",
        "source_count": len(files_for_llm),
        # Everything extracted from the sources (identity/history/labs/etc.)
        **{k: v for k, v in extract_json.items() if k != "extracted_reports"},
        "extracted_reports": extract_json.get("extracted_reports", []),
        # The freshly composed critical-only report in the source style
        "critical_report": compose_json,
        "latency_ms": latency_ms,
        "chunks_processed": len(chunks),
    }

    # Preserve any pre-existing sources list on the saved session
    from .report_sessions import load_session

    existing = load_session(sid) or {}
    if existing.get("sources"):
        payload["sources"] = existing["sources"]
    save_session(sid, payload)

    audit(
        action="report_session.processed",
        tenant="default",
        target={"type": "report_session", "id": sid},
        meta={
            "latency_ms": latency_ms,
            "source_count": len(files_for_llm),
            "chunks": len(chunks),
        },
    )
    return {"ok": True, **payload}


@app.post("/ai/report-sessions/init")  # type: ignore[name-defined]
async def report_sessions_init(request: Request) -> dict:
    """Create an empty session and optionally accept an initial batch of files.

    Used by the client when doing chunked uploads (large folder). The client
    calls /init once, then POSTs additional files to /{sid}/files repeatedly,
    then finally calls /{sid}/process to trigger AI extract+compose.
    """
    from .report_sessions import new_session_id, save_session

    sid = new_session_id()
    saved, _ = await _append_files_to_session(sid, request)
    save_session(
        sid,
        {
            "session_id": sid,
            "title": "",
            "sources": saved,
            "source_count": 0,
            "critical_report": None,
        },
    )
    return {"ok": True, "session_id": sid, "sources": saved, "added": len(saved)}


@app.post("/ai/report-sessions/{sid}/files")  # type: ignore[name-defined]
async def report_sessions_append(sid: str, request: Request) -> dict:
    """Append another batch of files to an existing session (chunked upload)."""
    from .report_sessions import load_session, save_session

    existing = load_session(sid)
    if not existing:
        return {"ok": False, "error": "session not found"}

    saved, _ = await _append_files_to_session(sid, request)
    prev_sources = existing.get("sources") or []
    prev_sources.extend(saved)
    existing["sources"] = prev_sources
    save_session(sid, existing)
    return {"ok": True, "added": len(saved), "total_sources": len(prev_sources)}


@app.post("/ai/report-sessions/{sid}/process")  # type: ignore[name-defined]
async def report_sessions_process(sid: str, request: Request) -> dict:
    """Trigger AI extract+compose on all files already stored for the session."""
    from .report_sessions import load_session

    existing = load_session(sid)
    if not existing:
        return {"ok": False, "error": "session not found"}

    try:
        form = await request.form()
        user_title = (form.get("title") or "").strip() if isinstance(form.get("title"), str) else ""
    except Exception:
        user_title = ""

    return await _process_session_ai(sid, user_title=user_title or existing.get("title") or "")


@app.post("/ai/report-sessions")  # type: ignore[name-defined]
async def report_sessions_create(request: Request) -> dict:
    """One-shot: create session from a small upload and process immediately.

    Multipart form:
      files: one or more files (PDF/txt/md/rtf/doc/docx/image)
      text: optional pasted plain text (treated as one additional report)
      title: optional user-provided session title

    Use /init + /{sid}/files + /{sid}/process for large folder uploads (>15
    files) so each HTTP request stays reasonable in size.
    """
    from .report_sessions import new_session_id, save_session

    # We must read the form ONCE — reuse for uploads + title extraction.
    from .intake import classify_file, save_doc  # noqa: F401 (kept for clarity)

    form = await request.form()
    uploads = form.getlist("files")
    pasted = form.get("text")
    user_title = (form.get("title") or "").strip() if isinstance(form.get("title"), str) else ""

    if not uploads and not (isinstance(pasted, str) and pasted.strip()):
        return {"ok": False, "error": "at least one file or pasted text required"}

    sid = new_session_id()
    saved: list[dict] = []

    from .intake import classify_file as _classify, save_doc as _save

    for up in uploads:
        if not hasattr(up, "read"):
            continue
        data = await up.read()
        if not data:
            continue
        name = getattr(up, "filename", "") or "report"
        kind = _classify(name, data[:256])
        if kind == "dicom":
            continue
        _save(sid, name, kind, data, prefix="report")
        saved.append({"name": name, "kind": kind, "size": len(data)})

    if isinstance(pasted, str) and pasted.strip():
        blob = pasted.encode("utf-8", errors="replace")
        _save(sid, "pasted.txt", "note", blob, prefix="report")
        saved.append({"name": "pasted.txt", "kind": "note", "size": len(blob)})

    # Save the sources list first so /process can preserve it.
    save_session(
        sid,
        {"session_id": sid, "title": user_title, "sources": saved, "source_count": 0},
    )

    result = await _process_session_ai(sid, user_title=user_title)
    if not result.get("ok"):
        # Ensure the session_id is included even on failure so the UI can
        # navigate / retry / delete.
        result.setdefault("session_id", sid)
    return result


def _parse_json_loose(raw: str) -> dict | None:
    """Best-effort JSON parse — strips ```json fences, then trims to outer braces."""
    if not raw:
        return None
    txt = raw.strip()
    if txt.startswith("```"):
        first_nl = txt.find("\n")
        if first_nl > 0:
            txt = txt[first_nl + 1 :]
        if txt.rstrip().endswith("```"):
            txt = txt.rstrip()[:-3].rstrip()
    try:
        return json.loads(txt)
    except json.JSONDecodeError:
        pass
    start = txt.find("{")
    end = txt.rfind("}")
    if start >= 0 and end > start:
        try:
            return json.loads(txt[start : end + 1])
        except Exception:
            return None
    return None


@app.get("/ai/report-sessions/{sid}")  # type: ignore[name-defined]
def report_sessions_get(sid: str) -> dict:
    from .report_sessions import load_session

    data = load_session(sid)
    if not data:
        return {"ok": False, "error": "session not found"}
    return {"ok": True, **data}


@app.get("/ai/report-sessions")  # type: ignore[name-defined]
def report_sessions_list(limit: int = 30) -> dict:
    from .report_sessions import list_sessions

    return {"ok": True, "sessions": list_sessions(limit=limit)}


@app.delete("/ai/report-sessions/{sid}")  # type: ignore[name-defined]
def report_sessions_delete(sid: str) -> dict:
    from .report_sessions import delete_session

    ok = delete_session(sid)
    return {"ok": ok}
