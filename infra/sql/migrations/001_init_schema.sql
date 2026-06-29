-- midcine 001 — extensions + schemas + tables
-- يُشغَّل تلقائياً عند أول إقلاع لـ Postgres (volume mount لـ /docker-entrypoint-initdb.d)

\set ON_ERROR_STOP on
\c midcine

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";
-- ParadeDB pg_search متاح في image paradedb/paradedb
CREATE EXTENSION IF NOT EXISTS "pg_search";

CREATE SCHEMA IF NOT EXISTS midcine;
CREATE SCHEMA IF NOT EXISTS midcine_audit;
CREATE SCHEMA IF NOT EXISTS midcine_rbac;

-- مستخدم التطبيق (لـ docker compose env)
DO $$
DECLARE
    app_user TEXT := current_setting('app.user', true);
    app_password TEXT := current_setting('app.password', true);
BEGIN
    IF app_user IS NULL THEN app_user := 'midcine_app'; END IF;
    IF app_password IS NULL THEN app_password := 'changeme_dev_only'; END IF;
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = app_user) THEN
        EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', app_user, app_password);
    END IF;
END $$;

GRANT USAGE ON SCHEMA midcine, midcine_audit, midcine_rbac TO midcine_app;

-- قاعدة بيانات Orthanc منفصلة (نفس instance)
CREATE DATABASE orthanc;

SET search_path TO midcine, public;

-- 1) tenants
CREATE TABLE midcine.tenants (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug                VARCHAR(64)     UNIQUE NOT NULL,
    name_ar             VARCHAR(255)    NOT NULL,
    name_en             VARCHAR(255),
    plan                VARCHAR(32)     NOT NULL CHECK (plan IN ('solo','center','chain','enterprise')),
    country_code        CHAR(2)         NOT NULL DEFAULT 'EG',
    timezone            VARCHAR(64)     NOT NULL DEFAULT 'Africa/Cairo',
    max_studies_mo      INTEGER         NOT NULL DEFAULT 500,
    max_users           INTEGER         NOT NULL DEFAULT 1,
    ai_features         JSONB           NOT NULL DEFAULT '{"triage":true,"llm":true,"chest_xray":false}'::jsonb,
    encryption_key_id   VARCHAR(128),
    status              VARCHAR(16)     NOT NULL DEFAULT 'active' CHECK (status IN ('trial','active','suspended','closed')),
    trial_ends_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- 2) users
CREATE TABLE midcine.users (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID            NOT NULL REFERENCES midcine.tenants(id) ON DELETE RESTRICT,
    email_hash          BYTEA           NOT NULL,
    email_encrypted     BYTEA           NOT NULL,
    phone_encrypted     BYTEA,
    full_name_ar        VARCHAR(255)    NOT NULL,
    full_name_en        VARCHAR(255),
    role                VARCHAR(32)     NOT NULL CHECK (role IN ('super_admin','owner','doctor','technician','read_only')),
    license_number      VARCHAR(64),
    specialty           VARCHAR(64),
    password_hash       VARCHAR(255),
    oidc_subject        VARCHAR(255),
    totp_secret_enc     BYTEA,
    last_login_at       TIMESTAMPTZ,
    status              VARCHAR(16)     NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, email_hash)
);
CREATE INDEX users_tenant_role_idx ON midcine.users (tenant_id, role) WHERE status = 'active';

-- 3) patients
CREATE TABLE midcine.patients (
    id                      UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID        NOT NULL REFERENCES midcine.tenants(id),
    mrn                     VARCHAR(64) NOT NULL,
    name_encrypted          BYTEA       NOT NULL,
    name_search_hash        BYTEA       NOT NULL,
    national_id_hash        BYTEA,
    national_id_enc         BYTEA,
    dob                     DATE,
    sex                     CHAR(1)     CHECK (sex IN ('M','F','U')),
    phone_encrypted         BYTEA,
    referring_physician     VARCHAR(255),
    insurance_provider      VARCHAR(128),
    insurance_policy_no     VARCHAR(64),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ,
    UNIQUE (tenant_id, mrn)
);
CREATE INDEX patients_search_idx ON midcine.patients (tenant_id, name_search_hash) WHERE deleted_at IS NULL;

