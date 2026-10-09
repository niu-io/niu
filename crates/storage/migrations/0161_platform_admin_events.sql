CREATE TABLE platform_admin_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id uuid NOT NULL REFERENCES admin_operators(id),
    granted boolean NOT NULL,
    actor_kind text NOT NULL CHECK (actor_kind = 'database_administrator'),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_platform_admin_events
    BEFORE UPDATE OR DELETE ON platform_admin_events
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
