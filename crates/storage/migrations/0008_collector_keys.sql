CREATE TABLE collector_keys (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
    token_hash BYTEA NOT NULL UNIQUE CHECK(octet_length(token_hash)=32),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
