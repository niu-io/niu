-- Immutable mutation identity/grant/digest are separate from erasable patch content.
CREATE TABLE asset_group_update_intents (
    id UUID PRIMARY KEY,
    intent_id UUID NOT NULL REFERENCES asset_group_create_intents(id),
    authorization_id UUID NOT NULL REFERENCES asset_operation_authorizations(id),
    patch_sha256 BYTEA NOT NULL CHECK (octet_length(patch_sha256)=32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_group_update_intent BEFORE UPDATE OR DELETE ON asset_group_update_intents
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE TABLE asset_group_update_patches (
    update_id UUID PRIMARY KEY REFERENCES asset_group_update_intents(id),
    ciphertext BYTEA CHECK (ciphertext IS NULL OR octet_length(ciphertext) BETWEEN 30 AND 8192),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp()+INTERVAL '24 hours'),
    deleted_at TIMESTAMPTZ,
    CHECK ((ciphertext IS NULL)=(deleted_at IS NOT NULL))
);
CREATE FUNCTION preserve_asset_group_update_patch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS NULL
       AND NEW.deleted_at IS NOT NULL AND NEW.update_id=OLD.update_id AND NEW.expires_at=OLD.expires_at THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'asset group update patch permits erasure only' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_asset_group_update_patch BEFORE UPDATE OR DELETE ON asset_group_update_patches
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_group_update_patch();
CREATE INDEX asset_group_update_patch_expiry ON asset_group_update_patches(expires_at,update_id) WHERE ciphertext IS NOT NULL;
CREATE TABLE asset_group_update_claims (
    update_id UUID PRIMARY KEY REFERENCES asset_group_update_intents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_group_update_claim BEFORE UPDATE OR DELETE ON asset_group_update_claims
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
-- Operational hold survives uncertain completion; release requires reconciliation.
CREATE TABLE asset_group_update_holds (
    intent_id UUID PRIMARY KEY REFERENCES asset_group_create_intents(id),
    update_id UUID UNIQUE NOT NULL REFERENCES asset_group_update_intents(id)
);
