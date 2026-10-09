-- Historical claims have no qualification receipt; never fabricate one.
CREATE TABLE asset_group_dispatch_authorizations (
    intent_id UUID PRIMARY KEY REFERENCES asset_group_create_intents(id),
    authorization_id UUID NOT NULL REFERENCES asset_operation_authorizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_group_dispatch_authorization BEFORE UPDATE OR DELETE
    ON asset_group_dispatch_authorizations FOR EACH ROW
    EXECUTE FUNCTION preserve_asset_operation_authorization();
