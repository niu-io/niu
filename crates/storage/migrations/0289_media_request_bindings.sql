-- Exact prepared media request identity. Source content and private delivery
-- capabilities never belong in these immutable metadata bindings.
ALTER TABLE media_processing_approvals ADD CONSTRAINT media_approval_scope_key_identity
    UNIQUE (organization_id,project_id,key_id,id);

CREATE TABLE media_request_bindings (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    body_sha256 TEXT NOT NULL CHECK (body_sha256 ~ '^[a-f0-9]{64}$'),
    schema_revision TEXT NOT NULL CHECK (length(schema_revision) BETWEEN 1 AND 256),
    media_positions INTEGER[] NOT NULL CHECK (
        cardinality(media_positions) BETWEEN 1 AND 32
        AND 0 <= ALL(media_positions) AND 31 >= ALL(media_positions)),
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (organization_id,project_id,key_id,attempt_id),
    FOREIGN KEY (organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
    FOREIGN KEY (organization_id,project_id,attempt_id) REFERENCES media_recovery_routes(organization_id,project_id,attempt_id)
);

CREATE TABLE media_request_approval_bindings (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    approval_id UUID NOT NULL UNIQUE,
    PRIMARY KEY (organization_id,project_id,key_id,attempt_id,approval_id),
    FOREIGN KEY (organization_id,project_id,key_id,attempt_id)
        REFERENCES media_request_bindings(organization_id,project_id,key_id,attempt_id),
    FOREIGN KEY (organization_id,project_id,key_id,approval_id)
        REFERENCES media_processing_approvals(organization_id,project_id,key_id,id)
);

CREATE FUNCTION require_prepared_media_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM attempts attempt
      JOIN media_recovery_routes route ON route.attempt_id=attempt.id
      JOIN inspected_guardrail_bindings policy ON policy.attempt_id=attempt.id
      WHERE attempt.organization_id=NEW.organization_id
        AND attempt.project_id=NEW.project_id AND attempt.id=NEW.attempt_id
        AND attempt.api_key_id=NEW.key_id
        AND attempt.execution='not_sent' AND attempt.dispatched_at IS NULL
        AND route.schema_revision=NEW.schema_revision AND policy.key_id=NEW.key_id
        AND policy.workspace_revision IS NOT DISTINCT FROM NEW.workspace_revision
        AND policy.key_policy_revision IS NOT DISTINCT FROM NEW.key_policy_revision
        AND policy.key_assignment_revision IS NOT DISTINCT FROM NEW.key_assignment_revision
      FOR UPDATE OF attempt;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'media request requires prepared scoped route and policy binding' USING ERRCODE='23514';
    END IF;
    IF (SELECT count(DISTINCT position) FROM unnest(NEW.media_positions) position)
        <> cardinality(NEW.media_positions) THEN
        RAISE EXCEPTION 'media request positions must be unique' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION require_scoped_media_request_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM media_request_bindings request
      JOIN media_processing_approvals approval ON approval.id=NEW.approval_id
      JOIN attempts attempt ON attempt.id=request.attempt_id
      WHERE request.organization_id=NEW.organization_id
        AND request.project_id=NEW.project_id AND request.key_id=NEW.key_id
        AND request.attempt_id=NEW.attempt_id
        AND approval.organization_id=NEW.organization_id
        AND approval.project_id=NEW.project_id AND approval.key_id=NEW.key_id
        AND approval.content_position=ANY(request.media_positions)
        AND approval.workspace_revision IS NOT DISTINCT FROM request.workspace_revision
        AND approval.key_policy_revision IS NOT DISTINCT FROM request.key_policy_revision
        AND approval.key_assignment_revision IS NOT DISTINCT FROM request.key_assignment_revision
        AND attempt.execution='not_sent' AND attempt.dispatched_at IS NULL
      FOR UPDATE OF attempt;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'media approval requires matching prepared scope and policy epochs' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER require_prepared_media_request BEFORE INSERT ON media_request_bindings
FOR EACH ROW EXECUTE FUNCTION require_prepared_media_request();
CREATE TRIGGER require_scoped_media_request_approval BEFORE INSERT ON media_request_approval_bindings
FOR EACH ROW EXECUTE FUNCTION require_scoped_media_request_approval();
CREATE TRIGGER immutable_media_request_binding BEFORE UPDATE OR DELETE ON media_request_bindings
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_media_request_approval_binding BEFORE UPDATE OR DELETE ON media_request_approval_bindings
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
