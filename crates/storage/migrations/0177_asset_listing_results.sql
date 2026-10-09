-- Private descriptive results are encrypted separately from immutable audit.
CREATE TABLE asset_listing_results (
    listing_id UUID PRIMARY KEY REFERENCES asset_listing_outcomes(listing_id),
    ciphertext BYTEA CHECK (ciphertext IS NULL OR octet_length(ciphertext) BETWEEN 30 AND 131072),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp()+INTERVAL '24 hours'),
    deleted_at TIMESTAMPTZ,
    CHECK ((ciphertext IS NULL)=(deleted_at IS NOT NULL))
);
CREATE FUNCTION preserve_asset_listing_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS NULL
       AND NEW.deleted_at IS NOT NULL AND NEW.listing_id=OLD.listing_id AND NEW.expires_at=OLD.expires_at THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'asset listing results permit erasure only' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_asset_listing_result BEFORE UPDATE OR DELETE ON asset_listing_results
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_listing_result();
CREATE INDEX asset_listing_result_expiry ON asset_listing_results(expires_at,listing_id) WHERE ciphertext IS NOT NULL;
-- A deletion during an in-flight read must also prevent later content storage.
CREATE TABLE asset_listing_result_deletions (
    listing_id UUID PRIMARY KEY REFERENCES asset_listing_claims(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_listing_result_deletion BEFORE UPDATE OR DELETE ON asset_listing_result_deletions
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
