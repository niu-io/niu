-- Existing pre-route jobs remain historical evidence; new jobs require a pin.
ALTER TABLE media_jobs ADD UNIQUE (attempt_id, upstream_job_id);
ALTER TABLE media_upstream_job_claims ADD FOREIGN KEY (attempt_id, upstream_job_id)
    REFERENCES media_jobs(attempt_id, upstream_job_id);
CREATE FUNCTION require_media_job_recovery_route() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM media_recovery_routes r
        WHERE r.organization_id=NEW.organization_id AND r.project_id=NEW.project_id
        AND r.attempt_id=NEW.attempt_id AND r.schema_revision=NEW.schema_revision) THEN
        RAISE EXCEPTION 'media recovery route required' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER require_media_job_recovery_route BEFORE INSERT ON media_jobs
    FOR EACH ROW EXECUTE FUNCTION require_media_job_recovery_route();
CREATE FUNCTION claim_media_upstream_job() RETURNS trigger AS $$
BEGIN
    INSERT INTO media_upstream_job_claims(attempt_id,vendor_id,upstream_job_id)
    SELECT NEW.attempt_id,r.vendor_id,NEW.upstream_job_id FROM media_recovery_routes r
    WHERE r.attempt_id=NEW.attempt_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER claim_media_upstream_job AFTER INSERT ON media_jobs
    FOR EACH ROW EXECUTE FUNCTION claim_media_upstream_job();
