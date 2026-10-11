-- Narrow per-row authority for the future offline rotation command. The command
-- must authenticate plaintext equivalence; PostgreSQL enforces metadata equality,
-- exact before/after representations, active operation and transaction ownership.
-- No plaintext, ciphertext or encryption keys are stored in this audit table.
CREATE TABLE encryption_rewrap_authorizations (
    operation_id UUID NOT NULL REFERENCES encryption_rotation_operations(id),
    transaction_id BIGINT NOT NULL DEFAULT txid_current(),
    table_name TEXT NOT NULL CHECK (table_name IN (
        'vendors', 'vendor_asset_management_credentials', 'codex_connections',
        'payment_gateway_configuration', 'media_result_references',
        'asset_listing_results', 'asset_lookup_results', 'asset_group_read_results',
        'asset_group_update_patches', 'inspected_image_source_content'
    )),
    old_record_sha256 BYTEA NOT NULL CHECK (octet_length(old_record_sha256)=32),
    new_record_sha256 BYTEA NOT NULL CHECK (octet_length(new_record_sha256)=32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (operation_id, transaction_id, table_name, old_record_sha256)
);
CREATE TRIGGER immutable_encryption_rewrap_authorization
    BEFORE UPDATE OR DELETE ON encryption_rewrap_authorizations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION niu_authorized_encryption_rewrap(
    relation_name TEXT, cipher_column TEXT, old_record JSONB, new_record JSONB
) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        old_record->>cipher_column IS NOT NULL
        AND new_record->>cipher_column IS NOT NULL
        AND (old_record-cipher_column)=(new_record-cipher_column)
        AND EXISTS (
            SELECT 1 FROM encryption_rewrap_authorizations a
            JOIN encryption_rotation_operations o ON o.id=a.operation_id
            WHERE o.completed_at IS NULL
              AND a.transaction_id=txid_current()
              AND a.table_name=relation_name
              AND a.old_record_sha256=sha256(convert_to(old_record::TEXT,'UTF8'))
              AND a.new_record_sha256=sha256(convert_to(new_record::TEXT,'UTF8'))
        ), FALSE)
$$;

CREATE OR REPLACE FUNCTION preserve_asset_management_credential_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND niu_authorized_encryption_rewrap(
        TG_TABLE_NAME, 'credential_ciphertext', to_jsonb(OLD), to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
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

CREATE OR REPLACE FUNCTION preserve_asset_listing_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND niu_authorized_encryption_rewrap(
        TG_TABLE_NAME, 'ciphertext', to_jsonb(OLD), to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS NULL
       AND NEW.deleted_at IS NOT NULL AND NEW.listing_id=OLD.listing_id AND NEW.expires_at=OLD.expires_at THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'asset listing results permit erasure only' USING ERRCODE='23514';
END;
$$;

CREATE OR REPLACE FUNCTION preserve_asset_lookup_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND niu_authorized_encryption_rewrap(
        TG_TABLE_NAME, 'ciphertext', to_jsonb(OLD), to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS NULL
       AND NEW.deleted_at IS NOT NULL AND NEW.lookup_id=OLD.lookup_id AND NEW.expires_at=OLD.expires_at THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'asset lookup results permit erasure only' USING ERRCODE='23514';
END;
$$;

CREATE OR REPLACE FUNCTION preserve_asset_group_read_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND niu_authorized_encryption_rewrap(
        TG_TABLE_NAME, 'ciphertext', to_jsonb(OLD), to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS NULL
       AND NEW.deleted_at IS NOT NULL AND NEW.read_id=OLD.read_id AND NEW.expires_at=OLD.expires_at THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'asset read results permit erasure only' USING ERRCODE='23514';
END;
$$;

CREATE OR REPLACE FUNCTION preserve_asset_group_update_patch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND niu_authorized_encryption_rewrap(
        TG_TABLE_NAME, 'ciphertext', to_jsonb(OLD), to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS NULL
       AND NEW.deleted_at IS NOT NULL AND NEW.update_id=OLD.update_id AND NEW.expires_at=OLD.expires_at THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'asset group update patch permits erasure only' USING ERRCODE='23514';
END;
$$;

CREATE FUNCTION preserve_inspected_image_envelope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF niu_authorized_encryption_rewrap(
        TG_TABLE_NAME, 'ciphertext', to_jsonb(OLD), to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'inspected image content is immutable outside authorized re-encryption' USING ERRCODE='23514';
END;
$$;
DROP TRIGGER immutable_inspected_image_source_bytes ON inspected_image_source_content;
CREATE TRIGGER immutable_inspected_image_source_bytes BEFORE UPDATE ON inspected_image_source_content
    FOR EACH ROW EXECUTE FUNCTION preserve_inspected_image_envelope();

CREATE OR REPLACE FUNCTION niu_invalidate_supplier_route_qualification() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    affected RECORD;
BEGIN
    IF niu_authorized_encryption_rewrap(
        TG_TABLE_NAME, 'credential_ciphertext', to_jsonb(OLD), to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
    FOR affected IN
        UPDATE provider_offers
           SET active = FALSE, current_qualification_review = NULL
         WHERE vendor_id = OLD.id
           AND current_qualification_review IS NOT NULL
        RETURNING provider_id, id
    LOOP
        INSERT INTO provider_audit_events(provider_id, action, resource_id)
        VALUES (affected.provider_id, 'route_qualification_invalidated', affected.id);
    END LOOP;
    RETURN NEW;
END;
$$;
