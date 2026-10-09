CREATE FUNCTION niu_model_rule_permits(rule JSONB, model TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF jsonb_typeof(rule) IS DISTINCT FROM 'object' THEN RETURN FALSE; END IF;
    CASE rule->>'mode'
        WHEN 'inherit' THEN RETURN TRUE;
        WHEN 'allow_all' THEN RETURN TRUE;
        WHEN 'deny_all' THEN RETURN FALSE;
        WHEN 'allow_list' THEN
            IF jsonb_typeof(rule->'values') IS DISTINCT FROM 'array' THEN RETURN FALSE; END IF;
            RETURN (rule->'values') ? model;
        ELSE RETURN FALSE;
    END CASE;
END;
$$;

CREATE FUNCTION niu_check_dispatch_model_guardrails() RETURNS trigger
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
           OR NOT niu_model_rule_permits(policy->'models',requested_model) THEN
            RAISE EXCEPTION 'model guardrail changed before dispatch' USING ERRCODE='P0006';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER dispatch_requires_current_model_guardrails
BEFORE UPDATE OF execution ON attempts
FOR EACH ROW EXECUTE FUNCTION niu_check_dispatch_model_guardrails();
