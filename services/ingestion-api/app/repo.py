"""DB operations لـ ingestion + reading."""
from __future__ import annotations

import json
from datetime import date
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from midcine_types import InstanceMeta

from .crypto import encrypt, search_hash


async def get_or_create_patient(
    session: AsyncSession,
    *,
    tenant_id: str,
    mrn: str,
    name_ar: str,
    dob: date | None,
    sex: str | None,
) -> UUID:
    row = (
        await session.execute(
            text("SELECT id FROM midcine.patients WHERE tenant_id=:t AND mrn=:m AND deleted_at IS NULL"),
            {"t": tenant_id, "m": mrn},
        )
    ).first()
    if row:
        return row[0]
    pid = uuid4()
    await session.execute(
        text(
            """
            INSERT INTO midcine.patients
                (id, tenant_id, mrn, name_encrypted, name_search_hash, dob, sex)
            VALUES (:id, :t, :m, :ne, :ns, :dob, :sex)
            """
        ),
        {
            "id": str(pid),
            "t": tenant_id,
            "m": mrn,
            "ne": encrypt(name_ar),
            "ns": search_hash(name_ar),
            "dob": dob,
            "sex": sex or "U",
        },
    )
    return pid


async def get_or_create_study(
    session: AsyncSession,
    *,
    tenant_id: str,
    patient_id: UUID,
    meta: InstanceMeta,
) -> UUID:
    row = (
        await session.execute(
            text("SELECT id FROM midcine.studies WHERE study_instance_uid=:u"),
            {"u": meta.study_instance_uid},
        )
    ).first()
    if row:
        return row[0]
    sid = uuid4()
    await session.execute(
        text(
            """
            INSERT INTO midcine.studies
                (id, tenant_id, patient_id, study_instance_uid, accession_number,
                 study_date, modality, body_part, description, clinical_indication,
                 storage_location)
            VALUES (:id, :t, :p, :uid, :acc, :sd, :mod, :bp, :desc, :ci, 'cloud')
            """
        ),
        {
            "id": str(sid),
            "t": tenant_id,
            "p": str(patient_id),
            "uid": meta.study_instance_uid,
            "acc": meta.accession_number,
            "sd": meta.study_date,
            "mod": meta.modality,
            "bp": meta.body_part,
            "desc": meta.description,
            "ci": meta.clinical_indication,
        },
    )
    return sid


async def get_or_create_series(
    session: AsyncSession,
    *,
    tenant_id: str,
    study_id: UUID,
    series_uid: str,
    modality: str,
) -> UUID:
    row = (
        await session.execute(
            text("SELECT id FROM midcine.series WHERE series_instance_uid=:u"),
            {"u": series_uid},
        )
    ).first()
    if row:
        return row[0]
    sid = uuid4()
    await session.execute(
        text(
            """
            INSERT INTO midcine.series
                (id, tenant_id, study_id, series_instance_uid, modality)
            VALUES (:id, :t, :st, :u, :m)
            """
        ),
        {"id": str(sid), "t": tenant_id, "st": str(study_id), "u": series_uid, "m": modality},
    )
    return sid


async def insert_instance(
    session: AsyncSession,
    *,
    tenant_id: str,
    series_id: UUID,
    meta: InstanceMeta,
    storage_uri: str,
) -> UUID:
    iid = uuid4()
    await session.execute(
        text(
            """
            INSERT INTO midcine.instances
                (id, tenant_id, series_id, sop_instance_uid, rows, cols,
                 storage_uri, storage_size_bytes, transfer_syntax, hash_sha256)
            VALUES (:id, :t, :se, :uid, :r, :c, :uri, :sz, :ts, decode(:h, 'hex'))
            ON CONFLICT (sop_instance_uid) DO NOTHING
            """
        ),
        {
            "id": str(iid),
            "t": tenant_id,
            "se": str(series_id),
            "uid": meta.sop_instance_uid,
            "r": meta.rows,
            "c": meta.cols,
            "uri": storage_uri,
            "sz": meta.size_bytes,
            "ts": meta.transfer_syntax,
            "h": meta.hash_sha256,
        },
    )
    # update study counters
    await session.execute(
        text(
            """
            UPDATE midcine.studies
            SET num_instances = num_instances + 1,
                size_bytes = size_bytes + :sz
            WHERE id = (SELECT study_id FROM midcine.series WHERE id = :se)
            """
        ),
        {"sz": meta.size_bytes, "se": str(series_id)},
    )
    return iid


