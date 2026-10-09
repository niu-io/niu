-- Output-aware routes cannot reach egress without their saved specification.
CREATE FUNCTION require_media_output_before_dispatch() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.dispatched_at IS NULL AND NEW.dispatched_at IS NOT NULL AND EXISTS (
        SELECT 1 FROM media_recovery_routes r JOIN vendor_models m
          ON m.vendor_id=r.vendor_id AND m.alias=NEW.resource_id
        WHERE r.attempt_id=NEW.id
          AND m.capabilities->'video_schema'->'output' IS NOT NULL
          AND m.capabilities->'video_schema'->'output' <> 'null'::jsonb
          AND NOT EXISTS (SELECT 1 FROM media_output_snapshots s WHERE s.attempt_id=NEW.id)
    ) THEN
        RAISE EXCEPTION 'media dispatch requires effective output snapshot';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER require_media_output_before_dispatch BEFORE UPDATE OF dispatched_at ON attempts
    FOR EACH ROW EXECUTE FUNCTION require_media_output_before_dispatch();
