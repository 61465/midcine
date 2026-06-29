# @midcine/api-client

Typed clients for all midcine FastAPI services. Hand-written wrappers for ergonomics;
underlying request/response types regenerate from OpenAPI on demand.

## Clients
- `IngestionClient` — `/v1/studies`, `/v1/reports`
- `FhirClient` — `/fhir/R4B/*`
- `LlmClient` — `/v1/llm/draft`, streaming
- `AiDispatcherClient` — `/v1/dispatch` ensemble routing
- `CloudIndexClient` — `/v1/pmi/lookup` cross-hospital
- `ConsentClient` — `/v1/consent/*`
- `connectRealtime` — WebSocket with auto-reconnect + Zod validation

## Generate types from live OpenAPI
```bash
pnpm --filter @midcine/api-client generate
# requires services to be running locally
```

## What's missing (Sprint 3)
- ETag support
- Optimistic update helpers
- Pagination iterators
- React Query/SWR adapters (live in `packages/ui` later)