async def worklist(
    session: AsyncSession,
    *,
    status_: str | None = "unread",
    modality: str | None = None,
    priority_max: int | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    sql = """
        SELECT s.id, s.study_instance_uid, s.modality, s.body_part, s.description,
               s.study_date, s.received_at, s.triage_priority, s.triage_label,
               s.ai_confidence, s.read_status, s.assigned_doctor_id, s.num_instances,
               p.id AS patient_id, p.mrn, p.dob, p.sex, p.name_encrypted
        FROM midcine.studies s
        JOIN midcine.patients p ON p.id = s.patient_id
        WHERE 1=1
    """
    params: dict[str, Any] = {}
    if status_:
        sql += " AND s.read_status = :status"
        params["status"] = status_
    if modality:
        sql += " AND s.modality = :modality"
        params["modality"] = modality
    if priority_max is not None:
        sql += " AND s.triage_priority <= :pmax"
        params["pmax"] = priority_max
    sql += " ORDER BY s.triage_priority ASC, s.received_at DESC LIMIT :lim"
    params["lim"] = limit
    rows = (await session.execute(text(sql), params)).mappings().all()
    from .crypto import decrypt
    out = []
    for r in rows:
        age = None
        if r["dob"]:
            today = date.today()
            age = today.year - r["dob"].year - (
                (today.month, today.day) < (r["dob"].month, r["dob"].day)
            )
        try:
            display = decrypt(bytes(r["name_encrypted"])) if r["name_encrypted"] else r["mrn"]
        except Exception:
            display = r["mrn"]
        out.append(
            {
                "study_id": str(r["id"]),
                "study_uid": r["study_instance_uid"],
                "patient": {
                    "id": str(r["patient_id"]),
                    "mrn": r["mrn"],
                    "display_name": display,
                    "age_at_study": age,
                    "sex": r["sex"],
                },
                "modality": r["modality"],
                "body_part": r["body_part"],
                "description": r["description"],
                "study_date": r["study_date"].isoformat(),
                "received_at": r["received_at"].isoformat(),
                "triage_priority": r["triage_priority"],
                "triage_label": r["triage_label"],
                "ai_confidence": float(r["ai_confidence"]) if r["ai_confidence"] else None,
                "read_status": r["read_status"],
                "assigned_doctor_id": str(r["assigned_doctor_id"]) if r["assigned_doctor_id"] else None,
                "num_instances": r["num_instances"],
            }
        )
    return out


def _safe_decrypt(b) -> str | None:
    if not b:
        return None
    try:
        from .crypto import decrypt
        return decrypt(bytes(b))
    except Exception:
        return None


async def study_detail(session: AsyncSession, study_uid: str) -> dict[str, Any] | None:
    row = (
        await session.execute(
            text(
                """
                SELECT s.*, p.id AS patient_id_full, p.mrn, p.dob, p.sex, p.name_encrypted
                FROM midcine.studies s
                JOIN midcine.patients p ON p.id = s.patient_id
                WHERE s.study_instance_uid = :u
                """
            ),
            {"u": study_uid},
        )
    ).mappings().first()
    if not row:
        return None

    series_rows = (
        await session.execute(
            text(
                """
                SELECT id, series_instance_uid, description, num_instances
                FROM midcine.series WHERE study_id = :s
                ORDER BY series_number
                """
            ),
            {"s": str(row["id"])},
        )
    ).mappings().all()

    ai_rows = (
        await session.execute(
            text(
                """
                SELECT inference_type, output, confidence, model_name
                FROM midcine.ai_inferences
                WHERE study_id = :s
                ORDER BY created_at DESC
                """
            ),
            {"s": str(row["id"])},
        )
    ).mappings().all()

    report_row = (
        await session.execute(
            text(
                """
                SELECT id, status, version, technique_ar, findings_ar,
                       impression_ar, recommendations_ar, icd11_codes,
                       ai_acceptance, signed_at, pdf_storage_uri
                FROM midcine.reports
                WHERE study_id = :s
                ORDER BY version DESC LIMIT 1
                """
            ),
            {"s": str(row["id"])},
        )
    ).mappings().first()

    age = None
    if row["dob"]:
        today = date.today()
        age = today.year - row["dob"].year - (
            (today.month, today.day) < (row["dob"].month, row["dob"].day)
        )

    return {
        "study_id": str(row["id"]),
        "study_uid": row["study_instance_uid"],
        "modality": row["modality"],
        "body_part": row["body_part"],
        "description": row["description"],
        "study_date": row["study_date"].isoformat(),
        "clinical_indication": row["clinical_indication"],
        "patient": {
            "id": str(row["patient_id_full"]),
            "mrn": row["mrn"],
            "name_ar": (_safe_decrypt(row["name_encrypted"]) or row["mrn"]),
            "age_at_study": age,
            "sex": row["sex"],
        },
        "triage_priority": row["triage_priority"],
        "triage_label": row["triage_label"],
        "ai_confidence": float(row["ai_confidence"]) if row["ai_confidence"] else None,
        "read_status": row["read_status"],
        "series": [
            {
                "series_id": str(s["id"]),
                "series_uid": s["series_instance_uid"],
                "description": s["description"],
                "num_instances": s["num_instances"],
            }
            for s in series_rows
        ],
        "ai_inferences": [
            {
                "type": a["inference_type"],
                "output": json.loads(a["output"]) if isinstance(a["output"], str) else a["output"],
                "confidence": float(a["confidence"]) if a["confidence"] else None,
                "model": a["model_name"],
            }
            for a in ai_rows
        ],
        "report": (
            {
                "id": str(report_row["id"]),
                "status": report_row["status"],
                "version": report_row["version"],
                "technique_ar": report_row["technique_ar"],
                "findings_ar": report_row["findings_ar"],
                "impression_ar": report_row["impression_ar"],
                "recommendations_ar": report_row["recommendations_ar"],
                "icd11_codes": report_row["icd11_codes"] or [],
                "ai_acceptance": report_row["ai_acceptance"],
                "signed_at": report_row["signed_at"].isoformat() if report_row["signed_at"] else None,
                "pdf_url": (
                    f"/v1/reports/{report_row['id']}/pdf"
                    if report_row["pdf_storage_uri"]
                    else None
                ),
            }
            if report_row
            else None
        ),
    }
