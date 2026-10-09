DROP TRIGGER asset_group_intent_transitions ON asset_group_create_intents;
ALTER TABLE asset_group_create_intents ALTER COLUMN request_body DROP NOT NULL;
ALTER TABLE asset_group_create_intents ADD COLUMN request_fingerprint BYTEA;
ALTER TABLE asset_group_create_intents ADD COLUMN request_expires_at TIMESTAMPTZ;
UPDATE asset_group_create_intents SET request_fingerprint=sha256(convert_to(request_body::text,'UTF8')),request_expires_at=created_at+interval '24 hours';
ALTER TABLE asset_group_create_intents ALTER COLUMN request_fingerprint SET NOT NULL;
ALTER TABLE asset_group_create_intents ALTER COLUMN request_expires_at SET NOT NULL;
ALTER TABLE asset_group_create_intents ADD CONSTRAINT asset_group_request_digest_size CHECK (octet_length(request_fingerprint)=32);
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
        IF OLD.request_body IS NOT NULL AND NEW.request_body IS NULL AND OLD.request_expires_at<=clock_timestamp()
           AND (NEW.state,NEW.upstream_group_id,NEW.updated_at) IS NOT DISTINCT FROM (OLD.state,OLD.upstream_group_id,OLD.updated_at)
           THEN RETURN NEW; END IF;
    END IF;
    RAISE EXCEPTION 'asset creation intent is immutable outside forward transitions or expired content erasure';
END;
$$;
CREATE TRIGGER asset_group_intent_transitions BEFORE UPDATE OR DELETE ON asset_group_create_intents
FOR EACH ROW EXECUTE FUNCTION preserve_asset_group_intent();
CREATE INDEX asset_group_request_expiry ON asset_group_create_intents(request_expires_at,id) WHERE request_body IS NOT NULL;
