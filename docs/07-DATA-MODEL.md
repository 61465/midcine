<div dir="rtl" lang="ar">

# 07 — نموذج البيانات (Data Model)

> **مدخلات:** Database Wizard (NEXUS-AI) + قرارات 03-COMPLIANCE.md (RLS, field encryption, audit 7y) + 04-AI.md (pgvector + ParadeDB BM25).
> **المبدأ:** كل جدول multi-tenant بـ `tenant_id` + RLS؛ كل PHI مشفّر؛ كل تعديل يُسجَّل.
> آخر تحديث: 2026-06-13

---

## 1. ERD النصي (نظرة عامة)

```
                ┌──────────┐
                │ tenants  │── 1:N ─┬─ users ──── 1:N ── user_roles
                └────┬─────┘        ├─ patients ─ 1:N ── studies ─ 1:N ── series ─ 1:N ── instances
                     │              ├─ reports   ─ N:1 ── studies
                     │              ├─ ai_inferences ─ N:1 ── studies
                     │              ├─ mtls_certs (للـ Edge Gateways)
                     │              └─ knowledge_chunks (RAG عام per-tenant)
                     │
                     └── audit_log (immutable, RLS) — يشير لكل ما سبق

casbin_rule (RBAC) — لا tenant_id (global rules + tenant filter في policy)
```

---

## 2. الإضافات والمخططات الأساسية

```sql
-- الإضافات المطلوبة
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";        -- pgvector
CREATE EXTENSION IF NOT EXISTS "pg_search";     -- ParadeDB (BM25)
CREATE EXTENSION IF NOT EXISTS "pgaudit";       -- audit الـ DDL/DML

-- مخططات منطقية
CREATE SCHEMA IF NOT EXISTS midcine;            -- جداول الأعمال
CREATE SCHEMA IF NOT EXISTS midcine_audit;      -- جداول التدقيق
CREATE SCHEMA IF NOT EXISTS midcine_rbac;       -- Casbin
SET search_path TO midcine, public;
```

---

## 3. جداول الأعمال

### 3.1 `tenants` — العملاء (مركز/مستشفى/سلسلة)

```sql
CREATE TABLE midcine.tenants (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug            VARCHAR(64)     UNIQUE NOT NULL,                -- نطاق فرعي
    name_ar         VARCHAR(255)    NOT NULL,
    name_en         VARCHAR(255),
    plan            VARCHAR(32)     NOT NULL CHECK (plan IN ('solo','center','chain','enterprise')),
    country_code    CHAR(2)         NOT NULL DEFAULT 'EG',
    timezone        VARCHAR(64)     NOT NULL DEFAULT 'Africa/Cairo',
    max_studies_mo  INTEGER         NOT NULL DEFAULT 500,
    max_users       INTEGER         NOT NULL DEFAULT 1,
    ai_features     JSONB           NOT NULL DEFAULT '{"triage":false,"llm":false,"chest_xray":false}'::jsonb,
    encryption_key_id VARCHAR(128),                                 -- مرجع داخل Vault
    status          VARCHAR(16)     NOT NULL DEFAULT 'active' CHECK (status IN ('trial','active','suspended','closed')),
    trial_ends_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX tenants_status_idx ON midcine.tenants (status) WHERE status != 'closed';
```

### 3.2 `users` — الأطباء والفنيون والإداريون

```sql
CREATE TABLE midcine.users (
    id              UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id       UUID            NOT NULL REFERENCES midcine.tenants(id) ON DELETE RESTRICT,
    email_hash      BYTEA           NOT NULL,                       -- HMAC-SHA256 للبحث
    email_encrypted BYTEA           NOT NULL,                       -- AES-256-GCM
    phone_encrypted BYTEA,
    full_name_ar    VARCHAR(255)    NOT NULL,
    full_name_en    VARCHAR(255),
    role            VARCHAR(32)     NOT NULL CHECK (role IN ('super_admin','owner','doctor','technician','read_only')),
    license_number  VARCHAR(64),                                    -- رقم نقابة
    specialty       VARCHAR(64),                                    -- 'radiology', 'neuroradiology', ...
    password_hash   VARCHAR(255),                                   -- Argon2id؛ NULL إن OIDC
    oidc_subject    VARCHAR(255),
    totp_secret_enc BYTEA,                                          -- 2FA مفعّل
    last_login_at   TIMESTAMPTZ,
    status          VARCHAR(16)     NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, email_hash)
);
CREATE INDEX users_tenant_role_idx ON midcine.users (tenant_id, role) WHERE status = 'active';
```

