-- Catch only genuine policy rejection after rolling back all reservation effects.
CREATE FUNCTION niu_reserve_and_dispatch_gateway_audited(
    p_organization_id UUID, p_project_id UUID, p_key_id UUID, p_attempt_id UUID,
    p_price_revision_id UUID, p_resource_id TEXT, p_offer_revision TEXT,
    p_prompt_bound BIGINT, p_completion_bound BIGINT
) RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    rejection TEXT;
    metadata JSONB;
BEGIN
    BEGIN
        PERFORM niu_reserve_and_dispatch_gateway(p_organization_id,p_project_id,p_key_id,p_attempt_id,p_price_revision_id,p_resource_id,p_offer_revision,p_prompt_bound,p_completion_bound);
        RETURN TRUE;
    EXCEPTION WHEN SQLSTATE 'P0010' THEN
        GET STACKED DIAGNOSTICS rejection = PG_EXCEPTION_DETAIL;
    END;
    metadata := rejection::jsonb;
    INSERT INTO dispatch_guardrail_rejections(organization_id,project_id,attempt_id,key_id,reason,workspace_revision,key_policy_revision,key_assignment_revision)
    VALUES(p_organization_id,p_project_id,p_attempt_id,p_key_id,metadata->>'reason',(metadata->>'workspace_revision')::BIGINT,(metadata->>'key_policy_revision')::BIGINT,(metadata->>'key_assignment_revision')::BIGINT);
    RETURN FALSE;
END;
$$;
