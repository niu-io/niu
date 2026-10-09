-- Serialize observations with completion and settlement on the attempt lock.
CREATE FUNCTION lock_media_status_attempt() RETURNS trigger AS $$
BEGIN
    PERFORM 1 FROM attempts WHERE organization_id=NEW.organization_id
        AND project_id=NEW.project_id AND id=NEW.attempt_id FOR UPDATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER lock_media_status_attempt BEFORE INSERT ON media_job_observations
    FOR EACH ROW EXECUTE FUNCTION lock_media_status_attempt();
CREATE FUNCTION require_media_completion_evidence() RETURNS trigger AS $$
BEGIN
    IF NEW.execution='confirmed_completed'
       AND EXISTS(SELECT 1 FROM media_jobs WHERE attempt_id=NEW.id)
       AND (NOT EXISTS(SELECT 1 FROM media_job_observations WHERE attempt_id=NEW.id AND status='succeeded')
            OR EXISTS(SELECT 1 FROM media_job_observations WHERE attempt_id=NEW.id AND status='failed')) THEN
        RAISE EXCEPTION 'media completion unresolved' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER require_media_completion_evidence BEFORE UPDATE OF execution ON attempts
    FOR EACH ROW EXECUTE FUNCTION require_media_completion_evidence();
