-- Immutable local material identity, never bytes or Provider asset references.
CREATE TABLE workspace_asset_video_request_bindings (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    content_position INTEGER NOT NULL CHECK (content_position BETWEEN 0 AND 31),
    asset_id UUID NOT NULL,
    content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
    observed_revision BIGINT NOT NULL CHECK (observed_revision > 0),
    body_sha256 TEXT NOT NULL CHECK (body_sha256 ~ '^[a-f0-9]{64}$'),
    schema_revision TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (attempt_id,content_position),
    FOREIGN KEY (organization_id,project_id,asset_id) REFERENCES workspace_asset_library(organization_id,project_id,id),
    FOREIGN KEY (organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
    FOREIGN KEY (organization_id,project_id,attempt_id) REFERENCES media_recovery_routes(organization_id,project_id,attempt_id)
);
CREATE FUNCTION require_prepared_workspace_asset_video() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM attempts a
      JOIN media_recovery_routes route ON route.attempt_id=a.id
      JOIN image_request_bindings inspection ON inspection.attempt_id=a.id
      JOIN workspace_asset_library material ON material.id=NEW.asset_id
      JOIN workspace_asset_library_content content ON content.asset_id=material.id
      WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id
        AND a.id=NEW.attempt_id AND a.api_key_id=NEW.key_id
        AND a.execution='not_sent' AND a.dispatched_at IS NULL
        AND route.schema_revision=NEW.schema_revision
        AND inspection.organization_id=NEW.organization_id AND inspection.project_id=NEW.project_id
        AND inspection.key_id=NEW.key_id AND inspection.schema_revision=NEW.schema_revision
        AND inspection.body_sha256=NEW.body_sha256
        AND NEW.content_position=ANY(inspection.image_positions)
        AND material.organization_id=NEW.organization_id AND material.project_id=NEW.project_id
        AND material.deleted_at IS NULL AND material.media_kind='image'
        AND material.content_sha256=NEW.content_sha256 AND material.revision>=NEW.observed_revision
      FOR UPDATE OF a FOR SHARE OF material,content;
    IF NOT FOUND THEN RAISE EXCEPTION 'workspace material requires a prepared scoped image request' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_prepared_workspace_asset_video BEFORE INSERT ON workspace_asset_video_request_bindings
FOR EACH ROW EXECUTE FUNCTION require_prepared_workspace_asset_video();
CREATE TRIGGER immutable_workspace_asset_video_binding BEFORE UPDATE OR DELETE ON workspace_asset_video_request_bindings
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
