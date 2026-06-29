"""كاتب audit_log — يضمن سجل لكل وصول لـ PHI."""
from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def write_audit(
    session: AsyncSession,
    *,
    action: str,
    resource_type: str,
    resource_id: str,
    actor_user_id: str | None,
    actor_role: str | None,
    tenant_id: str | None,
    request_id: str | None = None,
    auth_method: str = "system",
    outcome: str = "success",
    patient_id: str | None = None,
    extra: dict[str, Any] | None = None,
    actor_ip: str | None = None,
    actor_ua: str | None = None,
) -> None:
    pid_hash = (
        hashlib.sha256(patient_id.encode("utf-8")).hexdigest()[:64] if patient_id else None
    )
    await session.execute(
        text(
            """
            INSERT INTO midcine_audit.audit_log
                (request_id, tenant_id, actor_user_id, actor_role, actor_ip, actor_ua,
                 auth_method, action, resource_type, resource_id, patient_id_hash, outcome, extra)
            VALUES (:rid, :tid, :uid, :role, :ip, :ua, :auth, :act, :rt, :rid2, :pid, :out, :extra)
            """
        ),
        {
            "rid": request_id or str(uuid.uuid4()),
            "tid": tenant_id,
            "uid": actor_user_id,
            "role": actor_role,
            "ip": actor_ip,
            "ua": actor_ua,
            "auth": auth_method,
            "act": action,
            "rt": resource_type,
            "rid2": str(resource_id),
            "pid": pid_hash,
            "out": outcome,
            "extra": json.dumps(extra or {}),
        },
    )
