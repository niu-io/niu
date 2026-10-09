-- Private metadata only. Images, inline encodings, credentials, endpoints and
-- detector response bodies never enter an approval receipt.
CREATE TABLE image_processing_approvals (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    detector_name TEXT NOT NULL CHECK (detector_name ~ '^[a-zA-Z0-9_-]{1,200}$'),
    detector_revision TEXT NOT NULL CHECK (length(detector_revision) BETWEEN 1 AND 256),
    configuration_fingerprint TEXT NOT NULL CHECK (configuration_fingerprint ~ '^[a-f0-9]{64}$'),
    content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
    content_position INTEGER NOT NULL CHECK (content_position BETWEEN 0 AND 255),
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    elapsed_ms BIGINT NOT NULL CHECK (elapsed_ms BETWEEN 0 AND 60000),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
    FOREIGN KEY (organization_id,project_id,workspace_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision),
    FOREIGN KEY (organization_id,project_id,key_policy_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision)
);
CREATE INDEX image_processing_approval_scope_time ON image_processing_approvals(organization_id,project_id,recorded_at DESC);
CREATE TRIGGER immutable_image_processing_approval BEFORE UPDATE OR DELETE ON image_processing_approvals
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
