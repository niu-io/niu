-- Browser sign-ins start with tenant authority even for platform administrators.
-- Explicitly issued automation sessions retain their existing grant semantics.
ALTER TABLE admin_sessions ADD COLUMN browser_session boolean NOT NULL DEFAULT false;
ALTER TABLE admin_sessions ADD COLUMN admin_mode_until timestamptz;
UPDATE admin_sessions s SET browser_session=true
WHERE EXISTS (SELECT 1 FROM operator_audit_events e
              WHERE e.target_session_id=s.id AND e.action='password_login_succeeded');

CREATE TABLE admin_mode_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id uuid NOT NULL REFERENCES admin_operators(id),
    session_id uuid NOT NULL REFERENCES admin_sessions(id),
    enabled boolean NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_admin_mode_events
    BEFORE UPDATE OR DELETE ON admin_mode_events
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- Explicit installation administration is distinct from a database operator.
ALTER TABLE platform_admin_events DROP CONSTRAINT platform_admin_events_actor_kind_check;
ALTER TABLE platform_admin_events ADD CONSTRAINT platform_admin_events_actor_kind_check
    CHECK (actor_kind IN ('database_administrator','installation'));
