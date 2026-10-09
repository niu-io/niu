-- A submission key and its original attempt commit atomically. Never expire a
-- key into permission to create a second paid job. Store digests, not prompts.
CREATE TABLE media_submission_keys (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_digest BYTEA NOT NULL CHECK (octet_length(key_digest) = 32),
    request_digest BYTEA NOT NULL CHECK (octet_length(request_digest) = 32),
    attempt_id UUID NOT NULL UNIQUE,
    PRIMARY KEY (organization_id, project_id, key_digest),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES attempts(organization_id, project_id, id)
        DEFERRABLE INITIALLY DEFERRED
);
CREATE TRIGGER immutable_media_submission_keys BEFORE UPDATE OR DELETE
ON media_submission_keys FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
