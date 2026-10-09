-- Pin the protocol separately from mutable model capabilities. Do not invent a
-- historical protocol when the original configuration is no longer available.
CREATE TABLE media_recovery_protocols (
    attempt_id UUID PRIMARY KEY REFERENCES media_recovery_routes(attempt_id),
    channel TEXT NOT NULL CHECK (length(channel) BETWEEN 1 AND 256)
);

INSERT INTO media_recovery_protocols(attempt_id,channel)
SELECT r.attempt_id,m.capabilities->'video_schema'->>'channel'
FROM media_recovery_routes r
JOIN attempts a ON a.id=r.attempt_id
JOIN vendors v ON v.id=r.vendor_id
JOIN vendor_models m ON m.alias=a.resource_id AND m.vendor_id=r.vendor_id
WHERE v.revision=r.vendor_revision AND m.revision=r.model_revision
  AND v.adapter=r.adapter AND v.api_base=r.api_base
  AND m.upstream_model=r.upstream_model
  AND m.capabilities->'video_schema'->>'revision'=r.schema_revision
  AND length(m.capabilities->'video_schema'->>'channel') BETWEEN 1 AND 256;

CREATE TRIGGER immutable_media_recovery_protocols BEFORE UPDATE OR DELETE
    ON media_recovery_protocols FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION validate_media_recovery_protocol() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM media_recovery_routes r JOIN attempts a ON a.id=r.attempt_id
        JOIN vendors v ON v.id=r.vendor_id
        JOIN vendor_models m ON m.alias=a.resource_id AND m.vendor_id=r.vendor_id
        WHERE r.attempt_id=NEW.attempt_id AND a.dispatched_at IS NULL
          AND v.revision=r.vendor_revision AND m.revision=r.model_revision
          AND v.adapter=r.adapter AND v.api_base=r.api_base
          AND m.upstream_model=r.upstream_model
          AND m.capabilities->'video_schema'->>'revision'=r.schema_revision
          AND m.capabilities->'video_schema'->>'channel'=NEW.channel
    ) THEN
        RAISE EXCEPTION 'media recovery protocol must match original unsent route' USING ERRCODE='P0008';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_media_recovery_protocol BEFORE INSERT ON media_recovery_protocols
    FOR EACH ROW EXECUTE FUNCTION validate_media_recovery_protocol();

CREATE FUNCTION require_media_recovery_protocol() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution='may_have_executed' AND OLD.execution='not_sent'
        AND EXISTS (SELECT 1 FROM media_recovery_routes WHERE attempt_id=NEW.id)
        AND NOT EXISTS (SELECT 1 FROM media_recovery_protocols WHERE attempt_id=NEW.id) THEN
        RAISE EXCEPTION 'video dispatch requires original recovery protocol' USING ERRCODE='P0008';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_media_recovery_protocol BEFORE UPDATE ON attempts
    FOR EACH ROW EXECUTE FUNCTION require_media_recovery_protocol();
