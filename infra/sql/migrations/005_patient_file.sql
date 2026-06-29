-- midcine 005 — patient file: doctors, QR, attachments, history, consent, notifications
\c midcine
SET search_path TO midcine, public;

-- 1) ربط المريض بأطبائه (تعدد أطباء)
CREATE TABLE midcine.patient_doctors (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID            NOT NULL REFERENCES midcine.tenants(id),
    patient_id          UUID            NOT NULL REFERENCES midcine.patients(id) ON DELETE CASCADE,
    user_id             UUID            REFERENCES midcine.users(id),
    -- لو الطبيب خارج النظام (طبيب علاج خاص)
    external_name       VARCHAR(255),
    external_phone_enc  BYTEA,                                  -- مشفّر (مفتاح tenant)
    external_whatsapp   VARCHAR(32),                            -- E.164 بدون +
    relation            VARCHAR(32)     NOT NULL DEFAULT 'treating' CHECK (relation IN ('treating','referring','consulting','reading')),
    can_view_all_studies BOOLEAN        NOT NULL DEFAULT TRUE,
    notify_on_signed    BOOLEAN         NOT NULL DEFAULT TRUE,
    notify_channel      VARCHAR(16)     NOT NULL DEFAULT 'whatsapp' CHECK (notify_channel IN ('whatsapp','sms','email','none')),
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    UNIQUE (patient_id, user_id, relation),
    CHECK (user_id IS NOT NULL OR (external_name IS NOT NULL AND external_whatsapp IS NOT NULL))
);
CREATE INDEX patient_doctors_patient_idx ON midcine.patient_doctors (patient_id);
CREATE INDEX patient_doctors_user_idx ON midcine.patient_doctors (user_id) WHERE user_id IS NOT NULL;

-- 2) QR tokens لمريض (يدخل الطبيب الخارجي على الملف)
CREATE TABLE midcine.patient_qr_tokens (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID            NOT NULL REFERENCES midcine.tenants(id),
    patient_id          UUID            NOT NULL REFERENCES midcine.patients(id) ON DELETE CASCADE,
    token_hash          BYTEA           NOT NULL UNIQUE,        -- SHA-256(token)
    -- الـ token الخام لا يُخزَّن — يظهر مرة واحدة في QR
    scope               VARCHAR(32)     NOT NULL DEFAULT 'view_and_upload' CHECK (scope IN ('view_only','view_and_upload','full_doctor')),
    issued_to_name      VARCHAR(255),                           -- اسم الطبيب أو "anonymous"
    issued_to_phone     VARCHAR(32),
    created_by_user_id  UUID            REFERENCES midcine.users(id),
    expires_at          TIMESTAMPTZ     NOT NULL,
    uses_remaining      INTEGER         NOT NULL DEFAULT 50,
    last_used_at        TIMESTAMPTZ,
    last_used_ip        INET,
    revoked_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX patient_qr_active_idx ON midcine.patient_qr_tokens (patient_id, expires_at)
    WHERE revoked_at IS NULL;

-- 3) Attachments: ملفات يرفعها الطبيب (تحاليل، أشعة سابقة ورقية، روشتات، ملاحظات)
CREATE TABLE midcine.attachments (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID            NOT NULL REFERENCES midcine.tenants(id),
    patient_id          UUID            NOT NULL REFERENCES midcine.patients(id) ON DELETE CASCADE,
    study_id            UUID            REFERENCES midcine.studies(id) ON DELETE SET NULL,
    uploaded_by_user_id UUID            REFERENCES midcine.users(id),
    uploaded_by_qr_token UUID           REFERENCES midcine.patient_qr_tokens(id),
    -- على الأقل واحد منهما
    file_name           VARCHAR(255)    NOT NULL,
    mime_type           VARCHAR(128)    NOT NULL,
    size_bytes          BIGINT          NOT NULL,
    storage_uri         VARCHAR(512)    NOT NULL,
    hash_sha256         BYTEA           NOT NULL,
    kind                VARCHAR(32)     NOT NULL DEFAULT 'note' CHECK (kind IN ('lab_result','prior_imaging','prescription','note','consent','referral','heatmap','segmentation','report_pdf','dicom_sr')),
    description_ar      TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);
