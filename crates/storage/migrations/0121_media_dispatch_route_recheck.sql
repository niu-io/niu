-- Validate the pre-dispatch pin again at the transition that permits egress.
-- Existing jobs retain historical identity; route changes never authorize replay.
CREATE FUNCTION require_current_media_dispatch_route() RETURNS trigger AS $$
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' THEN
        IF OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM media_recovery_routes WHERE attempt_id=NEW.id) THEN
        RETURN NEW;
    END IF;
    PERFORM v.id FROM vendors v JOIN media_recovery_routes r ON r.vendor_id=v.id
        WHERE r.attempt_id=NEW.id FOR SHARE OF v;
    PERFORM m.alias FROM vendor_models m WHERE m.alias=NEW.resource_id FOR SHARE;
    IF NOT EXISTS (
        SELECT 1 FROM media_recovery_routes r
        JOIN vendors v ON v.id=r.vendor_id
        JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=NEW.resource_id
        WHERE r.attempt_id=NEW.id AND r.organization_id=NEW.organization_id
          AND r.project_id=NEW.project_id AND v.enabled AND m.enabled
          AND v.revision=r.vendor_revision AND m.revision=r.model_revision
          AND v.adapter=r.adapter AND v.api_base=r.api_base
          AND m.upstream_model=r.upstream_model
          AND m.capabilities->'video_schema'->>'revision'=r.schema_revision
          AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership o
              WHERE o.vendor_id=v.id AND o.organization_id<>NEW.organization_id)
    ) THEN
        RAISE EXCEPTION 'media dispatch route changed' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER require_current_media_dispatch_route
    BEFORE INSERT OR UPDATE OF execution ON attempts
    FOR EACH ROW EXECUTE FUNCTION require_current_media_dispatch_route();