### 3.3 `patients` — المرضى (PHI مشفّر على مستوى الحقل)

```sql
CREATE TABLE midcine.patients (
    id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID        NOT NULL REFERENCES midcine.tenants(id),
    mrn                 VARCHAR(64) NOT NULL,                       -- Medical Record Number داخلي
    name_encrypted      BYTEA       NOT NULL,                       -- AES-256-GCM
    name_search_hash    BYTEA       NOT NULL,                       -- AES-256-SIV deterministic للبحث
    national_id_hash    BYTEA,                                      -- HMAC-SHA256
    national_id_enc     BYTEA,                                      -- AES-256-GCM
    dob                 DATE,                                       -- ليس مشفراً لأنه دلالي ضعيف
    sex                 CHAR(1)     CHECK (sex IN ('M','F','U')),
    phone_encrypted     BYTEA,
    referring_physician VARCHAR(255),
    insurance_provider  VARCHAR(128),                               -- 'CHI' للتأمين الشامل المصري
    insurance_policy_no VARCHAR(64),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,                                -- soft delete (GDPR right to erasure)
    UNIQUE (tenant_id, mrn)
);
CREATE INDEX patients_search_idx ON midcine.patients (tenant_id, name_search_hash) WHERE deleted_at IS NULL;
CREATE INDEX patients_natid_idx ON midcine.patients (tenant_id, national_id_hash) WHERE national_id_hash IS NOT NULL;
```

### 3.4 `studies` — الفحوصات (DICOM Study)

```sql
CREATE TABLE midcine.studies (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID            NOT NULL REFERENCES midcine.tenants(id),
    patient_id          UUID            NOT NULL REFERENCES midcine.patients(id),
    study_instance_uid  VARCHAR(128)    NOT NULL UNIQUE,            -- DICOM (0020,000D)
    accession_number    VARCHAR(64),
    study_date          DATE            NOT NULL,
    study_time          TIME,
    modality            VARCHAR(16)     NOT NULL,                   -- 'CT','MR','CR','US','MG'
    body_part           VARCHAR(64),                                -- 'BRAIN','CHEST','KNEE'
    description         TEXT,
    referring_physician VARCHAR(255),
    performing_physician VARCHAR(255),
    clinical_indication TEXT,                                       -- مؤشرات سريرية
    num_series          INTEGER         NOT NULL DEFAULT 0,
    num_instances       INTEGER         NOT NULL DEFAULT 0,
    size_bytes          BIGINT          NOT NULL DEFAULT 0,
    storage_location    VARCHAR(64)     NOT NULL DEFAULT 'edge' CHECK (storage_location IN ('edge','cloud','both')),
    edge_gateway_id     UUID,                                       -- مرجع mtls_certs.id
    triage_priority     SMALLINT        NOT NULL DEFAULT 5 CHECK (triage_priority BETWEEN 1 AND 5),
    triage_status       VARCHAR(16)     NOT NULL DEFAULT 'pending' CHECK (triage_status IN ('pending','running','done','failed','skipped')),
    read_status         VARCHAR(16)     NOT NULL DEFAULT 'unread' CHECK (read_status IN ('unread','reading','reported','signed')),
    assigned_doctor_id  UUID            REFERENCES midcine.users(id),
    received_at         TIMESTAMPTZ     NOT NULL DEFAULT now(),
    ai_completed_at     TIMESTAMPTZ,
    reported_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX studies_worklist_idx ON midcine.studies (tenant_id, read_status, triage_priority, received_at DESC);
CREATE INDEX studies_doctor_idx ON midcine.studies (assigned_doctor_id, read_status) WHERE assigned_doctor_id IS NOT NULL;
CREATE INDEX studies_patient_idx ON midcine.studies (patient_id, study_date DESC);
CREATE INDEX studies_modality_idx ON midcine.studies (tenant_id, modality, study_date DESC);
```

