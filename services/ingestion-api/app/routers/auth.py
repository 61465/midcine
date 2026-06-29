from __future__ import annotations

from fastapi import APIRouter, HTTPException

from pydantic import BaseModel
from sqlalchemy import text

from ..auth import issue_token
from ..config import get_settings
from ..db import tenant_session

router = APIRouter(prefix="/v1/auth", tags=["auth"])
_settings = get_settings()


class LoginRequest(BaseModel):
    email: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    expires_in: int
    role: str
    user_id: str
    tenant_id: str


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest):
    """مصادقة مبسّطة للـ prototype.

    البحث بـ HMAC(email)؛ التحقق بـ Argon2id.
    """
    import argon2

    from ..crypto import decrypt, search_hash

    email_hash = search_hash(body.email)

    async with tenant_session(_settings.midcine_dev_tenant_id, role="super_admin") as session:
        row = (
            await session.execute(
                text(
                    """
                    SELECT id, tenant_id, role, password_hash, email_encrypted
                    FROM midcine.users
                    WHERE email_hash = :h AND status = 'active'
                    LIMIT 1
                    """
                ),
                {"h": email_hash},
            )
        ).first()

    if not row:
        raise HTTPException(status_code=401, detail={"code": "INVALID_CREDENTIALS"})

    user_id, tenant_id, role, password_hash, email_enc = row
    if not password_hash or password_hash.startswith("PLACEHOLDER"):
        raise HTTPException(status_code=401, detail={"code": "USER_NOT_SETUP"})

    try:
        argon2.PasswordHasher().verify(password_hash, body.password)
    except argon2.exceptions.VerifyMismatchError as e:
        raise HTTPException(status_code=401, detail={"code": "INVALID_CREDENTIALS"}) from e

    email = decrypt(bytes(email_enc)) if email_enc else body.email
    token = issue_token(str(tenant_id), str(user_id), role, email)
    return LoginResponse(
        access_token=token,
        expires_in=_settings.jwt_ttl_seconds,
        role=role,
        user_id=str(user_id),
        tenant_id=str(tenant_id),
    )
