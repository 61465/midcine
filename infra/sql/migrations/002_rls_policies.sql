-- midcine 002 — Row-Level Security
-- التطبيق يضع SET LOCAL midcine.current_tenant + midcine.role في كل transaction

\c midcine
SET search_path TO midcine, public;

CREATE OR REPLACE FUNCTION midcine.current_tenant() RETURNS UUID
LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('midcine.current_tenant', true), '')::UUID;
$$;

CREATE OR REPLACE FUNCTION midcine.current_role() RETURNS TEXT
LANGUAGE sql STABLE AS $$
    SELECT current_setting('midcine.current_role', true);
$$;

CREATE OR REPLACE FUNCTION midcine.is_super_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT current_setting('midcine.current_role', true) = 'super_admin';
$$;

-- جدول → سياسة موحدة (tenant_id = current_tenant) + escape لـ super_admin
DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'users','patients','studies','series','instances','reports',
        'ai_inferences','knowledge_chunks','mtls_certs'
    ];
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

-- knowledge_chunks بـ tenant_id NULL = عام (مشترك بين جميع tenants)
DROP POLICY IF EXISTS knowledge_chunks_tenant_isolation ON midcine.knowledge_chunks;
CREATE POLICY knowledge_chunks_isolation ON midcine.knowledge_chunks
    USING (tenant_id IS NULL OR tenant_id = midcine.current_tenant() OR midcine.is_super_admin())
    WITH CHECK (tenant_id IS NULL OR tenant_id = midcine.current_tenant() OR midcine.is_super_admin());

-- tenants للقراءة فقط من super_admin أو الـ tenant نفسه
ALTER TABLE midcine.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE midcine.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_self_or_super ON midcine.tenants
    USING (id = midcine.current_tenant() OR midcine.is_super_admin())
    WITH CHECK (midcine.is_super_admin());

-- audit_log: tenant يقرأ سجلاته، super يقرأ كل شيء، الكل يقدر يكتب (إضافة سجل تدقيق)
ALTER TABLE midcine_audit.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE midcine_audit.audit_log FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON midcine_audit.audit_log
    FOR SELECT USING (tenant_id = midcine.current_tenant() OR midcine.is_super_admin());
CREATE POLICY audit_insert ON midcine_audit.audit_log
    FOR INSERT WITH CHECK (true);