### 3.5 `series` و `instances`

```sql
CREATE TABLE midcine.series (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID            NOT NULL REFERENCES midcine.tenants(id),
    study_id            UUID            NOT NULL REFERENCES midcine.studies(id) ON DELETE CASCADE,
    series_instance_uid VARCHAR(128)    NOT NULL UNIQUE,            -- DICOM (0020,000E)
    series_number       INTEGER,
    modality            VARCHAR(16),
    description         TEXT,
    num_instances       INTEGER         NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX series_study_idx ON midcine.series (study_id, series_number);

CREATE TABLE midcine.instances (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID            NOT NULL REFERENCES midcine.tenants(id),
    series_id           UUID            NOT NULL REFERENCES midcine.series(id) ON DELETE CASCADE,
    sop_instance_uid    VARCHAR(128)    NOT NULL UNIQUE,            -- DICOM (0008,0018)
    instance_number     INTEGER,
    rows                INTEGER,
    cols                INTEGER,
    storage_uri         VARCHAR(512)    NOT NULL,                   -- s3://midcine-{tenant}/studies/{study_uid}/series/{uid}/{sop_uid}.dcm
    storage_size_bytes  BIGINT,
    transfer_syntax     VARCHAR(64),                                -- '1.2.840.10008.1.2.4.201' للـ HTJ2K
    hash_sha256         BYTEA           NOT NULL,                   -- للتحقق من التكامل
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX instances_series_idx ON midcine.instances (series_id, instance_number);
```

### 3.6 `reports` — التقارير الطبية

```sql
CREATE TABLE midcine.reports (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID            NOT NULL REFERENCES midcine.tenants(id),
    study_id            UUID            NOT NULL REFERENCES midcine.studies(id),
    version             INTEGER         NOT NULL DEFAULT 1,
    status              VARCHAR(16)     NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','signed','amended','retracted')),

    technique_ar        TEXT,                                       -- التقنية المستخدمة (مشفّر إن signed)
    findings_ar         TEXT,                                       -- النتائج
    impression_ar       TEXT,                                       -- الانطباع
    recommendations_ar  TEXT,                                       -- التوصيات
    icd11_codes         TEXT[],                                     -- ['8B00.0','8B11']

    body_encrypted      BYTEA,                                      -- نسخة مشفّرة كاملة (للحفظ القانوني)
    body_hash           BYTEA           NOT NULL,                   -- SHA-256 للنص الكامل وقت التوقيع

    ai_draft_id         UUID,                                       -- مرجع ai_inferences.id (LLM draft)
    ai_acceptance       SMALLINT        CHECK (ai_acceptance BETWEEN 0 AND 100),  -- % قبول الطبيب لاقتراح LLM

    author_user_id      UUID            NOT NULL REFERENCES midcine.users(id),
    signed_by_user_id   UUID            REFERENCES midcine.users(id),
    signed_at           TIMESTAMPTZ,
    signature_alg       VARCHAR(32),                                -- 'Ed25519' (TOKEN جلسة) أو 'PKI' (مفتاح طبيب)
    signature_bytes     BYTEA,                                      -- التوقيع الرقمي
    pdf_storage_uri     VARCHAR(512),                               -- s3://...

    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),

    UNIQUE (study_id, version)
);
CREATE INDEX reports_study_idx ON midcine.reports (study_id, version DESC);
CREATE INDEX reports_signed_idx ON midcine.reports (tenant_id, signed_at DESC) WHERE status = 'signed';
```

### 3.7 `ai_inferences` — كل استدعاء AI/LLM

