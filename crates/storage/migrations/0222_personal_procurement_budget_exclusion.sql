-- Personal upstream bills belong to the credential owner, not platform procurement.
-- The existing require_customer_balance_dispatch trigger still validates personal
-- ownership, current credential/model revisions, key grants and guardrail binding
-- under locks. A route marker does not bypass those dispatch-time checks.
-- Shared routes retain the existing held procurement-reservation requirement.
-- Keep guardrail rejection auditing and its subtransaction boundary unchanged.
CREATE OR REPLACE FUNCTION niu_mark_dispatched_with_guardrail_audit(UUID,UUID,UUID,UUID)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
    changed BIGINT;
    rejection TEXT;
    metadata JSONB;
BEGIN
    BEGIN
        UPDATE attempts a
        SET execution = 'may_have_executed', dispatched_at = clock_timestamp(), api_key_id = $4
        FROM operations o, api_keys k
        WHERE a.organization_id = $1 AND a.project_id = $2 AND a.id = $3
            AND a.execution = 'not_sent' AND o.id = a.operation_id AND k.id = $4
            AND ('*' = ANY(k.allowed_models) OR o.model_alias = ANY(k.allowed_models))
            AND k.expires_at > clock_timestamp()
            AND NOT EXISTS (
                SELECT 1 FROM account_assignments s
                WHERE s.attempt_id=a.id AND s.state <> 'held'
            )
            AND (
                NOT EXISTS (
                    SELECT 1 FROM project_budgets b
                    WHERE b.organization_id=$1 AND b.project_id=$2
                )
                OR EXISTS (
                    SELECT 1 FROM cost_reservations r
                    WHERE r.attempt_id=a.id AND r.state='held'
                )
                OR EXISTS (
                    SELECT 1 FROM personal_attempt_routes personal
                    WHERE personal.attempt_id=a.id
                )
            );
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
