-- Explicit, idempotent quick setup. Never infer ownership from an existing name.
CREATE TABLE default_workspace (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id)
);
