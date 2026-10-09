-- Pre-dispatch output/estimate evidence; no prompts, credentials or purchase prices.
CREATE TABLE media_output_snapshots (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    document JSONB NOT NULL CHECK (jsonb_typeof(document) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES media_recovery_routes(organization_id, project_id, attempt_id)
);
CREATE TRIGGER immutable_media_output_snapshot BEFORE UPDATE OR DELETE ON media_output_snapshots
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE FUNCTION require_unsent_media_output_snapshot() RETURNS TRIGGER AS $$
BEGIN
    PERFORM 1 FROM attempts a JOIN media_recovery_routes r ON r.attempt_id=a.id
    WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id
      AND a.id=NEW.attempt_id AND a.dispatched_at IS NULL
      AND NEW.document->'output'->>'schema_revision'=r.schema_revision
    FOR UPDATE OF a;
    IF NOT FOUND THEN RAISE EXCEPTION 'media output snapshot requires unsent pinned route'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER require_unsent_media_output_snapshot BEFORE INSERT ON media_output_snapshots
    FOR EACH ROW EXECUTE FUNCTION require_unsent_media_output_snapshot();
