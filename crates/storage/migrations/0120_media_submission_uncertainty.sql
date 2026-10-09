-- A lost create response must survive restart even without an upstream job ID.
CREATE TABLE media_submission_uncertainty (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES media_recovery_routes(organization_id, project_id, attempt_id)
);
CREATE TRIGGER immutable_media_submission_uncertainty BEFORE UPDATE OR DELETE
    ON media_submission_uncertainty FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE FUNCTION require_dispatched_media_uncertainty() RETURNS trigger AS $$
BEGIN
    PERFORM 1 FROM attempts WHERE id=NEW.attempt_id
        AND organization_id=NEW.organization_id AND project_id=NEW.project_id
        AND dispatched_at IS NOT NULL FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'dispatched media attempt required' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER require_dispatched_media_uncertainty BEFORE INSERT
    ON media_submission_uncertainty FOR EACH ROW EXECUTE FUNCTION require_dispatched_media_uncertainty();
