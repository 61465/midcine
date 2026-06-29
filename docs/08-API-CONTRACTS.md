<div dir="rtl" lang="ar">

# 08 — عقود الـ API (REST + WebSocket)

> **مدخلات:** Backend Dev (NEXUS-AI) + قرارات 01-ARCHITECTURE.md و 07-DATA-MODEL.md.
> **المبدأ:** OpenAPI 3.1 + Pydantic v2 + Zod؛ versioning في الـ URL (`/v1/`)؛ envelope موحّد للأخطاء؛ idempotency على كل POST يكتب حالة.
> آخر تحديث: 2026-06-13

---

## 1. القواعد العامة

### 1.1 Base URLs
| الخدمة | المسار |
|--------|--------|
| Ingestion API | `https://api.midcine.io/ingest` |
| Reading API | `https://api.midcine.io/read` |
| AI API (internal) | `http://ai-worker.svc:8200` |
| LLM API (internal) | `http://llm-service.svc:8300` |
| FHIR Gateway | `https://api.midcine.io/fhir/R4` |
| Admin API | `https://api.midcine.io/admin` |

### 1.2 المصادقة
| الخدمة | الآلية |
|--------|--------|
| Edge → Ingestion | **mTLS** (شهادة per-tenant) + JWT اختياري |
| Browser/App → Reading/Admin | **OIDC Bearer JWT** (15 دقيقة TTL) + Refresh token (7 أيام، rotating) |
| Service-to-Service (داخل cluster) | mTLS عبر Linkerd |
| FHIR Gateway → عميل HIS | **OAuth2 Client Credentials** + SMART on FHIR scopes |

### 1.3 الـ Headers الإلزامية على كل طلب يكتب حالة

```
X-Request-Id:           <uuid>           # client-generated، يُتتبَّع في كل log/trace
X-Idempotency-Key:      <uuid>           # client-generated، TTL=24h على السرفر
X-Tenant-Slug:          <slug>           # للـ multi-tenant routing (optional لو JWT يحوي tenant)
Accept-Language:        ar-EG, en;q=0.9
```

### 1.4 Error Envelope الموحّد

```json
{
  "error": {
    "code": "STUDY_NOT_FOUND",          // ENUM ثابت
    "message_ar": "الفحص المطلوب غير موجود",
    "message_en": "Requested study not found",
    "request_id": "9e4c…",
    "details": { "study_uid": "1.2.3…" },
    "retryable": false
  }
}
```

**HTTP Status Codes المستخدمة:**
| الحالة | الاستخدام |
|--------|-----------|
| 200 | نجاح |
| 201 | إنشاء |
| 202 | مقبول للمعالجة غير المتزامنة |
| 204 | حذف ناجح بدون body |
| 400 | تحقق صحة المدخلات |
| 401 | غير مصادَق عليه |
| 403 | مصادَق لكن غير مصرَّح |
| 404 | غير موجود |
| 409 | تعارض (idempotency conflict، version mismatch) |
| 422 | Body صحيح syntactically لكن غير سليم semantically |
| 429 | Rate limit |
| 500 | خطأ سرفر — يُسجَّل + يُنبّه Sentry |
| 503 | غير متاح مؤقتاً (downstream failure) |

### 1.5 Rate Limits (افتراضية)

| الفئة | الحد | النافذة | المفتاح |
|------|------|---------|----------|
| Anonymous | 30 req | 1 min | IP |
| Authenticated user | 600 req | 1 min | user_id |
| Edge Gateway upload | 100 MB/s | continuous | gateway_id |
| Service-to-service | unlimited | — | mTLS cert |
| LLM draft | 30 req | 1 hour | user_id |
| FHIR Gateway | 1000 req | 1 hour | client_id |

السرفر يرجع `Retry-After` + `X-RateLimit-Remaining` + `X-RateLimit-Reset`.

### 1.6 Pagination

كل قائمة تستخدم cursor-based pagination:

```
GET /v1/worklist?limit=50&cursor=eyJpZCI6IjE1NSJ9
```

Response:
```json
{
  "items": [...],
  "next_cursor": "eyJpZCI6IjIwNSJ9",      // null عند النهاية
  "limit": 50
}
```

---

## 2. Ingestion API (Edge → Cloud)

### 2.1 رفع instance واحد (multipart)

