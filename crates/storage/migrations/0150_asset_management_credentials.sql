-- Asset management credentials are separate from inference bearer credentials.
-- Rows are immutable revisions for original-account recovery; no dispatch is enabled.
CREATE TABLE vendor_asset_management_credentials (
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    revision BIGINT NOT NULL CHECK (revision > 0),
    upstream_project TEXT NOT NULL CHECK (char_length(upstream_project) BETWEEN 1 AND 1024 AND btrim(upstream_project)=upstream_project),
    credential_ciphertext BYTEA NOT NULL CHECK (octet_length(credential_ciphertext) BETWEEN 30 AND 65536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (vendor_id, revision)
);

CREATE FUNCTION preserve_asset_management_credential_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'asset management credential revisions are immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_asset_management_credential_revision
    BEFORE UPDATE OR DELETE ON vendor_asset_management_credentials
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_management_credential_revision();
