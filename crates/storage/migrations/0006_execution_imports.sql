CREATE TABLE execution_imports (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    source TEXT NOT NULL,
    record_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    schema_version SMALLINT NOT NULL CHECK (schema_version = 1),
    payload JSONB NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    UNIQUE (organization_id, project_id, source, record_id)
);
CREATE INDEX execution_imports_task ON execution_imports (organization_id, project_id, task_id);
