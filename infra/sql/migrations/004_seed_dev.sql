-- midcine 004 — seed تجريبي
\c midcine
SET search_path TO midcine, public;

-- tenant افتراضي للتطوير
INSERT INTO midcine.tenants (id, slug, name_ar, name_en, plan, status)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'demo',
    'مركز ميدسين التجريبي',
    'midcine Demo Center',
    'center',
    'active'
)
ON CONFLICT (id) DO NOTHING;

-- مستخدم تجريبي: demo@midcine.io / DemoMidcine!2026
-- password_hash = Argon2id (نولّده في seed-db.py لاحقاً؛ هنا placeholder)
INSERT INTO midcine.users (
    id, tenant_id, email_hash, email_encrypted, full_name_ar, full_name_en,
    role, license_number, specialty, password_hash
)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    decode('00', 'hex'),                    -- placeholder، seed-db.py يحدّثه
    decode('00', 'hex'),
    'د. عبد الرحمن محمد',
    'Dr. Abdelrahman Mohamed',
    'doctor',
    'EG-RAD-12345',
    'radiology',
    'PLACEHOLDER_REPLACED_BY_SEED_SCRIPT'
)
ON CONFLICT (id) DO NOTHING;

-- Casbin policy أساسية
INSERT INTO midcine_rbac.casbin_rule (ptype, v0, v1, v2, v3) VALUES
    ('p', 'super_admin', '/*',           '*',      'allow'),
    ('p', 'owner',      '/studies/*',    'view',   'allow'),
    ('p', 'owner',      '/reports/*',    'view',   'allow'),
    ('p', 'owner',      '/admin/*',      '*',      'allow'),
    ('p', 'doctor',     '/studies/*',    'view',   'allow'),
    ('p', 'doctor',     '/reports/*',    'sign',   'allow'),
    ('p', 'doctor',     '/reports/*',    '*',      'allow'),
    ('p', 'doctor',     '/patients/*',   'delete', 'deny'),
    ('p', 'technician', '/studies/*',    'upload', 'allow'),
    ('p', 'technician', '/studies/*',    'view',   'allow'),
    ('p', 'read_only',  '/reports/*',    'view',   'allow')
ON CONFLICT DO NOTHING;
