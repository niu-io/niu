-- Distinguish verified password login from administrator-issued sessions.
ALTER TABLE operator_audit_events DROP CONSTRAINT operator_audit_events_action_check;
ALTER TABLE operator_audit_events ADD CONSTRAINT operator_audit_events_action_check CHECK (
 action IN ('operator_created','session_created','session_revoked','operator_revoked','password_changed','password_login_succeeded')
);
ALTER TABLE operator_audit_events DROP CONSTRAINT operator_audit_events_check1;
ALTER TABLE operator_audit_events ADD CONSTRAINT operator_audit_events_check1 CHECK (
 (action IN ('session_created','session_revoked','password_login_succeeded') AND target_session_id IS NOT NULL)
 OR (action IN ('operator_created','operator_revoked','password_changed') AND target_session_id IS NULL)
);
-- The aggregate reads a bounded page from each journal using the same tie-breaker.
CREATE INDEX operator_audit_platform_cursor ON operator_audit_events(created_at DESC,(id::text) DESC);
CREATE INDEX vendor_audit_platform_cursor ON vendor_audit_events(created_at DESC,(id::text) DESC);
CREATE INDEX supplier_audit_platform_cursor ON provider_audit_events(created_at DESC,(id::text) DESC);
CREATE INDEX branding_audit_platform_cursor ON branding_configuration_events(created_at DESC,(revision::text) DESC);
CREATE INDEX payment_audit_platform_cursor ON payment_gateway_configuration_events(created_at DESC,(id::text) DESC);
CREATE INDEX access_audit_platform_cursor ON platform_admin_events(created_at DESC,(id::text) DESC);
-- Preserve journal rows from now on; no historical completeness is inferred.
CREATE TRIGGER immutable_vendor_audit_events
 BEFORE UPDATE OR DELETE ON vendor_audit_events
 FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