```
POST /v1/instances
Content-Type: multipart/form-data
Auth: mTLS

Form fields:
  - meta:    application/json    # نموذج InstanceMeta أدناه
  - pixels:  application/octet-stream  # HTJ2K-compressed
```

**Pydantic — `InstanceMeta`:**
```python
class InstanceMeta(BaseModel):
    study_instance_uid: str = Field(..., max_length=128)
    series_instance_uid: str = Field(..., max_length=128)
    sop_instance_uid: str = Field(..., max_length=128)
    patient_mrn: str = Field(..., max_length=64)
    patient_name_encrypted: str          # base64 من Edge (مفتاح tenant فقط)
    patient_dob: date | None = None
    patient_sex: Literal['M','F','U'] | None = None
    modality: Literal['CT','MR','CR','DR','US','MG','XA','NM','PT','OT']
    body_part: str | None = Field(None, max_length=64)
    study_date: date
    accession_number: str | None = None
    rows: int
    cols: int
    transfer_syntax: str                 # '1.2.840.10008.1.2.4.201' لـ HTJ2K
    hash_sha256: str = Field(..., pattern=r'^[0-9a-f]{64}$')
    size_bytes: int = Field(..., gt=0, le=2_000_000_000)
```

**Response 201:**
```json
{ "instance_id": "uuid", "study_id": "uuid", "storage_uri": "s3://..." }
```

**Errors:** 409 `INSTANCE_DUPLICATE` (نفس sop_uid)؛ 413 `PAYLOAD_TOO_LARGE`؛ 422 `HASH_MISMATCH`.

### 2.2 إخطار اكتمال الـ Study

```
POST /v1/studies/{study_uid}/complete
Body: { "expected_instances": 350 }
```

يُطلق رسالة `studies:new` على Redis Stream عند مطابقة العدد.

**Response 202:** `{ "queued_for_ai": true, "study_id": "uuid" }`

### 2.3 WebSocket Streaming (الإصدار 2.0 من Edge Pusher)

```
WS /v1/edge/stream
Auth: mTLS (TLS 1.3 client cert)
Subprotocol: midcine.dicom.v1
```

**رسائل من Edge:**
```json
// 1) START_STUDY
{ "type":"START_STUDY", "study_uid":"...", "expected_instances":350, "modality":"CT" }

// 2) INSTANCE_HEADER (تليها رسالة binary)
{ "type":"INSTANCE_HEADER", "meta": {...}, "size_bytes": 524288 }
// → binary frame تالي يحوي pixels

// 3) END_STUDY
{ "type":"END_STUDY", "study_uid":"...", "hash_sha256":"<merkle-root>" }
```

**رسائل من Cloud:**
```json
{ "type":"ACK", "instance_id":"uuid" }
{ "type":"BACKPRESSURE", "pause_ms": 200 }
{ "type":"REJECT", "reason":"INSTANCE_DUPLICATE", "details": {...} }
```

### 2.4 جلب study (للتحقق من Edge)

```
GET /v1/studies/{study_uid}
Response: StudyDetail (نفس النموذج في Reading API §3.3)
```

---

## 3. Reading API (الطبيب / الفني)

### 3.1 المصادقة

```
POST /v1/auth/login
Body: { "email": "...", "password": "...", "totp_code": "123456" }
Response 200: { "access_token": "...", "refresh_token": "...", "expires_in": 900 }

POST /v1/auth/refresh
Body: { "refresh_token": "..." }
```

### 3.2 Worklist

```
GET /v1/worklist?status=unread&modality=CT&priority_max=2&assigned_to=me&limit=50&cursor=...
Auth: Bearer (doctor|technician|owner)
```

**Response 200:**
```json
{
  "items": [
    {
      "study_id": "uuid",
      "study_uid": "1.2.3...",
      "patient": {
        "id": "uuid",
        "mrn": "MRN-2026-0142",
        "display_name": "أ. م.",          // اختصار للخصوصية في القائمة
        "age_at_study": 67,
        "sex": "M"
      },
      "modality": "CT",
      "body_part": "BRAIN",
      "study_date": "2026-06-13",
      "received_at": "2026-06-13T10:42:00Z",
      "triage_priority": 1,                 // 1 = حرج
      "triage_label": "intracranial_hemorrhage",
      "ai_confidence": 0.94,
      "read_status": "unread",
      "assigned_doctor": null,
      "num_instances": 312
    }
  ],
  "next_cursor": "...",
  "limit": 50,
  "total_pending": 28
}
```

