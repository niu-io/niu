-- Distinguish checked policy rejection from unrelated admission conflicts.
-- Details contain only revision metadata, never policies, payloads or credentials.
CREATE FUNCTION niu_guardrail_rejection_detail(org UUID, workspace UUID, key UUID, reason TEXT)
RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'reason',reason,
        'workspace_revision',(SELECT NULLIF(revision,0) FROM workspace_guardrail_heads WHERE organization_id=org AND project_id=workspace),
        'key_policy_revision',(SELECT policy_revision FROM key_guardrail_assignments WHERE organization_id=org AND project_id=workspace AND key_id=key),
        'key_assignment_revision',(SELECT assignment_revision FROM key_guardrail_assignments WHERE organization_id=org AND project_id=workspace AND key_id=key)
    )::text;
$$;

CREATE OR REPLACE FUNCTION niu_check_dispatch_model_guardrails() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    requested_model TEXT;
    policy JSONB;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    -- Activation takes this same transaction lock before changing the workspace head.
    PERFORM pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||NEW.organization_id::text||':'||NEW.project_id::text,0));
    -- Key assignment/revocation takes the key row lock before changing restrictions.
    PERFORM id FROM api_keys WHERE id=NEW.api_key_id FOR SHARE;
    SELECT model_alias INTO requested_model FROM operations WHERE id=NEW.operation_id;
    FOR policy IN
        SELECT r.policy FROM workspace_guardrail_heads h
        JOIN workspace_guardrail_revisions r USING(organization_id,project_id,revision)
        WHERE h.organization_id=NEW.organization_id AND h.project_id=NEW.project_id
        UNION ALL
        SELECT r.policy FROM key_guardrail_assignments a
        JOIN workspace_guardrail_revisions r ON r.organization_id=a.organization_id
            AND r.project_id=a.project_id AND r.revision=a.policy_revision
        WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id
    LOOP
        IF policy->>'schema_version' IS DISTINCT FROM '1'
           OR NOT niu_model_rule_permits(policy->'models',requested_model)
           OR NOT niu_model_rule_permits(policy->'providers',NEW.dispatch_provider) THEN
            RAISE EXCEPTION 'access guardrail changed before dispatch' USING ERRCODE='P0010', DETAIL=niu_guardrail_rejection_detail(NEW.organization_id,NEW.project_id,NEW.api_key_id,'access_denied');
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

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
            RAISE EXCEPTION 'input inspection binding required' USING ERRCODE='P0010', DETAIL=niu_guardrail_rejection_detail(NEW.organization_id,NEW.project_id,NEW.api_key_id,'input_binding_missing');
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
        RAISE EXCEPTION 'inspected guardrail policy changed' USING ERRCODE='P0010', DETAIL=niu_guardrail_rejection_detail(NEW.organization_id,NEW.project_id,NEW.api_key_id,'policy_changed');
    END IF;
    RETURN NEW;
END;
$$;
