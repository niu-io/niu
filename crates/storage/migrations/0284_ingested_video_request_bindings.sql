-- Private immutable reference metadata; no upstream URI or image content.
CREATE TABLE ingested_video_request_bindings (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    content_position INTEGER NOT NULL CHECK(content_position BETWEEN 0 AND 31),
    ingestion_id UUID NOT NULL REFERENCES asset_image_ingestion_consents(id),
    readiness_id UUID NOT NULL REFERENCES ingested_image_readiness_claims(id),
    body_sha256 TEXT NOT NULL CHECK(body_sha256 ~ '^[a-f0-9]{64}$'),
    binding_sha256 TEXT NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$'),
    schema_revision TEXT NOT NULL,
    expires_at_ms BIGINT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(attempt_id,content_position),
    FOREIGN KEY(organization_id,project_id,attempt_id) REFERENCES media_recovery_routes(organization_id,project_id,attempt_id),
    FOREIGN KEY(organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id)
);
CREATE FUNCTION require_prepared_ingested_video_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM attempts a
      JOIN media_recovery_routes route ON route.attempt_id=a.id
      JOIN inspected_guardrail_bindings policy ON policy.attempt_id=a.id
      JOIN asset_image_ingestion_consents consent ON consent.id=NEW.ingestion_id
      JOIN inspected_image_sources source ON source.id=consent.source_id
      JOIN asset_group_create_intents destination ON destination.id=consent.group_intent_id
      JOIN ingested_image_readiness_claims readiness ON readiness.id=NEW.readiness_id AND readiness.consent_id=consent.id
      WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.id=NEW.attempt_id
        AND a.execution='not_sent' AND a.dispatched_at IS NULL
        AND route.schema_revision=NEW.schema_revision AND policy.key_id=NEW.key_id
        AND source.organization_id=NEW.organization_id AND source.project_id=NEW.project_id AND source.key_id=NEW.key_id
        AND route.vendor_id=destination.vendor_id AND route.vendor_revision=destination.vendor_revision
        AND NEW.expires_at_ms>floor(extract(epoch FROM clock_timestamp())*1000)::bigint
      FOR UPDATE OF a;
    IF NOT FOUND THEN RAISE EXCEPTION 'ingested image requires prepared scoped video request'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_prepared_ingested_video_reference BEFORE INSERT ON ingested_video_request_bindings
FOR EACH ROW EXECUTE FUNCTION require_prepared_ingested_video_reference();
CREATE TRIGGER immutable_ingested_video_reference BEFORE UPDATE OR DELETE ON ingested_video_request_bindings
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
-- Time advances even under authorization locks. Recheck at the dispatch update.
CREATE FUNCTION require_current_ingested_video_deadline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.dispatched_at IS NOT NULL AND OLD.dispatched_at IS NULL AND EXISTS(
        SELECT 1 FROM ingested_video_request_bindings binding
        WHERE binding.attempt_id=NEW.id
          AND binding.expires_at_ms<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint
    ) THEN RAISE EXCEPTION 'ingested image dispatch deadline elapsed'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_current_ingested_video_deadline BEFORE UPDATE OF dispatched_at ON attempts
FOR EACH ROW EXECUTE FUNCTION require_current_ingested_video_deadline();
