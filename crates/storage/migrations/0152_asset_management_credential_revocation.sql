CREATE TABLE vendor_asset_management_revocations (
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    through_revision BIGINT NOT NULL CHECK (through_revision > 0),
    actor_kind TEXT NOT NULL CHECK (actor_kind='installation'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (vendor_id,through_revision)
);
CREATE FUNCTION preserve_asset_management_revocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'asset management revocations are immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_asset_management_revocation
    BEFORE UPDATE OR DELETE ON vendor_asset_management_revocations
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_management_revocation();

ALTER TABLE vendor_asset_management_credentials ALTER COLUMN credential_ciphertext DROP NOT NULL;
CREATE OR REPLACE FUNCTION preserve_asset_management_credential_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE'
       AND OLD.credential_ciphertext IS NOT NULL AND NEW.credential_ciphertext IS NULL
       AND ROW(NEW.vendor_id,NEW.revision,NEW.upstream_project,NEW.created_at,NEW.actor_kind)
           IS NOT DISTINCT FROM ROW(OLD.vendor_id,OLD.revision,OLD.upstream_project,OLD.created_at,OLD.actor_kind)
       AND EXISTS (SELECT 1 FROM vendor_asset_management_revocations r
                   WHERE r.vendor_id=OLD.vendor_id AND r.through_revision>=OLD.revision)
    THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'asset management credential revisions are immutable except revoked-secret erasure' USING ERRCODE='23514';
END;
$$;
