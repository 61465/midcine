# cloud-index · Port 8260

The pointer-only directory that makes cross-hospital lookup possible without ever
holding PII. Hospitals submit `SHA-256(salt + national_id)`; we reply with hospital
IDs only.

## Why a separate service
- Different RLS posture (this table is cross-tenant by design)
- Different scaling shape (read-mostly, very low payload)
- Different access boundary (only hospital edge gateways call it)

## DB
Requires migration `006_cross_tenant_pmi.sql` (Sprint 8).