CREATE INDEX attachments_patient_idx ON midcine.attachments (patient_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX attachments_study_idx ON midcine.attachments (study_id) WHERE study_id IS NOT NULL;

-- 4) Patient History: سجل دفتري للحالة (allergies, conditions, medications, doctor notes)
CREATE TABLE midcine.patient_history (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID            NOT NULL REFERENCES midcine.tenants(id),
    patient_id          UUID            NOT NULL REFERENCES midcine.patients(id) ON DELETE CASCADE,
    study_id            UUID            REFERENCES midcine.studies(id),
    entry_type          VARCHAR(32)     NOT NULL CHECK (entry_type IN ('condition','allergy','medication','surgery','family_history','doctor_note','symptom')),
    title_ar            VARCHAR(255)    NOT NULL,
    detail_ar           TEXT,
    icd11_code          VARCHAR(16),
    occurred_on         DATE,
    severity            VARCHAR(16)     CHECK (severity IN ('mild','moderate','severe','critical')),
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    added_by_user_id    UUID            REFERENCES midcine.users(id),
    added_by_qr_token   UUID            REFERENCES midcine.patient_qr_tokens(id),
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX history_patient_idx ON midcine.patient_history (patient_id, occurred_on DESC NULLS LAST);

-- 5) Consents (موافقات المريض)
CREATE TABLE midcine.patient_consents (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID            NOT NULL REFERENCES midcine.tenants(id),
    patient_id          UUID            NOT NULL REFERENCES midcine.patients(id) ON DELETE CASCADE,
    consent_type        VARCHAR(64)     NOT NULL CHECK (consent_type IN ('imaging','data_processing','ai_inference','share_with_doctor','research_use')),
    granted             BOOLEAN         NOT NULL,
    granted_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    signed_text         TEXT,
    signed_by_self      BOOLEAN         NOT NULL DEFAULT TRUE,
    witness_user_id     UUID            REFERENCES midcine.users(id),
    expires_at          TIMESTAMPTZ
);
CREATE INDEX consents_patient_idx ON midcine.patient_consents (patient_id, consent_type, granted_at DESC);

-- 6) Notifications queue + log
CREATE TABLE midcine.notifications (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID            NOT NULL REFERENCES midcine.tenants(id),
    patient_id          UUID            REFERENCES midcine.patients(id),
    study_id            UUID            REFERENCES midcine.studies(id),
    report_id           UUID            REFERENCES midcine.reports(id),
    channel             VARCHAR(16)     NOT NULL CHECK (channel IN ('whatsapp','sms','email','in_app')),
    target              VARCHAR(255)    NOT NULL,                -- phone/email
    subject_ar          VARCHAR(255),
    body_ar             TEXT,
    attachments         JSONB,                                   -- [{uri, name, mime}]
    status              VARCHAR(16)     NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','read','failed')),
    provider_message_id VARCHAR(255),
    error               TEXT,
    sent_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX notifications_status_idx ON midcine.notifications (status, created_at) WHERE status IN ('queued','failed');

-- 7) Segmentations (لربط overlay مع study/series)
CREATE TABLE midcine.segmentations (
    id                  UUID            PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id           UUID            NOT NULL REFERENCES midcine.tenants(id),
    study_id            UUID            NOT NULL REFERENCES midcine.studies(id) ON DELETE CASCADE,
    series_id           UUID            REFERENCES midcine.series(id),
    inference_id        UUID            REFERENCES midcine.ai_inferences(id),
    label               VARCHAR(64)     NOT NULL,                -- 'hemorrhage','tumor','fracture','bone'
    method              VARCHAR(64)     NOT NULL,                -- 'hu_threshold','totalsegmentator','monai_label'
    color_hex           VARCHAR(7)      NOT NULL DEFAULT '#DA1E28',
    volume_cc           NUMERIC(8,2),
    overlay_uri         VARCHAR(512),                            -- PNG composite للـ key slice
    overlay_3d_uri      VARCHAR(512),                            -- NIfTI/DICOM SEG (اختياري)
    snapshot_3d_uri     VARCHAR(512),                            -- صورة 3D snapshot للـ packet
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);
CREATE INDEX segmentations_study_idx ON midcine.segmentations (study_id, label);

-- صلاحيات على ما سبق
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA midcine TO midcine_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA midcine TO midcine_app;

-- RLS على الجداول الجديدة
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY['patient_doctors','patient_qr_tokens','attachments','patient_history','patient_consents','notifications','segmentations'];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE midcine.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('ALTER TABLE midcine.%I FORCE ROW LEVEL SECURITY;', t);
        EXECUTE format(
            'CREATE POLICY %I_tenant_isolation ON midcine.%I
                USING (tenant_id = midcine.current_tenant() OR midcine.is_super_admin())
                WITH CHECK (tenant_id = midcine.current_tenant() OR midcine.is_super_admin());',
            t, t
        );
    END LOOP;
END $$;