### 3.3 تفاصيل الـ Study

```
GET /v1/studies/{study_uid}
```

**Response:**
```json
{
  "study_id": "uuid",
  "study_uid": "1.2.3...",
  "patient": { "...": "PatientFull" },
  "modality": "CT",
  "body_part": "BRAIN",
  "study_date": "2026-06-13",
  "description": "CT BRAIN W/O CONTRAST",
  "clinical_indication": "صداع مفاجئ + ضعف يساري",
  "series": [
    {
      "series_id": "uuid",
      "series_uid": "1.2.3...",
      "description": "AXIAL 5MM",
      "num_instances": 312,
      "wado_url": "/v1/studies/{uid}/series/{uid}/wado"
    }
  ],
  "ai_inferences": [
    {
      "type": "triage",
      "label": "intracranial_hemorrhage",
      "confidence": 0.94,
      "heatmap_url": "/v1/inferences/{id}/heatmap"
    },
    {
      "type": "measurement",
      "data": {
        "hemorrhage_volume_cc": 14.2,
        "midline_shift_mm": 4.1,
        "ventricular_compression": true
      }
    }
  ],
  "report_draft_id": "uuid",
  "report_status": "draft"
}
```

### 3.4 WADO-RS Proxy (للـ OHIF Viewer)

```
GET /v1/studies/{study_uid}/series/{series_uid}/instances/{sop_uid}
Accept: multipart/related; type=application/dicom; transfer-syntax=1.2.840.10008.1.2.4.201
Range: bytes=0-65535       # progressive loading
```

السرفر يدعم QIDO-RS و WADO-RS بالكامل (proxy لـ Orthanc Cloud أو R2 مباشرة).

### 3.5 التقارير

#### إنشاء/تحديث مسودة:
```
PUT /v1/reports/{study_uid}/draft
Body: {
  "technique_ar": "...",
  "findings_ar": "...",
  "impression_ar": "...",
  "recommendations_ar": "...",
  "icd11_codes": ["8B00.0"],
  "ai_acceptance": 78,                  // 0-100
  "base_version": 2                     // optimistic concurrency
}
```

**Response 200:** `{ "report_id": "uuid", "version": 3 }`
**Error 409 `VERSION_CONFLICT`:** إذا `base_version` ≠ النسخة الحالية.

#### توقيع التقرير (final):
```
POST /v1/reports/{report_id}/sign
Body: {
  "signature_method": "session",        // "session" أو "pki"
  "pki_signature_b64": null,            // فقط لو method=pki
  "totp_code": "123456"                 // 2FA إعادة تأكيد قبل التوقيع
}
```

**Response 200:**
```json
{
  "report_id": "uuid",
  "status": "signed",
  "signed_at": "2026-06-13T11:05:23Z",
  "pdf_url": "/v1/reports/{id}/pdf",
  "fhir_pushed": true
}
```

**Errors:**
- 403 `NOT_AUTHORIZED_TO_SIGN`: المستخدم ليس doctor
- 422 `MISSING_IMPRESSION`: حقل إلزامي فارغ
- 401 `INVALID_TOTP`

#### تعديل تقرير موقّع (Amendment):
```
POST /v1/reports/{report_id}/amend
Body: { "reason": "...", "changes": {...} }
```
ينشئ تقريراً جديداً version+1 ويحفظ الأصلي للأثر التاريخي.

### 3.6 LLM Refinement (chat panel)

```
POST /v1/reports/{report_id}/llm/refine
Body: {
  "instruction_ar": "اجعل الانطباع أقصر وأضف توصية بـ CT متابعة بعد 6 ساعات",
  "section": "impression"               // 'technique','findings','impression','recommendations','all'
}
```

**Response 200 (streamed via SSE):**
```
data: {"chunk":"الانطباع: نزيف "}
data: {"chunk":"داخل المتن في الفص "}
…
data: {"done":true,"inference_id":"uuid","tokens":182,"latency_ms":4200}
```

---

## 4. AI API (Internal — service-to-service فقط)

### 4.1 Triage

```
POST /internal/ai/triage
Auth: mTLS (Linkerd)
Body: {
  "study_uid": "1.2.3...",
  "tenant_id": "uuid",
  "modality": "CT",
  "body_part": "BRAIN",
  "instance_uris": ["s3://...", "..."]
}
```

