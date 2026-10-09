CREATE TABLE asset_group_create_intents (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    idempotency_key UUID NOT NULL,
    vendor_id UUID NOT NULL,
    credential_revision BIGINT NOT NULL,
    upstream_project TEXT NOT NULL,
    request_body JSONB NOT NULL,
    state TEXT NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared','dispatching','uncertain','succeeded')),
    upstream_group_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
    FOREIGN KEY (vendor_id,credential_revision) REFERENCES vendor_asset_management_credentials(vendor_id,revision),
    UNIQUE (organization_id,project_id,idempotency_key),
    CHECK ((state='succeeded') = (upstream_group_id IS NOT NULL))
);
