"""FHIR R4 Gateway — minimal للـ prototype.

يدعم: GET ImagingStudy/{id}, GET DiagnosticReport?subject=..., search على Patient.
المصادقة في الـ prototype مبسطة (Bearer ثابت أو Client Credentials في الإنتاج).
"""
from __future__ import annotations

import os
from typing import Any
from uuid import UUID

from fastapi import FastAPI, Header, HTTPException, Query
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    postgres_url: str = "postgresql+asyncpg://midcine_app:changeme_dev_only@postgres:5432/midcine"
    fhir_client_id: str = "demo-his"
    fhir_client_secret: str = "dev-fhir-secret"
    midcine_dev_tenant_id: str = "11111111-1111-1111-1111-111111111111"


settings = Settings()
engine = create_async_engine(settings.postgres_url, pool_size=5, max_overflow=10)
Session = async_sessionmaker(engine, expire_on_commit=False)

app = FastAPI(title="midcine FHIR Gateway R4", version="0.1.0")


def _check_auth(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail=_op_outcome("not-authenticated", "Missing bearer"))
    token = authorization.split(" ", 1)[1].strip()
    if token != settings.fhir_client_secret:
        raise HTTPException(status_code=403, detail=_op_outcome("forbidden", "Invalid token"))
    return settings.midcine_dev_tenant_id


def _op_outcome(code: str, msg: str) -> dict[str, Any]:
    return {
        "resourceType": "OperationOutcome",
        "issue": [{"severity": "error", "code": code, "diagnostics": msg}],
    }


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "fhir-gateway"}


@app.get("/fhir/R4/ImagingStudy/{study_id}")
async def get_imaging_study(study_id: str, authorization: str | None = Header(default=None)):
    tenant_id = _check_auth(authorization)
    async with Session() as s:
        await s.execute(text("SELECT set_config('midcine.current_tenant', :v, true)"), {"v": str(tenant_id)})
        await s.execute(text("SELECT set_config('midcine.current_role', 'super_admin', true)"))

        row = (
            await s.execute(
                text(
                    """
                    SELECT st.study_instance_uid, st.modality, st.body_part, st.study_date,
                           st.num_series, st.num_instances, st.description, p.mrn
                    FROM midcine.studies st
                    JOIN midcine.patients p ON p.id = st.patient_id
                    WHERE st.id = :id OR st.study_instance_uid = :id
                    """
                ),
                {"id": study_id},
            )
        ).mappings().first()

    if not row:
        raise HTTPException(status_code=404, detail=_op_outcome("not-found", "ImagingStudy not found"))

    return {
        "resourceType": "ImagingStudy",
        "id": row["study_instance_uid"],
        "identifier": [
            {"system": "urn:dicom:uid", "value": f"urn:oid:{row['study_instance_uid']}"}
        ],
        "status": "available",
        "subject": {"reference": f"Patient/{row['mrn']}"},
        "started": row["study_date"].isoformat() if row["study_date"] else None,
        "modality": [{"system": "http://dicom.nema.org/resources/ontology/DCM", "code": row["modality"]}],
        "numberOfSeries": row["num_series"],
        "numberOfInstances": row["num_instances"],
        "description": row["description"],
    }


@app.get("/fhir/R4/DiagnosticReport")
async def search_diagnostic_report(
    subject: str | None = Query(default=None),
    authorization: str | None = Header(default=None),
):
    tenant_id = _check_auth(authorization)
    mrn = subject.split("/")[-1] if subject else None

    async with Session() as s:
        await s.execute(text("SELECT set_config('midcine.current_tenant', :v, true)"), {"v": str(tenant_id)})
        await s.execute(text("SELECT set_config('midcine.current_role', 'super_admin', true)"))

        sql = """
            SELECT r.id, r.status, r.signed_at, r.impression_ar, r.icd11_codes,
                   st.study_instance_uid, p.mrn
            FROM midcine.reports r
            JOIN midcine.studies st ON st.id = r.study_id
            JOIN midcine.patients p ON p.id = st.patient_id
            WHERE r.status = 'signed'
        """
        params: dict[str, Any] = {}
        if mrn:
            sql += " AND p.mrn = :mrn"
            params["mrn"] = mrn
        sql += " ORDER BY r.signed_at DESC LIMIT 50"
        rows = (await s.execute(text(sql), params)).mappings().all()

    return {
        "resourceType": "Bundle",
        "type": "searchset",
        "total": len(rows),
        "entry": [
            {
                "fullUrl": f"DiagnosticReport/{r['id']}",
                "resource": {
                    "resourceType": "DiagnosticReport",
                    "id": str(r["id"]),
                    "status": "final",
                    "category": [
                        {
                            "coding": [
                                {
                                    "system": "http://terminology.hl7.org/CodeSystem/v2-0074",
                                    "code": "RAD",
                                    "display": "Radiology",
                                }
                            ]
                        }
                    ],
                    "subject": {"reference": f"Patient/{r['mrn']}"},
                    "imagingStudy": [
                        {"reference": f"ImagingStudy/{r['study_instance_uid']}"}
                    ],
                    "issued": r["signed_at"].isoformat() if r["signed_at"] else None,
                    "conclusion": r["impression_ar"],
                    "conclusionCode": [
                        {"coding": [{"system": "http://id.who.int/icd/release/11/mms", "code": c}]}
                        for c in (r["icd11_codes"] or [])
                    ],
                },
            }
            for r in rows
        ],
    }


@app.get("/fhir/R4/DiagnosticReport/{report_id}")
async def get_diagnostic_report(report_id: UUID, authorization: str | None = Header(default=None)):
    tenant_id = _check_auth(authorization)
    async with Session() as s:
        await s.execute(text("SELECT set_config('midcine.current_tenant', :v, true)"), {"v": str(tenant_id)})
        await s.execute(text("SELECT set_config('midcine.current_role', 'super_admin', true)"))
        row = (
            await s.execute(
                text(
                    """
                    SELECT r.*, st.study_instance_uid, p.mrn
                    FROM midcine.reports r
                    JOIN midcine.studies st ON st.id = r.study_id
                    JOIN midcine.patients p ON p.id = st.patient_id
                    WHERE r.id = :id
                    """
                ),
                {"id": str(report_id)},
            )
        ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail=_op_outcome("not-found", "DiagnosticReport not found"))
    return {
        "resourceType": "DiagnosticReport",
        "id": str(row["id"]),
        "status": "final" if row["status"] == "signed" else "preliminary",
        "subject": {"reference": f"Patient/{row['mrn']}"},
        "imagingStudy": [{"reference": f"ImagingStudy/{row['study_instance_uid']}"}],
        "issued": row["signed_at"].isoformat() if row["signed_at"] else None,
        "conclusion": row["impression_ar"],
        "conclusionCode": [
            {"coding": [{"system": "http://id.who.int/icd/release/11/mms", "code": c}]}
            for c in (row["icd11_codes"] or [])
        ],
    }
