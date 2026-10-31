-- Customer-safe model-management events; distinct from plugin observer telemetry.
CREATE TABLE workspace_event_streams (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    sequence BIGINT NOT NULL DEFAULT 0 CHECK (sequence >= 0),
    PRIMARY KEY(organization_id,project_id),
    FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE workspace_events (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    sequence BIGINT NOT NULL CHECK(sequence>0),
    id UUID NOT NULL UNIQUE,
    event_type TEXT NOT NULL CHECK(event_type IN ('pool.changed','subscription.test')),
    resource_kind TEXT NOT NULL DEFAULT 'pool' CHECK(resource_kind IN ('pool','subscription')),
    target_subscription_id UUID,
    resource_slug TEXT NOT NULL,
    resource_revision BIGINT NOT NULL CHECK(resource_revision>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(organization_id,project_id,sequence),
    FOREIGN KEY(organization_id,project_id) REFERENCES workspace_event_streams(organization_id,project_id)
);
CREATE TRIGGER immutable_workspace_event BEFORE UPDATE OR DELETE ON workspace_events
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE workspace_event_subscriptions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    slug TEXT NOT NULL CHECK(length(slug) BETWEEN 1 AND 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    revision BIGINT NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
    configuration JSONB NOT NULL CHECK(jsonb_typeof(configuration)='object'),
    secret_ciphertext BYTEA NOT NULL CHECK(octet_length(secret_ciphertext) BETWEEN 30 AND 1024),
    issuer_key_id UUID NOT NULL REFERENCES api_keys(id),
    cursor BIGINT NOT NULL CHECK(cursor>=0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    checked_at TIMESTAMPTZ NOT NULL DEFAULT '-infinity',
    UNIQUE(organization_id,project_id,slug),
    UNIQUE(organization_id,project_id,id),
    FOREIGN KEY(organization_id,project_id) REFERENCES workspace_event_streams(organization_id,project_id)
);
CREATE TABLE workspace_event_subscription_history (
    subscription_id UUID NOT NULL REFERENCES workspace_event_subscriptions(id),
    revision BIGINT NOT NULL,
    configuration JSONB NOT NULL,
    actor_key_id UUID NOT NULL REFERENCES api_keys(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(subscription_id,revision)
);
CREATE TRIGGER immutable_workspace_event_subscription_history BEFORE UPDATE OR DELETE ON workspace_event_subscription_history
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE workspace_event_deliveries (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    subscription_id UUID NOT NULL,
    subscription_revision BIGINT NOT NULL,
    event_sequence BIGINT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 8),
    state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','delivered','failed','cancelled')),
    available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    lease_id UUID,
    lease_until TIMESTAMPTZ,
    response_status SMALLINT CHECK(response_status BETWEEN 100 AND 599),
    failure_kind TEXT CHECK(failure_kind IN ('transport','destination','signature','http','authority','superseded','exhausted')),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(subscription_id,subscription_revision,event_sequence),
    FOREIGN KEY(organization_id,project_id,subscription_id) REFERENCES workspace_event_subscriptions(organization_id,project_id,id),
    FOREIGN KEY(subscription_id,subscription_revision) REFERENCES workspace_event_subscription_history(subscription_id,revision),
    FOREIGN KEY(organization_id,project_id,event_sequence) REFERENCES workspace_events(organization_id,project_id,sequence)
);
CREATE INDEX workspace_event_delivery_due ON workspace_event_deliveries(available_at) WHERE state IN ('pending','sending');

-- Signing secrets participate in the existing closed offline-rotation inventory.
ALTER TABLE encryption_rewrap_authorizations DROP CONSTRAINT encryption_rewrap_authorizations_table_name_check;
ALTER TABLE encryption_rewrap_authorizations ADD CONSTRAINT encryption_rewrap_authorizations_table_name_check CHECK(table_name IN (
 'vendors','vendor_asset_management_credentials','codex_connections','payment_gateway_configuration',
 'media_result_references','asset_listing_results','asset_lookup_results','asset_group_read_results',
 'asset_group_update_patches','inspected_image_source_content','workspace_asset_library_content',
 'workspace_provider_verification_sessions','workspace_event_subscriptions'
));

ALTER TABLE workspace_events ADD FOREIGN KEY(organization_id,project_id,target_subscription_id)
    REFERENCES workspace_event_subscriptions(organization_id,project_id,id);