**Response 200:**
```json
{
  "inference_id": "uuid",
  "label": "intracranial_hemorrhage",
  "confidence": 0.94,
  "priority": 1,                        // 1=حرج، 5=روتيني
  "heatmap_uri": "s3://midcine-{tenant}/heatmaps/{inference_id}.png",
  "model": "monai-brain-hemorrhage-v1.2",
  "latency_ms": 8400
}
```

### 4.2 Measurements

```
POST /internal/ai/measurements
Body: {
  "study_uid": "...",
  "task": "ich_quantification",         // 'lung_nodule', 'fracture_detect', ...
  "instance_uris": [...]
}
```

**Response 200:**
```json
{
  "inference_id": "uuid",
  "measurements": {
    "hemorrhage_volume_cc": 14.2,
    "midline_shift_mm": 4.1,
    "ventricular_compression": true,
    "subarachnoid_extension": false
  },
  "annotations_dicom_sr_uri": "s3://...",
  "model": "monai-ich-quant-v0.9"
}
```

---

## 5. LLM API (Internal)

### 5.1 توليد مسودة تقرير

```
POST /internal/llm/draft
Body: {
  "study_uid": "...",
  "tenant_id": "uuid",
  "patient_context": {
    "age": 67,
    "sex": "M",
    "clinical_indication": "صداع مفاجئ + ضعف يساري"
  },
  "modality": "CT",
  "body_part": "BRAIN",
  "ai_measurements": { "...": "نتيجة AI API §4.2" },
  "prior_report_id": null,
  "language": "ar"
}
```

**Response 200:**
```json
{
  "inference_id": "uuid",
  "report_draft": {
    "technique_ar": "...",
    "findings_ar": "...",
    "impression_ar": "...",
    "recommendations_ar": "...",
    "icd11_codes": ["8B00.0"]
  },
  "rag_sources": [
    {"source_type":"icd11","source_id":"8B00.0","snippet":"..."},
    {"source_type":"template","source_id":"egy-rad-soc-2024-CT-brain","snippet":"..."}
  ],
  "tokens": 420,
  "latency_ms": 5600,
  "model": "midcine-llm-v1-acegpt13b-awq",
  "confidence_per_section": {
    "findings": 0.91,
    "impression": 0.87
  }
}
```

### 5.2 Refine (Streamed SSE)

نفس §3.6 لكن داخلياً.

### 5.3 Embedding (للـ RAG indexer)

```
POST /internal/llm/embed
Body: { "texts": ["...", "..."], "model": "bge-m3" }
Response: { "embeddings": [[...1024 floats...], ...], "model": "bge-m3" }
```

---

## 6. FHIR Gateway (R4)

> يخدم تكامل HIS/EMR وتطبيقات SMART on FHIR.

### 6.1 الموارد المدعومة (MVP)

| المورد | العمليات |
|--------|----------|
| `ImagingStudy` | READ, SEARCH, CREATE (من PACS) |
| `DiagnosticReport` | READ, SEARCH (التقارير الموقّعة فقط) |
| `Patient` | READ, SEARCH (محدود بـ scope) |
| `Practitioner` | READ |
| `Observation` (radiology findings) | READ |

### 6.2 أمثلة

```
GET /fhir/R4/DiagnosticReport?subject=Patient/{id}&category=RAD&_sort=-date
GET /fhir/R4/ImagingStudy/{id}
POST /fhir/R4/ImagingStudy        # من PACS الخارجي
```

### 6.3 SMART on FHIR Scopes

| Scope | الوصف |
|-------|------|
| `system/ImagingStudy.read` | قراءة كل الفحوصات (للـ HIS) |
| `system/DiagnosticReport.read` | قراءة التقارير |
| `patient/DiagnosticReport.read` | للمريض، تقاريره فقط (تطبيق مريض) |
| `user/Patient.read` | للطبيب المعالج |

### 6.4 OperationOutcome (error format FHIR)

```json
{
  "resourceType": "OperationOutcome",
  "issue": [{
    "severity": "error",
    "code": "not-found",
    "diagnostics": "ImagingStudy/123 not found",
    "details": {"text": "الفحص غير موجود"}
  }]
}
```

---

## 7. Admin API

### 7.1 Tenants

