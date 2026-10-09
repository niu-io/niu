CREATE TABLE workspace_guardrail_heads (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
    PRIMARY KEY (organization_id, project_id),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id)
);

CREATE TABLE workspace_guardrail_revisions (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    revision BIGINT NOT NULL CHECK (revision > 0),
    policy JSONB NOT NULL CHECK (jsonb_typeof(policy) = 'object'),
    activated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id, project_id, revision),
    FOREIGN KEY (organization_id, project_id) REFERENCES workspace_guardrail_heads(organization_id, project_id)
);
