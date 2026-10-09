CREATE TABLE asset_group_request_deletions (
    intent_id UUID PRIMARY KEY REFERENCES asset_group_create_intents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION preserve_asset_group_request_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'asset request deletion event is immutable';
END;
$$;
CREATE TRIGGER asset_group_request_deletion_immutable BEFORE UPDATE OR DELETE ON asset_group_request_deletions
FOR EACH ROW EXECUTE FUNCTION preserve_asset_group_request_deletion();
CREATE OR REPLACE FUNCTION preserve_asset_group_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND
       (NEW.id,NEW.organization_id,NEW.project_id,NEW.idempotency_key,NEW.vendor_id,NEW.vendor_revision,NEW.credential_revision,NEW.upstream_project,NEW.request_fingerprint,NEW.request_expires_at,NEW.created_at)
       IS NOT DISTINCT FROM
       (OLD.id,OLD.organization_id,OLD.project_id,OLD.idempotency_key,OLD.vendor_id,OLD.vendor_revision,OLD.credential_revision,OLD.upstream_project,OLD.request_fingerprint,OLD.request_expires_at,OLD.created_at) THEN
        IF NEW.request_body IS NOT DISTINCT FROM OLD.request_body AND
          ((OLD.state='prepared' AND NEW.state='dispatching') OR
           (OLD.state='dispatching' AND NEW.state IN ('uncertain','succeeded')) OR
           (OLD.state='uncertain' AND NEW.state='succeeded')) THEN RETURN NEW; END IF;
        IF OLD.request_body IS NOT NULL AND NEW.request_body IS NULL AND (OLD.request_expires_at<=clock_timestamp() OR EXISTS (SELECT 1 FROM asset_group_request_deletions d WHERE d.intent_id=OLD.id))
           AND (NEW.state,NEW.upstream_group_id,NEW.updated_at) IS NOT DISTINCT FROM (OLD.state,OLD.upstream_group_id,OLD.updated_at)
           THEN RETURN NEW; END IF;
    END IF;
    RAISE EXCEPTION 'asset creation intent is immutable outside forward transitions or authorized content erasure';
END;
$$;
