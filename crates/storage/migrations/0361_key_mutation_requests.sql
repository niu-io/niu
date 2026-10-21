-- Refs #108. Durable mutation outcomes contain no secret or encrypted secret.
CREATE TABLE key_mutation_requests (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'rotate')),
    intent_hash BYTEA NOT NULL CHECK (octet_length(intent_hash)=32),
    key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id, project_id, request_id)
);