```sql
CREATE TABLE midcine.ai_inferences (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID            NOT NULL REFERENCES midcine.tenants(id),
    study_id            UUID            REFERENCES midcine.studies(id),
    inference_type      VARCHAR(32)     NOT NULL CHECK (inference_type IN ('triage','measurement','llm_draft','llm_refine','embedding')),
    model_name          VARCHAR(128)    NOT NULL,                   -- 'monai-brain-hemorrhage-v1.2', 'acegpt-13b-awq-midcine-v1'
    model_version       VARCHAR(32)     NOT NULL,
    model_hash          VARCHAR(128),                               -- SHA-256 لملف النموذج
    input_summary       JSONB,                                      -- لا PHI خام
    output              JSONB           NOT NULL,                   -- النتيجة (قياسات / نص تقرير / vector)
    confidence          NUMERIC(5,4),                               -- 0.0000 - 1.0000
    latency_ms          INTEGER,
    gpu_node            VARCHAR(64),
    status              VARCHAR(16)     NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','failed','timeout')),
    error_message       TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX ai_inferences_study_idx ON midcine.ai_inferences (study_id, inference_type, created_at DESC);
CREATE INDEX ai_inferences_model_idx ON midcine.ai_inferences (model_name, model_version, created_at DESC);
```

### 3.8 `knowledge_chunks` — قاعدة معرفة RAG

```sql
CREATE TABLE midcine.knowledge_chunks (
    id              BIGSERIAL       PRIMARY KEY,
    tenant_id       UUID            REFERENCES midcine.tenants(id),  -- NULL = عام لكل tenant
    source_type     VARCHAR(32)     NOT NULL CHECK (source_type IN ('icd11','radiopaedia','template','past_report','guideline')),
    source_id       VARCHAR(128)    NOT NULL,
    chunk_idx       INTEGER         NOT NULL DEFAULT 0,
    content_ar      TEXT            NOT NULL,
    content_en      TEXT,
    metadata        JSONB,
    embedding       VECTOR(1024),                                   -- bge-m3
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- HNSW أسرع من IVFFlat لـ semantic search
CREATE INDEX knowledge_emb_hnsw ON midcine.knowledge_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ParadeDB BM25 للعربية (ICU tokenizer)
CREATE INDEX knowledge_bm25 ON midcine.knowledge_chunks
    USING bm25 (id, content_ar, source_type)
    WITH (key_field='id', text_fields='{"content_ar": {"tokenizer": {"type": "icu"}}}');

CREATE INDEX knowledge_source_idx ON midcine.knowledge_chunks (source_type, source_id);
```

### 3.9 `mtls_certs` — شهادات Edge Gateway

```sql
CREATE TABLE midcine.mtls_certs (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID            NOT NULL REFERENCES midcine.tenants(id),
    gateway_name        VARCHAR(128)    NOT NULL,                   -- 'cairo-branch-01'
    common_name         VARCHAR(255)    NOT NULL UNIQUE,            -- 'edge-{slug}-{seq}.midcine.io'
    cert_pem            TEXT            NOT NULL,                   -- الشهادة العامة فقط (المفتاح الخاص لدى Gateway)
    cert_fingerprint    VARCHAR(128)    NOT NULL UNIQUE,            -- SHA-256
    issued_at           TIMESTAMPTZ     NOT NULL,
    expires_at          TIMESTAMPTZ     NOT NULL,
    revoked_at          TIMESTAMPTZ,
    last_seen_at        TIMESTAMPTZ,
    last_seen_ip        INET,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX mtls_active_idx ON midcine.mtls_certs (tenant_id) WHERE revoked_at IS NULL AND expires_at > now();
```

---

## 4. جداول التدقيق (Audit)

### 4.1 `audit_log` — غير قابل للتعديل

