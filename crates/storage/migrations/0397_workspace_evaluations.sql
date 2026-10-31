-- Customer-owned task/rubric definitions and immutable attributed result runs.
CREATE TABLE workspace_evaluations (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    slug TEXT NOT NULL CHECK(length(slug) BETWEEN 1 AND 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    revision BIGINT NOT NULL CHECK(revision BETWEEN 1 AND 9007199254740991),
    configuration JSONB NOT NULL CHECK(jsonb_typeof(configuration)='object'),
    PRIMARY KEY(organization_id,project_id,slug),
    FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE workspace_evaluation_history (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    slug TEXT NOT NULL,
    revision BIGINT NOT NULL,
    configuration JSONB NOT NULL,
    actor_key_id UUID NOT NULL REFERENCES api_keys(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(organization_id,project_id,slug,revision),
    FOREIGN KEY(organization_id,project_id,slug) REFERENCES workspace_evaluations(organization_id,project_id,slug)
);
CREATE TRIGGER immutable_workspace_evaluation_history BEFORE UPDATE OR DELETE ON workspace_evaluation_history
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE evaluation_attempt_bindings (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    evaluation_slug TEXT NOT NULL,
    evaluation_revision BIGINT NOT NULL,
    sample TEXT NOT NULL,
    protocol TEXT NOT NULL CHECK(protocol IN ('chat','responses','messages','embeddings','generate_content')),
    request_sha256 TEXT NOT NULL CHECK(request_sha256 ~ '^[0-9a-f]{64}$'),
    fingerprint_version INTEGER NOT NULL DEFAULT 1 CHECK(fingerprint_version=1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY(organization_id,project_id,attempt_id) REFERENCES attempts(organization_id,project_id,id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY(organization_id,project_id,evaluation_slug,evaluation_revision) REFERENCES workspace_evaluation_history(organization_id,project_id,slug,revision)
);
CREATE TRIGGER immutable_evaluation_attempt_binding BEFORE UPDATE OR DELETE ON evaluation_attempt_bindings
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE workspace_evaluation_runs (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    evaluation_slug TEXT NOT NULL,
    evaluation_revision BIGINT NOT NULL,
    slug TEXT NOT NULL CHECK(length(slug) BETWEEN 1 AND 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    request_sha256 TEXT NOT NULL CHECK(request_sha256 ~ '^[0-9a-f]{64}$'),
    submission JSONB NOT NULL CHECK(jsonb_typeof(submission)='object'),
    evidence JSONB NOT NULL CHECK(jsonb_typeof(evidence)='object'),
    actor_key_id UUID NOT NULL REFERENCES api_keys(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(organization_id,project_id,evaluation_slug,slug),
    FOREIGN KEY(organization_id,project_id,evaluation_slug,evaluation_revision) REFERENCES workspace_evaluation_history(organization_id,project_id,slug,revision)
);
CREATE TRIGGER immutable_workspace_evaluation_run BEFORE UPDATE OR DELETE ON workspace_evaluation_runs
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
