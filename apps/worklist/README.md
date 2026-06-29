# @midcine/worklist

**Port:** 3001 · **Subdomain (prod):** `worklist.midcine.io`

The first thing a radiologist sees in the morning. Triaged study list, search, filters,
priority routing. Nothing else.

## Run locally
```bash
pnpm install
pnpm --filter @midcine/worklist dev
```

## Build for production
```bash
pnpm --filter @midcine/worklist build
```

## What lives here (Sprint 3 deliverables)
- Sorted list (by priority + received time) with WebSocket realtime updates
- Filters: modality, body part, status, assigned doctor
- Search by patient name (encrypted-hash lookup) + study UID
- ⌘K command palette wired
- Keyboard navigation (j/k/enter) for power users

## What does NOT live here
- Image viewing → `@midcine/reader`
- Report editing → `@midcine/reader`
- Patient timeline → `@midcine/patient`
- WhatsApp dispatch → `@midcine/connect`
