ALTER TABLE guardrail_preparation_denials DROP CONSTRAINT guardrail_preparation_denials_reason_check;
ALTER TABLE guardrail_preparation_denials ADD CONSTRAINT guardrail_preparation_denials_reason_check CHECK (
    reason IN ('model_denied','provider_denied','unsupported_policy','input_blocked','input_unsupported','input_resource_limit','input_unavailable')
);
CREATE OR REPLACE FUNCTION niu_check_inspected_guardrail_binding() RETURNS trigger LANGUAGE plpgsql AS $$
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
    IF NOT FOUND THEN
        IF EXISTS (
            SELECT 1 FROM workspace_guardrail_heads h
            JOIN workspace_guardrail_revisions r USING(organization_id,project_id,revision)
            WHERE h.organization_id=NEW.organization_id AND h.project_id=NEW.project_id
              AND jsonb_array_length(COALESCE(r.policy->'input_rules','[]'::jsonb)) > 0
        ) OR EXISTS (
            SELECT 1 FROM key_guardrail_assignments a
            JOIN workspace_guardrail_revisions r ON r.organization_id=a.organization_id AND r.project_id=a.project_id AND r.revision=a.policy_revision
            WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id
              AND jsonb_array_length(COALESCE(r.policy->'input_rules','[]'::jsonb)) > 0
        ) THEN
            RAISE EXCEPTION 'input inspection binding required' USING ERRCODE='P0006';
        END IF;
        RETURN NEW;
    END IF;
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
