<div dir="rtl" lang="ar">

# Handoff C — Cloud Ingestion API + Database

> **المهمة:** Backend مركزي يستقبل من Edge، يخزّن، يفوّض لـ AI، يخدم Viewer.

---

## 1. Goal
بناء خدمة FastAPI تستقبل DICOMs من Edge Gateways، تخزّنها في R2 + PostgreSQL، تطلق events لـ AI workers، وتخدم Viewer عبر DICOMweb (WADO-RS/QIDO-RS).

## 2. Scope

### داخل النطاق
- FastAPI service `ingestion-api`
- PostgreSQL 16 schema (multi-tenant با RLS):
  - tenants, users, patients, studies, series, instances, reports, audit_log, knowledge_chunks
- Object storage abstraction (boto3 S3-compatible): R2 production، MinIO dev
- Redis Streams لـ event bus
- WebSocket endpoint للـ Edge (يستقبل streams من Handoff B)
- DICOMweb endpoints متوافقة مع OHIF v3:
  - QIDO-RS: `/studies`, `/studies/{uid}/series`
  - WADO-RS: `/studies/{uid}/series/{uid}/instances/{uid}/frames/{n}`
  - WADO-URI الأساسي للـ legacy
- Auth: OIDC (Authentik) + JWT + mTLS للـ Edge
- RBAC: Casbin integration
- Audit logging: كل وصول لـ PHI يسجّل
- FHIR R5 endpoints أساسية (Patient، ImagingStudy، DiagnosticReport)
- OpenAPI 3.1 doc

### خارج النطاق
- ❌ AI inference (Handoff F)
- ❌ LLM generation (Handoff G)
- ❌ UI (Handoff D + E)

## 3. Tech Spec

```yaml
Python: 3.12
FastAPI: 0.115+
Pydantic: 2.9+
SQLAlchemy: 2.0+ (async)
Alembic: latest (migrations)
PostgreSQL: 16 + pgvector + pg_search (ParadeDB)
asyncpg: 0.30+
boto3: 1.35+ (S3-compatible)
redis: 5+ (async)
PyJWT + authlib: للـ OIDC
casbin: 1.x
prometheus-client: للـ /metrics
opentelemetry: للـ traces
```

## 4. APIs / Interfaces

### Inbound من Edge (WebSocket)
```
wss://ingest.midcine.io/edge/{tenant_id}
(انظر Handoff B للـ protocol)
```

### Inbound من Viewer (DICOMweb)
```http
GET /dicom-web/studies?PatientID={id}
GET /dicom-web/studies/{study_uid}/series
GET /dicom-web/studies/{uid}/series/{uid}/instances/{uid}
GET /dicom-web/studies/{uid}/series/{uid}/instances/{uid}/frames/{frame}
GET /dicom-web/studies/{uid}/series/{uid}/instances/{uid}/rendered
```

### Inbound من Admin Dashboard (REST)
```http
GET    /api/v1/worklist?status=&assigned_to=&date=
POST   /api/v1/studies/{uid}/assign     {"doctor_id": "..."}
POST   /api/v1/reports                  {"study_uid": "...", "content_ar": "..."}
PATCH  /api/v1/reports/{id}
POST   /api/v1/reports/{id}/sign
GET    /api/v1/patients/{id}/history
```

### Outbound لـ AI Worker (Redis Stream)
```
Stream: studies:new
Message: { "study_uid": "...", "tenant_id": "...", "modality": "CT", "body_part": "brain" }
```

### Outbound لـ LLM (Redis Stream)
```
Stream: reports:draft_request
Message: { "study_uid": "...", "ai_measurements": {...}, "prior_report_id": "..." }
```

### Outbound لـ Viewer (WebSocket)
```
wss://api.midcine.io/ws/worklist
Push events: { "type": "study_ready" | "ai_complete" | "report_signed", "study_uid": "..." }
```

## 5. Inputs Provided

```
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://...
S3_ENDPOINT=https://...r2.cloudflarestorage.com
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=midcine-dicoms-prod
OIDC_ISSUER=https://auth.midcine.io
OIDC_CLIENT_ID=ingestion-api
OIDC_CLIENT_SECRET=...
MTLS_CA_CERT_PATH=/certs/midcine-ca.crt
JWT_SECRET_KEY=...
VAULT_ADDR=https://vault.midcine.io
VAULT_TOKEN=...
```

### Sample Data
- DB seed: 3 tenants، 10 doctors، 50 patients
- 20 DICOM studies في S3 (anonymized)

## 6. Acceptance Criteria

- [ ] DICOMweb QIDO/WADO يجتاز OHIF v3 conformance tests
- [ ] استلام study من Edge يكتمل في <60s (مع 100 instance)
- [ ] Row-Level Security يمنع cross-tenant access (اختبار automated)
- [ ] Audit log يكتب لكل DICOM access (verified في tests)
- [ ] FHIR endpoints تجتاز Inferno test suite (الأساسية فقط)
- [ ] WebSocket scaling: 100 concurrent viewer connections بدون drops
- [ ] OpenAPI docs على `/docs` كاملة ومحدّثة
- [ ] DB migrations عبر Alembic، rollback آمن

## 7. Definition of Done

- ✅ كود في `services/ingestion-api/`
- ✅ Alembic migrations مرتبة، seed script
- ✅ tests: unit ≥80% coverage، integration end-to-end
- ✅ Docker image production-ready (≤200MB)
- ✅ Postman/Bruno collection للـ APIs
- ✅ Prometheus metrics + Grafana dashboard
- ✅ Architecture doc في `services/ingestion-api/docs/`

## 8. Timeline
**3 أسابيع.**

| Sprint | Output |
|--------|--------|
| W1 | DB schema + RLS + DICOMweb basic GET |
| W2 | WebSocket Edge endpoint + Redis events + Audit |
| W3 | FHIR endpoints + OIDC + Casbin + production hardening |

## 9. Risks

| الخطر | تخفيف |
|------|--------|
| DICOMweb compliance معقّد | البدء بـ OHIF integration tests منذ يوم 1 |
| RLS performance overhead | indexes متوافقة + load test مبكر |
| WebSocket scaling | الانتقال لـ uvicorn مع uvloop + horizontal scaling خطة جاهزة |

</div>