```
GET    /admin/v1/tenants                          # super_admin فقط
POST   /admin/v1/tenants                          # إنشاء عميل جديد
GET    /admin/v1/tenants/{id}
PATCH  /admin/v1/tenants/{id}                     # تغيير plan, status, max_users
DELETE /admin/v1/tenants/{id}                     # soft-delete (suspend)
```

### 7.2 Users

```
GET    /admin/v1/users?role=doctor
POST   /admin/v1/users                            # invite (يرسل دعوة email)
PATCH  /admin/v1/users/{id}
POST   /admin/v1/users/{id}/reset-password
POST   /admin/v1/users/{id}/revoke-sessions
```

### 7.3 Billing

```
GET  /admin/v1/billing/usage?period=2026-06        # عدد الفحوصات، حدود الباقة
GET  /admin/v1/billing/invoices
POST /admin/v1/billing/invoices/{id}/mark-paid     # super_admin
```

### 7.4 Edge Gateways

```
GET  /admin/v1/gateways
POST /admin/v1/gateways                            # إصدار شهادة mTLS جديدة (Smallstep)
POST /admin/v1/gateways/{id}/revoke
```

---

## 8. أحداث WebSocket للمتصفح (Reading App)

```
WS /v1/realtime
Auth: ?token=<jwt> أو Cookie
Subprotocol: midcine.realtime.v1
```

**رسائل من السرفر للمتصفح:**

| النوع | الحمولة |
|------|--------|
| `WORKLIST_UPDATED` | `{ "tenant_id":"...", "delta": [{added: [...], updated: [...]}]}` |
| `STUDY_AI_READY` | `{ "study_uid":"...", "priority":1, "label":"..." }` |
| `LLM_DRAFT_READY` | `{ "study_uid":"...", "report_id":"..." }` |
| `BROADCAST` | إعلان عام من super_admin |

**ping/pong:** كل 25 ثانية؛ السرفر يقطع بعد 60 ثانية بدون pong.

---

## 9. Pydantic — أساسيات مشتركة (`packages/shared-types/`)

```python
# نماذج تستخدم في كل الخدمات

class ErrorEnvelope(BaseModel):
    code: str
    message_ar: str
    message_en: str
    request_id: str
    details: dict | None = None
    retryable: bool = False

class PageEnvelope(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None
    limit: int

class TenantHeader(BaseModel):       # يتم استخراجها من JWT + middleware
    tenant_id: UUID
    user_id: UUID
    role: Literal['super_admin','owner','doctor','technician','read_only']
    auth_method: Literal['password','oidc','mtls']
```

## 10. Zod — Frontend (`packages/shared-types/ts/`)

```ts
export const StudySummarySchema = z.object({
  study_id: z.string().uuid(),
  study_uid: z.string(),
  patient: z.object({ /* ... */ }),
  modality: z.enum(['CT','MR','CR','DR','US','MG','XA','NM','PT','OT']),
  triage_priority: z.number().int().min(1).max(5),
  triage_label: z.string().nullable(),
  ai_confidence: z.number().min(0).max(1).nullable(),
  read_status: z.enum(['unread','reading','reported','signed']),
  // ...
});
export type StudySummary = z.infer<typeof StudySummarySchema>;
```

---

## 11. Versioning & Deprecation

- المسار `/v1/` ثابت لمدة سنة بعد إطلاق `/v2/`
- التغييرات الـ Breaking تتطلب version جديد
- التغييرات additive (حقول جديدة optional) لا تتطلب version
- Header `X-API-Deprecation: 2027-06-01` يُرسَل قبل 6 أشهر من إيقاف version

---

## 12. ملخص قرارات الـ API

| البند | القرار |
|------|--------|
| Auth (Edge) | mTLS per-tenant |
| Auth (Browser) | OIDC JWT 15min + Refresh 7d rotating |
| Auth (Service-Service) | mTLS via Linkerd |
| Error Envelope | code + message_ar + message_en + request_id |
| Pagination | Cursor-based فقط (لا offset) |
| Idempotency | X-Idempotency-Key على كل POST مع state-mutation، TTL 24h |
| Rate limiting | per-user + per-IP + per-gateway |
| Streaming الـ DICOM | WebSocket subprotocol `midcine.dicom.v1` (v2)؛ multipart REST (v1) |
| LLM streaming | SSE |
| Realtime push | WebSocket `midcine.realtime.v1` |
| FHIR | R4 + SMART on FHIR scopes |
| OpenAPI | 3.1 spec يُولَّد من Pydantic + FastAPI |

</div>
