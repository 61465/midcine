"""JWT auth خفيف للـ prototype.

OIDC + 2FA + mTLS تأتي في الإنتاج (راجع 08-API-CONTRACTS.md §1.2).
"""
from __future__ import annotations

import time
from dataclasses import dataclass

import jwt
from fastapi import Depends, Header, HTTPException, status

from .config import get_settings

_settings = get_settings()


@dataclass
class Principal:
    tenant_id: str
    user_id: str
    role: str
    email: str | None = None


def issue_token(tenant_id: str, user_id: str, role: str, email: str) -> str:
    now = int(time.time())
    payload = {
        "iss": "midcine",
        "sub": user_id,
        "tenant": tenant_id,
        "role": role,
        "email": email,
        "iat": now,
        "exp": now + _settings.jwt_ttl_seconds,
    }
    return jwt.encode(payload, _settings.jwt_secret, algorithm=_settings.jwt_alg)


def verify_token(token: str) -> Principal:
    try:
        payload = jwt.decode(token, _settings.jwt_secret, algorithms=[_settings.jwt_alg])
    except jwt.PyJWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e)) from e
    return Principal(
        tenant_id=payload["tenant"],
        user_id=payload["sub"],
        role=payload["role"],
        email=payload.get("email"),
    )


async def get_principal(authorization: str | None = Header(default=None)) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing bearer")
    return verify_token(authorization.split(" ", 1)[1].strip())


async def get_principal_optional(authorization: str | None = Header(default=None)) -> Principal | None:
    if not authorization:
        return None
    return await get_principal(authorization)


# للـ webhooks من Orthanc / internal services — يستخدم tenant افتراضي
def system_principal() -> Principal:
    return Principal(
        tenant_id=_settings.midcine_dev_tenant_id,
        user_id="00000000-0000-0000-0000-000000000000",
        role="super_admin",
        email="system@midcine.io",
    )
