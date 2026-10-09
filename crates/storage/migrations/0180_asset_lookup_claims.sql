-- Immutable, zero-charge lookup audit; no upstream asset identity or content.
CREATE TABLE asset_lookup_claims (
    id UUID PRIMARY KEY,
    listing_id UUID NOT NULL REFERENCES asset_listing_claims(id),
    authorization_id UUID NOT NULL REFERENCES asset_operation_authorizations(id),
    item_index INTEGER NOT NULL CHECK (item_index BETWEEN 0 AND 99),
    listing_snapshot_sha256 BYTEA NOT NULL CHECK (octet_length(listing_snapshot_sha256)=32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_lookup_claim BEFORE UPDATE OR DELETE ON asset_lookup_claims
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE INDEX asset_lookup_claim_listing ON asset_lookup_claims(listing_id,created_at);
