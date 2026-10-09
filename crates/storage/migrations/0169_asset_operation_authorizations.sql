-- Explicit administrator-reviewed qualification; never inferred from credentials.
CREATE TABLE asset_operation_authorizations (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    vendor_id UUID NOT NULL,
    vendor_revision BIGINT NOT NULL CHECK (vendor_revision > 0),
    credential_revision BIGINT NOT NULL,
    operation TEXT NOT NULL CHECK (operation='CreateAssetGroup'),
    rights_sha256 BYTEA NOT NULL CHECK (octet_length(rights_sha256)=32),
    protocol_sha256 BYTEA NOT NULL CHECK (octet_length(protocol_sha256)=32),
    data_handling_sha256 BYTEA NOT NULL CHECK (octet_length(data_handling_sha256)=32),
    free_operation_sha256 BYTEA NOT NULL CHECK (octet_length(free_operation_sha256)=32),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK ((actor_kind='operator')=(actor_id IS NOT NULL)),
    CHECK (expires_at>created_at AND expires_at<=created_at+INTERVAL '90 days'),
    FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
    FOREIGN KEY (vendor_id,credential_revision) REFERENCES vendor_asset_management_credentials(vendor_id,revision)
);
CREATE TABLE asset_operation_authorization_revocations (
    authorization_id UUID PRIMARY KEY REFERENCES asset_operation_authorizations(id),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((actor_kind='operator')=(actor_id IS NOT NULL))
);
CREATE FUNCTION preserve_asset_operation_authorization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'asset operation authorization events are immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_asset_operation_authorization BEFORE UPDATE OR DELETE ON asset_operation_authorizations
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE TRIGGER immutable_asset_operation_authorization_revocation BEFORE UPDATE OR DELETE ON asset_operation_authorization_revocations
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE INDEX asset_operation_authorization_binding ON asset_operation_authorizations
    (organization_id,project_id,vendor_id,vendor_revision,credential_revision);
