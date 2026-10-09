-- Internal upstream identifiers stay outside customer response serialization.
CREATE TABLE media_jobs (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    upstream_job_id TEXT NOT NULL CHECK (octet_length(upstream_job_id) BETWEEN 1 AND 512),
    schema_revision TEXT NOT NULL CHECK (octet_length(schema_revision) BETWEEN 1 AND 256),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, project_id, attempt_id),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES attempts(organization_id, project_id, id)
);
CREATE TRIGGER immutable_media_job_binding BEFORE UPDATE OR DELETE ON media_jobs
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE media_job_observations (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','unknown')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (attempt_id, status),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES media_jobs(organization_id, project_id, attempt_id)
);
CREATE TRIGGER immutable_media_job_observation BEFORE UPDATE OR DELETE ON media_job_observations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
