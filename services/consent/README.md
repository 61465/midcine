# consent · Port 8270

The user-facing gate for cross-hospital data sharing. Dispatches OTP via WhatsApp / SMS /
in-app, persists status, audits every decision. Without an `approved` record the
tunnel-broker refuses to mint a P2P cert.

## Endpoints
- `POST /v1/consent/request` — start a consent flow
- `GET /v1/consent/{id}` — poll status
- `POST /v1/consent/decide` — patient approves/denies (OTP verified)

## Skeleton state
In-memory dict. Sprint 8 wires Postgres + Redis + real OTP dispatch.
