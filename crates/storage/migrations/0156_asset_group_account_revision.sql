-- Existing intents have no trustworthy historical account revision. Zero keeps
-- them readable for reconciliation but ineligible for an upstream claim.
ALTER TABLE asset_group_create_intents ADD COLUMN vendor_revision BIGINT NOT NULL DEFAULT 0 CHECK (vendor_revision>=0);
CREATE OR REPLACE FUNCTION preserve_asset_group_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND
       (NEW.id,NEW.organization_id,NEW.project_id,NEW.idempotency_key,NEW.vendor_id,NEW.vendor_revision,NEW.credential_revision,NEW.upstream_project,NEW.request_body,NEW.created_at)
       IS NOT DISTINCT FROM
       (OLD.id,OLD.organization_id,OLD.project_id,OLD.idempotency_key,OLD.vendor_id,OLD.vendor_revision,OLD.credential_revision,OLD.upstream_project,OLD.request_body,OLD.created_at)
       AND ((OLD.state='prepared' AND NEW.state='dispatching') OR
            (OLD.state='dispatching' AND NEW.state IN ('uncertain','succeeded')) OR
            (OLD.state='uncertain' AND NEW.state='succeeded')) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'asset creation intent is immutable outside forward transitions';
END;
$$;
