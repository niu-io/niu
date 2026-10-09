-- Private descriptive results are encrypted separately from immutable audit.
CREATE TABLE asset_group_read_results (
    read_id UUID PRIMARY KEY REFERENCES asset_group_read_outcomes(read_id),
    ciphertext BYTEA CHECK (ciphertext IS NULL OR octet_length(ciphertext) BETWEEN 30 AND 8192),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp()+INTERVAL '24 hours'),
    deleted_at TIMESTAMPTZ,
    CHECK ((ciphertext IS NULL)=(deleted_at IS NOT NULL))
);
CREATE FUNCTION preserve_asset_group_read_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS NULL
       AND NEW.deleted_at IS NOT NULL AND NEW.read_id=OLD.read_id AND NEW.expires_at=OLD.expires_at THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'asset read results permit erasure only' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_asset_group_read_result BEFORE UPDATE OR DELETE ON asset_group_read_results
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_group_read_result();
CREATE INDEX asset_group_read_result_expiry ON asset_group_read_results(expires_at,read_id) WHERE ciphertext IS NOT NULL;
-- A deletion during an in-flight read must also prevent later content storage.
CREATE TABLE asset_group_read_result_deletions (
    read_id UUID PRIMARY KEY REFERENCES asset_group_read_claims(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_group_read_result_deletion BEFORE UPDATE OR DELETE ON asset_group_read_result_deletions
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
