-- Opt-in member credentials. Existing sessions and development login are unchanged.
CREATE TABLE member_password_credentials (
    operator_id UUID PRIMARY KEY REFERENCES admin_operators(id),
    email TEXT NOT NULL UNIQUE CHECK (
        email = lower(email) AND email = btrim(email)
        AND length(email) BETWEEN 3 AND 254
    ),
    password_hash TEXT NOT NULL CHECK (
        length(password_hash) BETWEEN 1 AND 256
        AND password_hash LIKE '$argon2id$v=19$%'
    ),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE operator_audit_events DROP CONSTRAINT operator_audit_events_action_check;
ALTER TABLE operator_audit_events ADD CONSTRAINT operator_audit_events_action_check
    CHECK (action IN ('operator_created', 'session_created', 'session_revoked',
        'operator_revoked', 'password_changed'));
ALTER TABLE operator_audit_events DROP CONSTRAINT operator_audit_events_check1;
ALTER TABLE operator_audit_events ADD CONSTRAINT operator_audit_events_check1 CHECK (
    (action IN ('session_created', 'session_revoked') AND target_session_id IS NOT NULL)
    OR (action IN ('operator_created', 'operator_revoked', 'password_changed')
        AND target_session_id IS NULL)
);
