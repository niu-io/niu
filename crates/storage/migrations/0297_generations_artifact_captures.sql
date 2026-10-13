-- An explicit copy into the existing encrypted workspace library, not a task store.
CREATE TABLE generations_artifact_captures (
 id UUID PRIMARY KEY,
 organization_id UUID NOT NULL, project_id UUID NOT NULL,
 task_id UUID NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('video','last_frame')),
 owner TEXT NOT NULL CHECK(octet_length(owner) BETWEEN 1 AND 200),
 name TEXT NOT NULL CHECK(octet_length(name) BETWEEN 1 AND 200),
 mode TEXT NOT NULL CHECK(mode IN ('cached','fresh')), key_id UUID,
 state TEXT NOT NULL CHECK(state IN ('preparing','stored','failed')),
 lease_token UUID, lease_expires_at TIMESTAMPTZ,
 asset_id UUID, failure_category TEXT CHECK(failure_category IN ('delivery_failed','authorization_changed','invalid_media','capacity_exceeded','storage_unavailable','encryption_unavailable')),
 CHECK((mode='cached' AND key_id IS NULL) OR mode='fresh'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,project_id,task_id) REFERENCES attempts(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,asset_id) REFERENCES workspace_asset_library(organization_id,project_id,id),
 CHECK((state='preparing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND asset_id IS NULL AND failure_category IS NULL)
 OR (state='stored' AND lease_token IS NULL AND lease_expires_at IS NULL AND asset_id IS NOT NULL AND asset_id=id AND failure_category IS NULL)
 OR (state='failed' AND lease_token IS NULL AND lease_expires_at IS NULL AND asset_id IS NULL AND failure_category IS NOT NULL))
);
-- Failed attempts remain diagnosable without monopolizing future explicit requests.
CREATE UNIQUE INDEX generation_capture_active_source ON generations_artifact_captures(organization_id,project_id,task_id,kind)
 WHERE state IN ('preparing','stored');
CREATE INDEX generation_capture_source_history ON generations_artifact_captures(organization_id,project_id,task_id,kind,created_at DESC,id DESC);
CREATE FUNCTION preserve_generation_capture_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.organization_id,NEW.project_id,NEW.task_id,NEW.kind,NEW.owner,NEW.name,NEW.mode,NEW.key_id,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.project_id,OLD.task_id,OLD.kind,OLD.owner,OLD.name,OLD.mode,OLD.key_id,OLD.created_at)
 OR OLD.state='stored' THEN
  RAISE EXCEPTION 'capture source identity and stored outcome are permanent';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_generation_capture_identity BEFORE UPDATE ON generations_artifact_captures
 FOR EACH ROW EXECUTE FUNCTION preserve_generation_capture_identity();
CREATE TRIGGER preserve_generation_capture_history BEFORE DELETE ON generations_artifact_captures
 FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
