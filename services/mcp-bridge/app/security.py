"""Bridge security hardening — rate limits + auth + traversal + upload validation.

Design:
  - Rate limits: in-memory token buckets per IP + endpoint prefix.
  - Auth: optional shared-secret via X-Midcine-Token; the Next.js proxy attaches
    it automatically from MIDCINE_BRIDGE_TOKEN env.
  - Path guard: safe_join catches traversal even if _safe_filename misses.
  - Upload validation: file size + magic-byte check for DICOM/ZIP uploads.
  - Security headers: HSTS + CSP + X-Frame-Options + X-Content-Type-Options.
  - Request ID: every request gets an X-Request-ID for correlation in audit log.
"""

from __future__ import annotations

import hmac
import logging
import os
import secrets
import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import HTTPException, Request

log = logging.getLogger("mcp-bridge.security")

# ---- Rate limiting ----

# (max_calls, window_seconds) per endpoint prefix — sensible defaults for MVP.
RATE_LIMITS = {
    "/waitlist": (10, 60),               # 10 signups per minute per IP
    "/ai/impression": (30, 60),          # 30 impressions/min = 1 every 2s
    "/ai/vision-analyze": (10, 60),      # heavy compute → tighter
    "/ai/analyze-study": (10, 60),       # heavy multi-call pipeline → tight
    "/ai/critical": (60, 60),            # cheap, users fire on every keystroke
    "/ai/compare": (30, 60),
    "/ai/pubmed-cite": (30, 60),
    "/ai/segment": (30, 60),
    "/ai/style/record": (60, 60),
    "/studies/": (600, 60),              # 10/sec — series upload (100+ slices)
    "default": (300, 60),                # everything else
}

_BUCKETS: dict[str, deque] = defaultdict(deque)


def _limit_for(path: str) -> tuple[int, int]:
    for prefix, cfg in RATE_LIMITS.items():
        if prefix == "default":
            continue
        if path.startswith(prefix):
            return cfg
    return RATE_LIMITS["default"]


def _key(request: Request, path: str) -> str:
    ip = request.client.host if request.client else "unknown"
    # Group by IP + endpoint prefix (not full path — /studies/A vs /studies/B share bucket)
    for prefix in RATE_LIMITS:
        if prefix != "default" and path.startswith(prefix):
            return f"{ip}::{prefix}"
    return f"{ip}::default"


async def rate_limit(request: Request) -> None:
    """Reject the request if the caller has exceeded their token bucket."""
    if os.getenv("MIDCINE_RATE_LIMIT", "1") == "0":
        return
    path = request.url.path
    max_calls, window = _limit_for(path)
    key = _key(request, path)
    now = time.monotonic()
    bucket = _BUCKETS[key]
    # Drain expired timestamps
    while bucket and bucket[0] <= now - window:
        bucket.popleft()
    if len(bucket) >= max_calls:
        retry_after = int(window - (now - bucket[0])) + 1
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded ({max_calls}/{window}s). Retry after {retry_after}s.",
            headers={"Retry-After": str(retry_after)},
        )
    bucket.append(now)


# ---- Optional shared-secret auth ----


def optional_token_auth(request: Request) -> None:
    """If MIDCINE_BRIDGE_TOKEN is set, require it on mutating endpoints.

    Uses constant-time comparison (hmac.compare_digest) to defend against
    timing side-channel attacks on the shared secret.
    """
    expected = os.getenv("MIDCINE_BRIDGE_TOKEN", "")
    if not expected:
        return  # auth disabled
    # Read-only endpoints stay public for referring physicians who use
    # localStorage-based auth on the Next.js side.
    if request.method in ("GET", "HEAD", "OPTIONS"):
        return
    # Allow the health endpoint through even without token (docker healthcheck)
    if request.url.path == "/health":
        return
    provided = request.headers.get("x-midcine-token", "")
    if not provided or not hmac.compare_digest(provided, expected):
        # Log without leaking the value
        log.warning(
            "auth denied on %s from %s",
            request.url.path,
            request.client.host if request.client else "?",
        )
        raise HTTPException(status_code=401, detail="Invalid or missing X-Midcine-Token")


# ---- Path traversal guard ----


def safe_join(base: Path, *parts: str) -> Path:
    """Reject anything that escapes `base` (path traversal defence-in-depth).
    Even if _safe_filename already sanitises, this catches missed callers."""
    # Reject parts with null bytes, backslash, or slash before we even join
    for p in parts:
        if "\x00" in p or ".." in p or p.startswith("/") or p.startswith("\\"):
            raise HTTPException(status_code=400, detail="path traversal denied")
    target = base.joinpath(*parts).resolve()
    base_resolved = base.resolve()
    try:
        target.relative_to(base_resolved)
    except ValueError:
        raise HTTPException(status_code=400, detail="path traversal denied") from None
    return target


# ---- Upload magic-byte validation ----

MAX_DICOM_BYTES = 500 * 1024 * 1024  # 500 MB hard cap
DICM_MAGIC = b"DICM"          # DICOM files have DICM at offset 128
ZIP_MAGIC = b"PK\x03\x04"     # PKZIP local file header
GZIP_MAGIC = b"\x1f\x8b"      # gzip


def validate_dicom_upload(body: bytes, allow_zip: bool = True) -> tuple[str, bytes]:
    """Return (kind, body) or raise HTTPException.

    Rejects:
      - empty payloads
      - payloads over MAX_DICOM_BYTES
      - files that don't match a DICOM or ZIP magic byte pattern
      - executable files disguised as DICOM (PE/ELF/Mach-O headers)
    """
    if not body:
        raise HTTPException(status_code=400, detail="empty body")
    if len(body) > MAX_DICOM_BYTES:
        raise HTTPException(
            status_code=413, detail=f"file too large ({len(body)} > {MAX_DICOM_BYTES} bytes)"
        )

    # Executable magic bytes — outright rejection (defence in depth against
    # someone renaming a binary to *.dcm and expecting the viewer to skip it)
    exec_magics = [b"MZ", b"\x7fELF", b"\xfe\xed\xfa", b"\xce\xfa\xed\xfe"]
    for m in exec_magics:
        if body[: len(m)] == m:
            raise HTTPException(status_code=415, detail="rejected: executable payload")

    # ZIP (multi-file bundle export from PACS)
    if allow_zip and body[:4] == ZIP_MAGIC:
        return "zip", body

    # Standard DICOM: 128-byte preamble then DICM
    if len(body) >= 132 and body[128:132] == DICM_MAGIC:
        return "dicom", body

    # Legacy DICOM without preamble — accept if a few common tags at head look sane
    if len(body) >= 8 and body[:2] in (b"\x08\x00", b"\x02\x00"):
        # Group tags 0002/0008 are the earliest DICOM header groups
        return "dicom_legacy", body

    raise HTTPException(status_code=415, detail="not a DICOM or ZIP file (magic bytes mismatch)")


# ---- Response security headers ----


def add_security_headers(response) -> None:
    """Attach OWASP-recommended headers to every response."""
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault(
        "Permissions-Policy", "camera=(), microphone=(self), geolocation=()"
    )
    # HSTS only meaningful over HTTPS; harmless on plain HTTP.
    response.headers.setdefault(
        "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
    )
    # Bridge returns JSON + binary DICOM; no HTML, so CSP is defensive.
    response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")


# ---- Request ID generation ----


def gen_request_id() -> str:
    """URL-safe short ID for correlating audit + logs + client complaints."""
    return secrets.token_urlsafe(9)
