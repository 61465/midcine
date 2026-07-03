"""HMAC-signed shareable links for reports.

Design:
  - Each link is a compact token: base64url(payload_json + signature).
  - Payload includes: study_uid, kind (pdf|viewer|sr), issued_at, expires_at, recipient_tag.
  - Signed with a rotating server-side secret (SHARE_LINK_SECRET env).
  - Verification: HMAC constant-time compare + expiry check.
  - No DB needed for the pilot; server just validates signature.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import os
import time
from typing import Literal

log = logging.getLogger("share-links")

Kind = Literal["pdf", "viewer", "sr"]

_SECRET_ENV = "SHARE_LINK_SECRET"  # noqa: S105  env var name, not a value
_DEFAULT_TTL_SECONDS = 7 * 24 * 3600  # 7 days


def _secret() -> bytes:
    val = os.getenv(_SECRET_ENV, "")
    if not val:
        # Fall back to a hostname-derived pseudo-secret for dev only
        val = f"midcine-dev-{os.getenv('COMPUTERNAME', 'unknown')}"
        log.warning("share_links: %s not set, using dev fallback", _SECRET_ENV)
    return val.encode("utf-8")


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def issue(
    study_uid: str,
    kind: Kind,
    recipient_tag: str = "",
    ttl_seconds: int = _DEFAULT_TTL_SECONDS,
) -> str:
    """Issue a signed token that can be redeemed at /share/{token}."""
    now = int(time.time())
    payload = {
        "sid": study_uid,
        "k": kind,
        "r": recipient_tag,
        "iat": now,
        "exp": now + int(ttl_seconds),
    }
    payload_json = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    payload_b64 = _b64url_encode(payload_json)
    sig = hmac.new(_secret(), payload_b64.encode("ascii"), hashlib.sha256).digest()
    sig_b64 = _b64url_encode(sig[:16])  # 128-bit truncated is fine here
    return f"{payload_b64}.{sig_b64}"


def verify(token: str) -> dict | None:
    """Return decoded payload if token is valid + unexpired, else None."""
    if "." not in token:
        return None
    payload_b64, sig_b64 = token.rsplit(".", 1)
    expected = hmac.new(_secret(), payload_b64.encode("ascii"), hashlib.sha256).digest()[:16]
    try:
        provided = _b64url_decode(sig_b64)
    except ValueError:
        return None
    if not hmac.compare_digest(expected, provided):
        return None
    try:
        payload_json = _b64url_decode(payload_b64)
        payload = json.loads(payload_json.decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if payload.get("exp", 0) < int(time.time()):
        return None
    return payload


def issue_bundle(
    study_uid: str, recipient_tag: str, base_url: str, ttl_seconds: int = _DEFAULT_TTL_SECONDS
) -> dict:
    """Issue all three links a doctor typically needs."""
    return {
        "pdf": f"{base_url}/share/{issue(study_uid, 'pdf', recipient_tag, ttl_seconds)}",
        "viewer": f"{base_url}/share/{issue(study_uid, 'viewer', recipient_tag, ttl_seconds)}",
        "sr": f"{base_url}/share/{issue(study_uid, 'sr', recipient_tag, ttl_seconds)}",
    }
