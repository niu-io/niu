-- Short-lived bearer access to exact claimed bytes; only hashes are retained.
CREATE TABLE asset_image_source_access (
    token_sha256 BYTEA PRIMARY KEY CHECK(octet_length(token_sha256)=32),
    consent_id UUID UNIQUE NOT NULL REFERENCES asset_image_ingestion_claims(consent_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK(expires_at>created_at AND expires_at<=created_at+interval '60 seconds')
);
CREATE TRIGGER immutable_asset_image_source_access BEFORE UPDATE OR DELETE ON asset_image_source_access
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE asset_image_source_deliveries (
    token_sha256 BYTEA NOT NULL REFERENCES asset_image_source_access(token_sha256),
    ordinal SMALLINT NOT NULL CHECK(ordinal BETWEEN 1 AND 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(token_sha256,ordinal)
);
CREATE TRIGGER immutable_asset_image_source_delivery BEFORE UPDATE OR DELETE ON asset_image_source_deliveries
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
