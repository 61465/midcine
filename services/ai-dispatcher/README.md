# ai-dispatcher · Port 8200

The router half of the ensemble brain. Takes a study + metadata, picks specialists per
`config/dispatch_rules.yaml`, fans out in parallel with circuit breakers, hands raw
outputs to `ai-aggregator` (Sprint 4 wiring).

## Endpoints
- `GET /health` · liveness
- `GET /ready` · readiness (rules loaded)
- `POST /v1/dispatch` · fan out to specialists
- `GET /v1/dispatch/{study_uid}` · cached result (Sprint 4)
- `GET /metrics` · Prometheus

## Edit routing
`config/dispatch_rules.yaml` — first-match wins per key, dedup across matches.

## What's missing
- Aggregator wiring (Sprint 4)
- Result caching in Redis (Sprint 4)
- Redis stream consumer mode (Sprint 5)
- mTLS to specialists (Sprint 9)
