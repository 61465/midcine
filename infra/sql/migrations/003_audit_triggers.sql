-- midcine 003 — audit_log immutability
\c midcine

CREATE OR REPLACE FUNCTION midcine_audit.deny_modify()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'midcine_audit.audit_log is append-only';
END;
$$;

DROP TRIGGER IF EXISTS audit_no_update ON midcine_audit.audit_log;
DROP TRIGGER IF EXISTS audit_no_delete ON midcine_audit.audit_log;

CREATE TRIGGER audit_no_update BEFORE UPDATE ON midcine_audit.audit_log
    FOR EACH ROW EXECUTE FUNCTION midcine_audit.deny_modify();

CREATE TRIGGER audit_no_delete BEFORE DELETE ON midcine_audit.audit_log
    FOR EACH ROW EXECUTE FUNCTION midcine_audit.deny_modify();

-- trigger لتحديث updated_at تلقائياً على الجداول الرئيسية
CREATE OR REPLACE FUNCTION midcine.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY['tenants','users','patients','studies','reports'];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format(
            'CREATE TRIGGER %I_touch_updated_at BEFORE UPDATE ON midcine.%I
                FOR EACH ROW EXECUTE FUNCTION midcine.touch_updated_at();',
            t, t
        );
    END LOOP;
END $$;
