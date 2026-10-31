-- Customer-owned model selection policy, distinct from Provider supply pools.
-- Only public model aliases and routing preferences belong in this resource.
CREATE TABLE workspace_model_pools (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    slug TEXT NOT NULL CHECK (length(slug) BETWEEN 1 AND 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    revision BIGINT NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
    configuration JSONB NOT NULL CHECK (jsonb_typeof(configuration)='object'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(organization_id,project_id,slug),
    FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE workspace_model_pool_history (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    slug TEXT NOT NULL,
    revision BIGINT NOT NULL,
    configuration JSONB NOT NULL,
    actor_key_id UUID NOT NULL REFERENCES api_keys(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(organization_id,project_id,slug,revision),
    FOREIGN KEY(organization_id,project_id,slug) REFERENCES workspace_model_pools(organization_id,project_id,slug)
);
CREATE TRIGGER immutable_workspace_pool_history BEFORE UPDATE OR DELETE ON workspace_model_pool_history
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
