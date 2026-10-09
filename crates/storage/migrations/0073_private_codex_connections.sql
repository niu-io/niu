-- Private subscription credentials never enter installation-wide vendor routes.
CREATE TABLE codex_runtime_identity (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    host_id UUID NOT NULL
);
CREATE TABLE codex_connections (
    account_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    subject TEXT NOT NULL,
    client_id TEXT NOT NULL,
    credential_ciphertext BYTEA NOT NULL,
    models JSONB NOT NULL CHECK (jsonb_typeof(models) = 'array'),
    lease_owner UUID,
    last_used_at TIMESTAMPTZ,
    cooldown_until TIMESTAMPTZ,
    FOREIGN KEY (organization_id, project_id, account_id)
      REFERENCES supplier_accounts(organization_id, project_id, id),
    UNIQUE (organization_id, project_id, subject, client_id)
);
CREATE INDEX codex_connections_scope ON codex_connections(organization_id, project_id);