```sql
CREATE TABLE midcine_audit.audit_log (
    id              BIGSERIAL       PRIMARY KEY,
    ts              TIMESTAMPTZ     NOT NULL DEFAULT clock_timestamp(),
    request_id      UUID            NOT NULL,
    tenant_id       UUID,                                           -- NULL للأحداث الجذرية
    actor_user_id   UUID,
    actor_role      VARCHAR(32),
    actor_ip        INET,
    actor_ua        TEXT,
    auth_method     VARCHAR(16)     CHECK (auth_method IN ('password','oidc','mtls','system')),
    action          VARCHAR(64)     NOT NULL,                       -- 'view_study','sign_report','ai_inference',...
    resource_type   VARCHAR(32)     NOT NULL,
    resource_id     VARCHAR(128)    NOT NULL,
    patient_id_hash VARCHAR(64),                                    -- لا الـ ID الخام
    outcome         VARCHAR(16)     NOT NULL CHECK (outcome IN ('success','denied','error')),
    extra           JSONB
);
-- partitioning شهري لأن الحجم سينمو سريعاً
CREATE INDEX audit_tenant_ts_idx ON midcine_audit.audit_log (tenant_id, ts DESC);
CREATE INDEX audit_actor_ts_idx ON midcine_audit.audit_log (actor_user_id, ts DESC);
CREATE INDEX audit_resource_idx ON midcine_audit.audit_log (resource_type, resource_id);

-- منع التعديل والحذف بـ trigger
CREATE OR REPLACE FUNCTION midcine_audit.deny_modify() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON midcine_audit.audit_log
    FOR EACH ROW EXECUTE FUNCTION midcine_audit.deny_modify();
CREATE TRIGGER audit_no_delete BEFORE DELETE ON midcine_audit.audit_log
    FOR EACH ROW EXECUTE FUNCTION midcine_audit.deny_modify();

-- حفظ 7 سنوات (HIPAA 164.316)؛ daily snapshot لـ R2 WORM في pipeline منفصل
```

---

## 5. جدول Casbin RBAC

```sql
CREATE TABLE midcine_rbac.casbin_rule (
    id      BIGSERIAL PRIMARY KEY,
    ptype   VARCHAR(8)  NOT NULL,           -- 'p' policy أو 'g' grouping
    v0      VARCHAR(256),                   -- subject (role أو user)
    v1      VARCHAR(256),                   -- object (resource pattern)
    v2      VARCHAR(256),                   -- action
    v3      VARCHAR(256),                   -- effect ('allow'/'deny') أو attr
    v4      VARCHAR(256),
    v5      VARCHAR(256)
);
CREATE INDEX casbin_ptype_idx ON midcine_rbac.casbin_rule (ptype, v0);
```

---

## 6. Row-Level Security (RLS)

كل جدول يحمل `tenant_id` يجب أن يفعّل RLS. التطبيق يضع `SET LOCAL midcine.current_tenant = '<uuid>'` في بداية كل transaction (من middleware FastAPI).

```sql
-- مثال على دالة مساعِدة
CREATE OR REPLACE FUNCTION midcine.current_tenant() RETURNS UUID AS $$
    SELECT current_setting('midcine.current_tenant', true)::UUID;
$$ LANGUAGE sql STABLE;

-- تفعيل RLS على جدول رئيسي
ALTER TABLE midcine.studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE midcine.studies FORCE ROW LEVEL SECURITY;     -- يطبّق حتى على owner

CREATE POLICY studies_tenant_isolation ON midcine.studies
    USING (tenant_id = midcine.current_tenant())
    WITH CHECK (tenant_id = midcine.current_tenant());

-- super_admin يتجاوز
CREATE POLICY studies_super_admin ON midcine.studies
    USING (current_setting('midcine.role', true) = 'super_admin');
```

> **التكرار الإلزامي:** نفس النمط لكل من users, patients, series, instances, reports, ai_inferences, mtls_certs, audit_log.

---

## 7. التشفير على مستوى الحقل

```sql
-- 7.1 مفاتيح TLS at-rest (تأتي من Vault Transit Engine؛ ليست مخزنة في DB)
-- التطبيق يستدعي Vault لتشفير/فك التشفير

-- 7.2 دوال مساعدة للبحث الـ deterministic (للأسماء)
-- nb: نخزّن HMAC-SHA256 للبحث الـ exact-match
CREATE OR REPLACE FUNCTION midcine.search_hash(plaintext TEXT, key BYTEA) RETURNS BYTEA AS $$
    SELECT hmac(lower(trim(plaintext)), key, 'sha256');
$$ LANGUAGE sql IMMUTABLE;

-- 7.3 سياسة الحقول
-- patients.name_encrypted:        AES-256-GCM (random IV) — لا بحث جزئي
-- patients.name_search_hash:      HMAC(name_normalized, tenant_key) — للبحث exact
-- patients.national_id_enc:       AES-256-GCM
-- patients.national_id_hash:      HMAC للبحث
-- patients.phone_encrypted:       AES-256-GCM
-- users.email_encrypted/hash:     نفس النمط
-- reports.body_encrypted:         AES-256-GCM، يُستخدم للأرشيف فقط (النص الواضح في الحقول _ar للعرض السريع داخل tenant)
```

