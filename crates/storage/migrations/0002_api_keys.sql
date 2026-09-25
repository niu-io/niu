CREATE TABLE api_keys (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    allowed_models TEXT[] NOT NULL CHECK (cardinality(allowed_models) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    UNIQUE (organization_id, project_id, id)
);
ALTER TABLE attempts ADD COLUMN api_key_id UUID;
ALTER TABLE attempts ADD CONSTRAINT attempts_key_scope
    FOREIGN KEY (organization_id, project_id, api_key_id)
    REFERENCES api_keys(organization_id, project_id, id);
