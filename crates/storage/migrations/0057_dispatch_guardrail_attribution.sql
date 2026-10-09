-- Allowed dispatch attribution only; denied transitions roll back and are not recorded here.
CREATE TABLE dispatch_guardrail_decisions (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id, project_id, attempt_id),
    FOREIGN KEY (organization_id, project_id, attempt_id) REFERENCES attempts(organization_id, project_id, id),
    FOREIGN KEY (organization_id, project_id, workspace_revision) REFERENCES workspace_guardrail_revisions(organization_id, project_id, revision),
    FOREIGN KEY (organization_id, project_id, key_policy_revision) REFERENCES workspace_guardrail_revisions(organization_id, project_id, revision),
    CHECK (key_assignment_revision IS NULL OR key_assignment_revision > 0)
);
CREATE TRIGGER immutable_dispatch_guardrail_decision
BEFORE UPDATE OR DELETE ON dispatch_guardrail_decisions
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION niu_record_dispatch_guardrails() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    -- Existing dispatch checks hold workspace coordination and the key row lock.
    INSERT INTO dispatch_guardrail_decisions (
        organization_id, project_id, attempt_id, workspace_revision,
        key_policy_revision, key_assignment_revision
    ) VALUES (
        NEW.organization_id, NEW.project_id, NEW.id,
        (SELECT NULLIF(revision,0) FROM workspace_guardrail_heads WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id),
        (SELECT policy_revision FROM key_guardrail_assignments WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND key_id=NEW.api_key_id),
        (SELECT assignment_revision FROM key_guardrail_assignments WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND key_id=NEW.api_key_id)
    );
    RETURN NEW;
END;
$$;
CREATE TRIGGER zz_record_dispatch_guardrail_decision
BEFORE UPDATE OF execution ON attempts
FOR EACH ROW EXECUTE FUNCTION niu_record_dispatch_guardrails();
