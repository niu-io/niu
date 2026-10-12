-- Durable customer workspace content, independent of short-lived inspection.
CREATE TABLE workspace_asset_library (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    name TEXT NOT NULL CHECK (octet_length(name) BETWEEN 1 AND 200),
    media_kind TEXT NOT NULL CHECK (media_kind IN ('image','video','audio')),
    content_type TEXT NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp','video/mp4','video/webm','audio/wav','audio/mpeg','audio/ogg')),
    content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
    byte_length BIGINT NOT NULL CHECK (byte_length BETWEEN 1 AND 8388608),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (organization_id,project_id,id),
    FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
    CHECK ((media_kind='image' AND content_type IN ('image/png','image/jpeg','image/webp'))
        OR (media_kind='video' AND content_type IN ('video/mp4','video/webm'))
        OR (media_kind='audio' AND content_type IN ('audio/wav','audio/mpeg','audio/ogg')))
);
CREATE INDEX workspace_asset_library_directory ON workspace_asset_library(organization_id,project_id,created_at,id) WHERE deleted_at IS NULL;
CREATE TABLE workspace_asset_library_content (
    asset_id UUID PRIMARY KEY REFERENCES workspace_asset_library(id),
    ciphertext BYTEA NOT NULL CHECK (octet_length(ciphertext) BETWEEN 29 AND 8388736)
);
CREATE FUNCTION preserve_workspace_asset_bytes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND niu_authorized_encryption_rewrap(
        TG_TABLE_NAME,'ciphertext',to_jsonb(OLD),to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
    IF TG_OP='DELETE' AND EXISTS (
        SELECT 1 FROM workspace_asset_library WHERE id=OLD.asset_id AND deleted_at IS NOT NULL
    ) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'workspace asset content permits authorized rotation or deletion only' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_workspace_asset_bytes BEFORE UPDATE OR DELETE ON workspace_asset_library_content
FOR EACH ROW EXECUTE FUNCTION preserve_workspace_asset_bytes();
CREATE TABLE workspace_asset_library_events (
    asset_id UUID NOT NULL REFERENCES workspace_asset_library(id),
    revision BIGINT NOT NULL CHECK (revision > 0),
    actor TEXT NOT NULL CHECK (octet_length(actor) BETWEEN 1 AND 200),
    operation TEXT NOT NULL CHECK (operation IN ('created','renamed','deleted')),
    name TEXT NOT NULL CHECK (octet_length(name) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (asset_id,revision)
);
CREATE TRIGGER immutable_workspace_asset_event BEFORE UPDATE OR DELETE ON workspace_asset_library_events
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
-- Rotation needs a narrowly reviewed maintenance bypass for encrypted-byte
-- UPDATE, as with existing immutable encrypted-content domains. Ordinary
-- application rename/delete never updates immutable content bytes or identity.

-- Protect content identity and irreversible tombstones independently of handlers.
CREATE FUNCTION preserve_workspace_asset_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND OLD.deleted_at IS NULL
       AND ROW(NEW.id,NEW.organization_id,NEW.project_id,NEW.media_kind,NEW.content_type,NEW.content_sha256,NEW.byte_length,NEW.created_at)
           IS NOT DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.project_id,OLD.media_kind,OLD.content_type,OLD.content_sha256,OLD.byte_length,OLD.created_at)
       AND NEW.revision=OLD.revision+1 AND NEW.updated_at>=OLD.updated_at
    THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'workspace asset identity and tombstones are immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_workspace_asset_identity BEFORE UPDATE OR DELETE ON workspace_asset_library
FOR EACH ROW EXECUTE FUNCTION preserve_workspace_asset_identity();
ALTER TABLE encryption_rewrap_authorizations DROP CONSTRAINT encryption_rewrap_authorizations_table_name_check;
ALTER TABLE encryption_rewrap_authorizations ADD CONSTRAINT encryption_rewrap_authorizations_table_name_check CHECK (table_name IN (
    'vendors','vendor_asset_management_credentials','codex_connections','payment_gateway_configuration',
    'media_result_references','asset_listing_results','asset_lookup_results','asset_group_read_results',
    'asset_group_update_patches','inspected_image_source_content','workspace_asset_library_content'
));

CREATE FUNCTION require_live_workspace_asset_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM workspace_asset_library WHERE id=NEW.asset_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'workspace asset content requires a live identity' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_live_workspace_asset_content BEFORE INSERT ON workspace_asset_library_content
FOR EACH ROW EXECUTE FUNCTION require_live_workspace_asset_content();
