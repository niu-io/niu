CREATE TABLE workspace_pool_selections (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    pool_slug TEXT NOT NULL,
    pool_revision BIGINT NOT NULL,
    key_id UUID NOT NULL REFERENCES api_keys(id),
    selected_model TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    operation_id UUID REFERENCES operations(id),
    attempt_id UUID REFERENCES attempts(id),
    response_status SMALLINT CHECK (response_status BETWEEN 100 AND 599),
    FOREIGN KEY(organization_id,project_id,pool_slug,pool_revision)
        REFERENCES workspace_model_pool_history(organization_id,project_id,slug,revision)
);
CREATE INDEX workspace_pool_selection_page ON workspace_pool_selections(organization_id,project_id,pool_slug,created_at DESC,id DESC);
