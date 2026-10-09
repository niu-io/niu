-- Chat content is separate from the accounting/attempt ledger.
CREATE TABLE chat_sessions (
    id UUID NOT NULL,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    owner TEXT NOT NULL,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, project_id, owner, id),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id)
);
CREATE INDEX chat_sessions_recent ON chat_sessions (organization_id, project_id, owner, updated_at DESC);