-- 4) studies
CREATE TABLE midcine.studies (
    id                      UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID            NOT NULL REFERENCES midcine.tenants(id),
    patient_id              UUID            NOT NULL REFERENCES midcine.patients(id),
    study_instance_uid      VARCHAR(128)    NOT NULL UNIQUE,
    accession_number        VARCHAR(64),
    study_date              DATE            NOT NULL,
    study_time              TIME,
    modality                VARCHAR(16)     NOT NULL,
    body_part               VARCHAR(64),
    description             TEXT,
    referring_physician     VARCHAR(255),
    performing_physician    VARCHAR(255),
    clinical_indication     TEXT,
    num_series              INTEGER         NOT NULL DEFAULT 0,
    num_instances           INTEGER         NOT NULL DEFAULT 0,
    size_bytes              BIGINT          NOT NULL DEFAULT 0,
    storage_location        VARCHAR(64)     NOT NULL DEFAULT 'cloud' CHECK (storage_location IN ('edge','cloud','both')),
    edge_gateway_id         UUID,
    triage_priority         SMALLINT        NOT NULL DEFAULT 5 CHECK (triage_priority BETWEEN 1 AND 5),
    triage_status           VARCHAR(16)     NOT NULL DEFAULT 'pending' CHECK (triage_status IN ('pending','running','done','failed','skipped')),
    triage_label            VARCHAR(64),
    ai_confidence           NUMERIC(5,4),
    read_status             VARCHAR(16)     NOT NULL DEFAULT 'unread' CHECK (read_status IN ('unread','reading','reported','signed')),
    assigned_doctor_id      UUID            REFERENCES midcine.users(id),
    received_at             TIMESTAMPTZ     NOT NULL DEFAULT now(),
    ai_completed_at         TIMESTAMPTZ,
    reported_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX studies_worklist_idx ON midcine.studies (tenant_id, read_status, triage_priority, received_at DESC);
CREATE INDEX studies_doctor_idx ON midcine.studies (assigned_doctor_id, read_status) WHERE assigned_doctor_id IS NOT NULL;
CREATE INDEX studies_patient_idx ON midcine.studies (patient_id, study_date DESC);

-- 5) series + instances
CREATE TABLE midcine.series (
    id                      UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID            NOT NULL REFERENCES midcine.tenants(id),
    study_id                UUID            NOT NULL REFERENCES midcine.studies(id) ON DELETE CASCADE,
    series_instance_uid     VARCHAR(128)    NOT NULL UNIQUE,
    series_number           INTEGER,
    modality                VARCHAR(16),
    description             TEXT,
    num_instances           INTEGER         NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX series_study_idx ON midcine.series (study_id, series_number);

CREATE TABLE midcine.instances (
    id                      UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID            NOT NULL REFERENCES midcine.tenants(id),
    series_id               UUID            NOT NULL REFERENCES midcine.series(id) ON DELETE CASCADE,
    sop_instance_uid        VARCHAR(128)    NOT NULL UNIQUE,
    instance_number         INTEGER,
    rows                    INTEGER,
    cols                    INTEGER,
    storage_uri             VARCHAR(512)    NOT NULL,
    storage_size_bytes      BIGINT,
    transfer_syntax         VARCHAR(64),
    hash_sha256             BYTEA           NOT NULL,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX instances_series_idx ON midcine.instances (series_id, instance_number);

-- 6) reports
CREATE TABLE midcine.reports (
    id                      UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID            NOT NULL REFERENCES midcine.tenants(id),
    study_id                UUID            NOT NULL REFERENCES midcine.studies(id),
    version                 INTEGER         NOT NULL DEFAULT 1,
    status                  VARCHAR(16)     NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','signed','amended','retracted')),
    technique_ar            TEXT,
    findings_ar             TEXT,
    impression_ar           TEXT,
    recommendations_ar      TEXT,
    icd11_codes             TEXT[]          DEFAULT '{}',
    body_encrypted          BYTEA,
    body_hash               BYTEA,
    ai_draft_id             UUID,
    ai_acceptance           SMALLINT        CHECK (ai_acceptance BETWEEN 0 AND 100),
    author_user_id          UUID            REFERENCES midcine.users(id),
    signed_by_user_id       UUID            REFERENCES midcine.users(id),
    signed_at               TIMESTAMPTZ,
    signature_alg           VARCHAR(32),
    signature_bytes         BYTEA,
    pdf_storage_uri         VARCHAR(512),
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (study_id, version)
);
CREATE INDEX reports_study_idx ON midcine.reports (study_id, version DESC);
CREATE INDEX reports_signed_idx ON midcine.reports (tenant_id, signed_at DESC) WHERE status = 'signed';

-- 7) ai_inferences
CREATE TABLE midcine.ai_inferences (
    id                      UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID            NOT NULL REFERENCES midcine.tenants(id),
    study_id                UUID            REFERENCES midcine.studies(id),
    inference_type          VARCHAR(32)     NOT NULL CHECK (inference_type IN ('triage','measurement','llm_draft','llm_refine','embedding')),
    model_name              VARCHAR(128)    NOT NULL,
    model_version           VARCHAR(32)     NOT NULL,
    model_hash              VARCHAR(128),
    input_summary           JSONB,
    output                  JSONB           NOT NULL,
    confidence              NUMERIC(5,4),
    latency_ms              INTEGER,
    gpu_node                VARCHAR(64),
    status                  VARCHAR(16)     NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','failed','timeout')),
    error_message           TEXT,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX ai_inferences_study_idx ON midcine.ai_inferences (study_id, inference_type, created_at DESC);

-- 8) knowledge_chunks (RAG)
CREATE TABLE midcine.knowledge_chunks (
    id                      BIGSERIAL       PRIMARY KEY,
    tenant_id               UUID            REFERENCES midcine.tenants(id),
    source_type             VARCHAR(32)     NOT NULL CHECK (source_type IN ('icd11','radiopaedia','template','past_report','guideline')),
    source_id               VARCHAR(128)    NOT NULL,
    chunk_idx               INTEGER         NOT NULL DEFAULT 0,
    content_ar              TEXT            NOT NULL,
    content_en              TEXT,
    metadata                JSONB,
    embedding               VECTOR(384),    -- bge-small-en-v1.5 للـ prototype
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_emb_hnsw ON midcine.knowledge_chunks
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
-- BM25 index: نُنشئه بعد seed لتفادي مشاكل ParadeDB في init
-- CREATE INDEX knowledge_bm25 ON midcine.knowledge_chunks
--     USING bm25 (id, content_ar) WITH (key_field='id');
CREATE INDEX knowledge_source_idx ON midcine.knowledge_chunks (source_type, source_id);

-- 9) mtls_certs
CREATE TABLE midcine.mtls_certs (
    id                      UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id               UUID            NOT NULL REFERENCES midcine.tenants(id),
    gateway_name            VARCHAR(128)    NOT NULL,
    common_name             VARCHAR(255)    NOT NULL UNIQUE,
    cert_pem                TEXT            NOT NULL,
    cert_fingerprint        VARCHAR(128)    NOT NULL UNIQUE,
    issued_at               TIMESTAMPTZ     NOT NULL,
    expires_at              TIMESTAMPTZ     NOT NULL,
    revoked_at              TIMESTAMPTZ,
    last_seen_at            TIMESTAMPTZ,
    last_seen_ip            INET,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

-- 10) audit_log
CREATE TABLE midcine_audit.audit_log (
    id                      BIGSERIAL       PRIMARY KEY,
    ts                      TIMESTAMPTZ     NOT NULL DEFAULT clock_timestamp(),
    request_id              UUID            NOT NULL,
    tenant_id               UUID,
    actor_user_id           UUID,
    actor_role              VARCHAR(32),
    actor_ip                INET,
    actor_ua                TEXT,
    auth_method             VARCHAR(16)     CHECK (auth_method IN ('password','oidc','mtls','system')),
    action                  VARCHAR(64)     NOT NULL,
    resource_type           VARCHAR(32)     NOT NULL,
    resource_id             VARCHAR(128)    NOT NULL,
    patient_id_hash         VARCHAR(64),
    outcome                 VARCHAR(16)     NOT NULL CHECK (outcome IN ('success','denied','error')),
    extra                   JSONB
);
CREATE INDEX audit_tenant_ts_idx ON midcine_audit.audit_log (tenant_id, ts DESC);
CREATE INDEX audit_actor_ts_idx ON midcine_audit.audit_log (actor_user_id, ts DESC);
CREATE INDEX audit_resource_idx ON midcine_audit.audit_log (resource_type, resource_id);

-- 11) casbin_rule
CREATE TABLE midcine_rbac.casbin_rule (
    id      BIGSERIAL PRIMARY KEY,
    ptype   VARCHAR(8)  NOT NULL,
    v0      VARCHAR(256),
    v1      VARCHAR(256),
    v2      VARCHAR(256),
    v3      VARCHAR(256),
    v4      VARCHAR(256),
    v5      VARCHAR(256)
);
CREATE INDEX casbin_ptype_idx ON midcine_rbac.casbin_rule (ptype, v0);

-- صلاحيات على كل ما سبق
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA midcine TO midcine_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA midcine_audit TO midcine_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA midcine_rbac TO midcine_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA midcine TO midcine_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA midcine_audit TO midcine_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA midcine_rbac TO midcine_app;
