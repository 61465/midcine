# @midcine/auth

Zitadel OIDC SSO client + Next.js middleware + RBAC for the midcine Suite.

## Why a package not per-app?
SSO across 7 subdomains (`worklist.midcine.io`, `reader.midcine.io`, ...) requires shared
cookie domain `.midcine.io` + identical JWT verification. Duplicating that 7× = drift.

## Pieces
- `client.ts` — browser-side OIDC flow (oidc-client-ts)
- `server.ts` — server-side JWT verification (jose + JWKS)
- `middleware.ts` — Next.js middleware drop-in
- `rbac.ts` — role/permission matrix

## What's missing (Sprint 2)
- Refresh token rotation handling
- Silent renew edge cases
- E2E test with real Zitadel instance
- WebAuthn 2FA flow integration (Sprint 8)
