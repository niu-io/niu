-- Immutable pre-dispatch recovery identity; never contains plaintext credentials.
CREATE TABLE media_recovery_routes (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    vendor_revision BIGINT NOT NULL CHECK (vendor_revision > 0),
    model_revision BIGINT NOT NULL CHECK (model_revision > 0),
    upstream_model TEXT NOT NULL,
    schema_revision TEXT NOT NULL,
    adapter TEXT NOT NULL,
    api_base TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, project_id, attempt_id),
    UNIQUE (attempt_id, vendor_id),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES attempts(organization_id, project_id, id)
);
CREATE TRIGGER immutable_media_recovery_route BEFORE UPDATE OR DELETE ON media_recovery_routes
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE media_upstream_job_claims (
    attempt_id UUID PRIMARY KEY REFERENCES media_jobs(attempt_id),
    vendor_id UUID NOT NULL,
    upstream_job_id TEXT NOT NULL,
    UNIQUE (vendor_id, upstream_job_id),
    FOREIGN KEY (attempt_id, vendor_id) REFERENCES media_recovery_routes(attempt_id, vendor_id)
);
CREATE TRIGGER immutable_media_upstream_job_claim BEFORE UPDATE OR DELETE ON media_upstream_job_claims
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
