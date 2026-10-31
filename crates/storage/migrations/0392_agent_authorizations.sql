-- Browser approval and agent polling have separate capabilities. Secrets are
-- stored only as hashes; credential issuance and consumption commit together.
CREATE TABLE agent_authorizations (
    id UUID PRIMARY KEY,
    client_name TEXT NOT NULL CHECK (client_name IN ('Claude Code','Codex')),
    device_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(device_hash)=32),
    user_code TEXT NOT NULL UNIQUE CHECK (length(user_code)=12),
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','denied','consumed')),
    next_poll_at TIMESTAMPTZ NOT NULL DEFAULT '-infinity',
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    organization_id UUID,
    project_id UUID,
    approved_models TEXT[],
    credential_ttl_seconds BIGINT CHECK (credential_ttl_seconds BETWEEN 60 AND 86400),
    approved_by UUID REFERENCES admin_operators(id),
    issued_key_id UUID REFERENCES api_keys(id),
    FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
    CHECK (expires_at > created_at),
    CHECK (state NOT IN ('approved','consumed') OR
      (organization_id IS NOT NULL AND project_id IS NOT NULL AND
       approved_models IS NOT NULL AND cardinality(approved_models)>0 AND
       credential_ttl_seconds IS NOT NULL AND approved_by IS NOT NULL)),
    CHECK ((state='consumed') = (issued_key_id IS NOT NULL))
);
CREATE INDEX agent_authorizations_expiry ON agent_authorizations(expires_at);