> **ملاحظة قانونية:** في إصدار GDPR strict، حتى الحقول _ar للتقرير يجب تشفيرها at-rest وفك تشفيرها داخل ذاكرة التطبيق فقط. للـ MVP نعتمد على TDE الافتراضي + RLS، ونرفع للـ field-level encryption في Sprint 7.

---

## 8. مخطط Redis Streams

| Stream | المُنتِج | المُستهلِك | الـ payload |
|--------|---------|------------|-------------|
| `studies:new` | Ingestion API بعد استلام study كاملة | AI Worker (consumer group `ai-triage`) | `{study_uid, tenant_id, modality, body_part, num_instances, received_at}` |
| `ai:inference` | AI Worker بعد كل استنتاج | LLM Service (consumer group `llm-draft`) | `{study_uid, inference_id, type, output_summary, confidence}` |
| `llm:report` | LLM Service بعد توليد المسودة | Notification Service + Web (WS push) | `{study_uid, report_id, draft_chars, latency_ms}` |
| `doctor:signed` | Reading API عند توقيع التقرير | FHIR Gateway + Audit shipper | `{report_id, study_uid, signed_by, signed_at, icd11_codes}` |
| `audit:tail` | كل خدمة (async fire-and-forget) | Audit shipper → Loki + R2 WORM | سجل بنفس شكل `audit_log` |

**ضوابط:**
- `MAXLEN ~ 100000` لكل stream؛ التقليم التلقائي بـ XADD MAXLEN ~ N
- `XGROUP CREATE` مع `MKSTREAM`؛ كل مستهلك يستخدم Pending Entries List + claim للتعافي
- Idempotency: المستهلك يتحقق من `(study_uid, inference_type)` قبل إعادة المعالجة

---

## 9. سياسات النمو والتقسيم

| الجدول | استراتيجية |
|--------|------------|
| `audit_log` | Partition شهرياً (`RANGE` على `ts`)، إسقاط partitions >7 سنوات بعد التحقق من R2 |
| `instances` | Partition شهرياً على `created_at` بعد 100M صف |
| `ai_inferences` | Partition شهرياً بعد 50M صف |
| `knowledge_chunks` | لا partition قبل 10M chunks |

---

## 10. الصلاحيات (Database Roles)

```sql
-- 4 أدوار للـ DB (مختلفة عن RBAC للتطبيق):
CREATE ROLE midcine_app NOLOGIN;                  -- التطبيق الرئيسي (RLS مفروض)
CREATE ROLE midcine_readonly NOLOGIN;             -- BI/Analytics
CREATE ROLE midcine_audit_writer NOLOGIN;         -- يكتب فقط في audit_log
CREATE ROLE midcine_migrator NOLOGIN;             -- DDL فقط (CI/CD)

GRANT USAGE ON SCHEMA midcine TO midcine_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA midcine TO midcine_app;
GRANT SELECT ON ALL TABLES IN SCHEMA midcine TO midcine_readonly;
GRANT INSERT ON midcine_audit.audit_log TO midcine_audit_writer;
```

---

## 11. ملخص قرارات Data Model

| البند | القرار |
|------|--------|
| DB | PostgreSQL 16 + pgvector + ParadeDB + pgcrypto + pgaudit |
| Multi-tenancy | `tenant_id` في كل جدول + RLS forced |
| تشفير الحقول | AES-256-GCM (random) + AES-256-SIV (deterministic للبحث) |
| Key management | Vault Transit Engine؛ المفتاح لا يدخل DB |
| Audit | جدول append-only + trigger يمنع UPDATE/DELETE + Daily WORM snapshot |
| Vector index | HNSW (m=16, ef=64) على bge-m3 1024-dim |
| BM25 index | ParadeDB pg_search مع ICU tokenizer |
| Casbin | جدول `casbin_rule` في schema منفصل |
| Partitioning | شهري على audit + instances + ai_inferences |
| Queue | Redis Streams (5 streams) + consumer groups |

</div>
