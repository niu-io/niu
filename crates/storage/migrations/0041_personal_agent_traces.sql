-- Metadata-only personal traces and least-privilege write credentials.
CREATE TABLE personal_agent_connections (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES admin_operators(id),
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    client_version TEXT NOT NULL,
    consent_version TEXT NOT NULL CHECK (consent_version = 'agent-trace-metadata-v1'),
    token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_received_at TIMESTAMPTZ,
    paused BOOLEAN NOT NULL DEFAULT FALSE,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(owner_id, id)
);
CREATE TABLE personal_agent_traces (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    connection_id UUID NOT NULL,
    source TEXT NOT NULL,
    record_id TEXT NOT NULL,
    name TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    time_basis TEXT NOT NULL CHECK (time_basis IN ('observed', 'received')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL,
    coverage TEXT NOT NULL,
    duration_ms BIGINT,
    span_count BIGINT NOT NULL,
    error_count BIGINT NOT NULL,
    model_calls BIGINT NOT NULL,
    tool_calls BIGINT NOT NULL,
    record JSONB NOT NULL,
    span_names JSONB NOT NULL,
    FOREIGN KEY(owner_id, connection_id) REFERENCES personal_agent_connections(owner_id, id),
    UNIQUE(owner_id, connection_id, record_id)
);
CREATE INDEX personal_agent_traces_range ON personal_agent_traces(owner_id, occurred_at DESC, id DESC);
