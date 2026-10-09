-- Private exact-request metadata; no image or request body is retained here.
ALTER TABLE image_processing_approvals ADD CONSTRAINT image_approval_scope_key_identity UNIQUE(organization_id,project_id,key_id,id);
CREATE TABLE image_request_bindings (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    body_sha256 TEXT NOT NULL CHECK(body_sha256 ~ '^[a-f0-9]{64}$'),
    schema_revision TEXT NOT NULL,
    image_positions INTEGER[] NOT NULL CHECK(cardinality(image_positions) BETWEEN 1 AND 256 AND 0 <= ALL(image_positions) AND 255 >= ALL(image_positions)),
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(organization_id,project_id,key_id,attempt_id),
    FOREIGN KEY(organization_id,project_id,attempt_id) REFERENCES media_recovery_routes(organization_id,project_id,attempt_id),
    FOREIGN KEY(organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id)
);
CREATE TABLE image_request_approval_bindings (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    approval_id UUID PRIMARY KEY,
    FOREIGN KEY(organization_id,project_id,key_id,attempt_id) REFERENCES image_request_bindings(organization_id,project_id,key_id,attempt_id),
    FOREIGN KEY(organization_id,project_id,key_id,approval_id) REFERENCES image_processing_approvals(organization_id,project_id,key_id,id)
);
CREATE FUNCTION require_prepared_image_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM attempts a JOIN media_recovery_routes r ON r.attempt_id=a.id
      JOIN inspected_guardrail_bindings b ON b.attempt_id=a.id
      WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.id=NEW.attempt_id
        AND a.execution='not_sent' AND a.dispatched_at IS NULL
        AND b.key_id=NEW.key_id AND r.schema_revision=NEW.schema_revision
        AND b.workspace_revision IS NOT DISTINCT FROM NEW.workspace_revision
        AND b.key_policy_revision IS NOT DISTINCT FROM NEW.key_policy_revision
        AND b.key_assignment_revision IS NOT DISTINCT FROM NEW.key_assignment_revision
      FOR UPDATE OF a;
    IF NOT FOUND THEN RAISE EXCEPTION 'image request requires prepared scoped route and policy binding'; END IF;
    IF (SELECT count(DISTINCT position) FROM unnest(NEW.image_positions) position) <> cardinality(NEW.image_positions) THEN
      RAISE EXCEPTION 'image positions must be distinct';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_prepared_image_request BEFORE INSERT ON image_request_bindings FOR EACH ROW EXECUTE FUNCTION require_prepared_image_request();
CREATE FUNCTION require_scoped_image_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM image_request_bindings r JOIN image_processing_approvals p
      ON p.organization_id=r.organization_id AND p.project_id=r.project_id AND p.key_id=r.key_id
      JOIN attempts a ON a.id=r.attempt_id
      WHERE r.attempt_id=NEW.attempt_id AND p.id=NEW.approval_id
        AND r.organization_id=NEW.organization_id AND r.project_id=NEW.project_id AND r.key_id=NEW.key_id
        AND p.content_position=ANY(r.image_positions)
        AND p.workspace_revision IS NOT DISTINCT FROM r.workspace_revision
        AND p.key_policy_revision IS NOT DISTINCT FROM r.key_policy_revision
        AND p.key_assignment_revision IS NOT DISTINCT FROM r.key_assignment_revision
        AND a.execution='not_sent' AND a.dispatched_at IS NULL FOR UPDATE OF a;
    IF NOT FOUND THEN RAISE EXCEPTION 'image approval does not match prepared request'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_scoped_image_approval BEFORE INSERT ON image_request_approval_bindings FOR EACH ROW EXECUTE FUNCTION require_scoped_image_approval();
CREATE TRIGGER immutable_image_request BEFORE UPDATE OR DELETE ON image_request_bindings FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_image_request_approval BEFORE UPDATE OR DELETE ON image_request_approval_bindings FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
-- The 0142 dispatch guard remains active until gateway policy and qualification
-- checks are integrated. Binding a request alone does not authorize generation.
