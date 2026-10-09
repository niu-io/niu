-- Bind gateway preparation to the policy revisions checked at dispatch.
CREATE TABLE inspected_guardrail_bindings (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    key_id UUID NOT NULL,
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    PRIMARY KEY (organization_id, project_id, attempt_id),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES attempts(organization_id, project_id, id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (organization_id, project_id, key_id)
        REFERENCES api_keys(organization_id, project_id, id)
);
CREATE TRIGGER immutable_inspected_guardrail_binding
BEFORE UPDATE OR DELETE ON inspected_guardrail_bindings
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION niu_check_inspected_guardrail_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    binding inspected_guardrail_bindings%ROWTYPE;
    workspace_revision BIGINT;
    policy_revision BIGINT;
    assignment_revision BIGINT;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    SELECT * INTO binding FROM inspected_guardrail_bindings
        WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND attempt_id=NEW.id;
    -- Compatibility callers still undergo the existing live access checks.
    IF NOT FOUND THEN RETURN NEW; END IF;
    -- Model/provider dispatch checks acquired workspace coordination and key locks.
    SELECT NULLIF(revision,0) INTO workspace_revision FROM workspace_guardrail_heads
        WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id;
    SELECT a.policy_revision,a.assignment_revision INTO policy_revision,assignment_revision
        FROM key_guardrail_assignments a
        WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id;
    IF binding.key_id IS DISTINCT FROM NEW.api_key_id
        OR binding.workspace_revision IS DISTINCT FROM workspace_revision
        OR binding.key_policy_revision IS DISTINCT FROM policy_revision
        OR binding.key_assignment_revision IS DISTINCT FROM assignment_revision THEN
        RAISE EXCEPTION 'inspected guardrail policy changed' USING ERRCODE='P0006';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER zy_check_inspected_guardrail_binding
BEFORE UPDATE OF execution ON attempts
FOR EACH ROW EXECUTE FUNCTION niu_check_inspected_guardrail_binding();
