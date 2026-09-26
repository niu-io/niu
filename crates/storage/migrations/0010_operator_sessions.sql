CREATE TABLE admin_operators (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

CREATE TABLE admin_sessions (
    id UUID PRIMARY KEY,
    operator_id UUID NOT NULL REFERENCES admin_operators(id),
    token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    expires_at_unix BIGINT NOT NULL CHECK (expires_at_unix > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX admin_sessions_active ON admin_sessions (operator_id, expires_at_unix)
    WHERE revoked_at IS NULL;
