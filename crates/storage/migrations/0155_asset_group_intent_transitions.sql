CREATE FUNCTION preserve_asset_group_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND
       (NEW.id,NEW.organization_id,NEW.project_id,NEW.idempotency_key,NEW.vendor_id,NEW.credential_revision,NEW.upstream_project,NEW.request_body,NEW.created_at)
       IS NOT DISTINCT FROM
       (OLD.id,OLD.organization_id,OLD.project_id,OLD.idempotency_key,OLD.vendor_id,OLD.credential_revision,OLD.upstream_project,OLD.request_body,OLD.created_at)
       AND ((OLD.state='prepared' AND NEW.state='dispatching') OR
            (OLD.state='dispatching' AND NEW.state IN ('uncertain','succeeded')) OR
            (OLD.state='uncertain' AND NEW.state='succeeded')) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'asset creation intent is immutable outside forward transitions';
END;
$$;
CREATE TRIGGER asset_group_intent_transitions BEFORE UPDATE OR DELETE ON asset_group_create_intents
FOR EACH ROW EXECUTE FUNCTION preserve_asset_group_intent();
