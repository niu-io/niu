-- Retain denial outside the subtransaction that rejected dispatch.
CREATE TABLE dispatch_guardrail_rejections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    key_id UUID NOT NULL,
    reason TEXT NOT NULL CHECK(reason IN ('access_denied','input_binding_missing','policy_changed')),
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY(organization_id,project_id,attempt_id) REFERENCES attempts(organization_id,project_id,id),
    FOREIGN KEY(organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
    FOREIGN KEY(organization_id,project_id,workspace_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision),
    FOREIGN KEY(organization_id,project_id,key_policy_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision),
    CHECK(key_assignment_revision IS NULL OR key_assignment_revision > 0)
);
CREATE INDEX dispatch_guardrail_rejections_scope_time ON dispatch_guardrail_rejections(organization_id,project_id,recorded_at DESC,id DESC);
CREATE TRIGGER immutable_dispatch_guardrail_rejection BEFORE UPDATE OR DELETE ON dispatch_guardrail_rejections
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- Caller already holds ordered workspace, key, account and attempt locks.
-- Only the rejected UPDATE is rolled back; its safe checked metadata is retained.
CREATE FUNCTION niu_mark_dispatched_with_guardrail_audit(UUID,UUID,UUID,UUID)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
    changed BIGINT;
    rejection TEXT;
    metadata JSONB;
BEGIN
    BEGIN
        UPDATE attempts a SET execution = 'may_have_executed', dispatched_at = clock_timestamp(), api_key_id = $4 FROM operations o, api_keys k WHERE a.organization_id = $1 AND a.project_id = $2 AND a.id = $3 AND a.execution = 'not_sent' AND o.id = a.operation_id AND k.id = $4 AND ('*' = ANY(k.allowed_models) OR o.model_alias = ANY(k.allowed_models)) AND k.expires_at > clock_timestamp() AND NOT EXISTS (SELECT 1 FROM account_assignments s WHERE s.attempt_id=a.id AND s.state <> 'held') AND (NOT EXISTS (SELECT 1 FROM project_budgets b WHERE b.organization_id=$1 AND b.project_id=$2) OR EXISTS (SELECT 1 FROM cost_reservations r WHERE r.attempt_id=a.id AND r.state='held'));
        GET DIAGNOSTICS changed = ROW_COUNT;
        RETURN changed;
    EXCEPTION WHEN SQLSTATE 'P0010' THEN
        GET STACKED DIAGNOSTICS rejection = PG_EXCEPTION_DETAIL;
    END;
    metadata := rejection::jsonb;
    INSERT INTO dispatch_guardrail_rejections(organization_id,project_id,attempt_id,key_id,reason,workspace_revision,key_policy_revision,key_assignment_revision)
    VALUES($1,$2,$3,$4,metadata->>'reason',(metadata->>'workspace_revision')::BIGINT,(metadata->>'key_policy_revision')::BIGINT,(metadata->>'key_assignment_revision')::BIGINT);
    RETURN -1;
END;
$$;
