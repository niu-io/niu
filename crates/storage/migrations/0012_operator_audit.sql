CREATE TABLE operator_audit_events (
    id UUID PRIMARY KEY,
    action TEXT NOT NULL CHECK (action IN (
        'operator_created',
        'session_created',
        'session_revoked',
        'operator_revoked'
    )),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    target_operator_id UUID NOT NULL REFERENCES admin_operators(id),
    target_session_id UUID REFERENCES admin_sessions(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    project_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK (
        (actor_kind = 'installation' AND actor_operator_id IS NULL)
        OR (actor_kind = 'operator' AND actor_operator_id IS NOT NULL)
    ),
    CHECK (
        (action IN ('session_created', 'session_revoked') AND target_session_id IS NOT NULL)
        OR (action IN ('operator_created', 'operator_revoked') AND target_session_id IS NULL)
    ),
    FOREIGN KEY (organization_id, project_id)
        REFERENCES projects(organization_id, id)
);

CREATE INDEX operator_audit_target_cursor
    ON operator_audit_events (target_operator_id, created_at DESC, id DESC);

CREATE INDEX operator_audit_actor_cursor
    ON operator_audit_events (actor_operator_id, created_at DESC, id DESC)
    WHERE actor_operator_id IS NOT NULL;

CREATE TRIGGER immutable_operator_audit
    BEFORE UPDATE OR DELETE ON operator_audit_events
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
