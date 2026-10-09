ALTER TABLE api_keys ADD CONSTRAINT api_keys_guardrail_scope UNIQUE (organization_id, project_id, id);
CREATE TABLE key_guardrail_assignments (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    policy_revision BIGINT NOT NULL,
    assignment_revision BIGINT NOT NULL DEFAULT 1 CHECK (assignment_revision > 0),
    PRIMARY KEY (organization_id, project_id, key_id),
    FOREIGN KEY (organization_id, project_id, key_id) REFERENCES api_keys(organization_id, project_id, id),
    FOREIGN KEY (organization_id, project_id, policy_revision) REFERENCES workspace_guardrail_revisions(organization_id, project_id, revision)
);
