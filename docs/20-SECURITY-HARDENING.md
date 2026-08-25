# midcine — Security Hardening Sprint

**Date:** 2026-07-06
**Status:** Deployed to production (Tailscale Funnel)

## Threats fixed

| # | Threat | CWE | Fix |
|---|---|---|---|
| 1 | PHI leak to LLM via findings/symptoms/history | CWE-359 | `redact()` applied to `/ai/impression`, `/ai/critical`, `/ai/compare` before Naraya calls |
| 2 | Bridge unauthenticated (open localhost) | CWE-306 | Optional shared-secret `X-Midcine-Token` (constant-time compare) |
| 3 | Waitlist enumeration + DoS | CWE-770 | Rate limiter: 10/min per IP on `/waitlist`, 30/min on AI |
| 4 | AI abuse (unlimited expensive calls) | CWE-770 | Per-endpoint token buckets |
| 5 | Executable disguised as DICOM | CWE-434 | Magic-byte reject (MZ/ELF/Mach-O headers rejected) |
| 6 | Path traversal in `/series/{filename}` | CWE-22 | `safe_join` + null/slash/`..` reject + `_safe_filename` layer |
| 7 | Missing security headers | CWE-693 | Middleware adds HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| 8 | React tree crash exposes state | CWE-703 | `ErrorBoundary` around `/room` — HIPAA §164.312 graceful degradation |
| 9 | No correlation between logs + client complaints | CWE-778 | `X-Request-ID` on every response, echoed from client if provided |
| 10 | Age precision leaks PHI | CWE-359 | Age coarsened to decade (`28` → `20s`) in all LLM prompts |

## Files created
- `services/mcp-bridge/app/security.py` — rate_limit, optional_token_auth, validate_dicom_upload, safe_join, security headers
- `apps/web/lib/bridge-fetch.ts` — proxy helper with automatic token forwarding
- `apps/web/app/_components/error-boundary.tsx` — React error boundary with audit beacon
- `apps/web/app/api/mcp/audit/client-error/route.ts` — reports client crashes to bridge audit log

## Files modified
- `services/mcp-bridge/app/main.py` — auth+rate-limit dependencies, security middleware, request-ID, PHI redaction on all 4 AI endpoints, upload validation
- `apps/web/app/(room)/layout.tsx` — wrap children in ErrorBoundary
- 31 API proxy routes converted from raw `fetch` to `bridgeFetch` (auto-attaches auth token)

## Verified (real requests to prod URL)
- ✅ Rate limit: waitlist 429 after 10 in 60s
- ✅ Exec magic reject: `MZ` rejected as "executable payload"
- ✅ Path traversal reject: `../pwn.txt` returns 404 (matches _safe_filename hardening)
- ✅ Headers present: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS, CSP, X-Request-ID
- ✅ PHI redaction end-to-end: patient name `Ahmed Al-Khalidi` sent → LLM output contains no PHI
- ✅ All 7 public pages return 200 through Tailscale HTTPS
- ✅ AI Impression latency: 3.8s (unchanged by security overhead)

## To enable bridge auth on production
```bash
export MIDCINE_BRIDGE_TOKEN=$(openssl rand -base64 32)
# Set the same value in Next.js env for the proxy layer
```

## Rate-limit override
```bash
export MIDCINE_RATE_LIMIT=0  # only for local dev/testing
```

## Related
- `docs/19-COMPANY-AUDIT-2026-07-06.md` — the audit that identified these issues
- `services/mcp-bridge/app/phi_redactor.py` — existing PHI patterns (extended by this sprint)
