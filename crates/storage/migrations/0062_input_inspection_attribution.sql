-- Nullable historical metadata: do not invent inspection evidence for old attempts.
ALTER TABLE inspected_guardrail_bindings
    ADD COLUMN input_outcome TEXT,
    ADD COLUMN input_elapsed_ms BIGINT,
    ADD CONSTRAINT valid_input_inspection CHECK (
        (input_outcome IS NULL AND input_elapsed_ms IS NULL)
        OR (input_outcome IN ('allowed','redacted') AND input_elapsed_ms IS NOT NULL AND input_elapsed_ms >= 0)
    );

CREATE FUNCTION niu_require_input_inspection_result() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE binding inspected_guardrail_bindings%ROWTYPE;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    SELECT * INTO binding FROM inspected_guardrail_bindings
        WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND attempt_id=NEW.id;
    -- The preceding binding check handles absence and policy revision changes.
    IF NOT FOUND THEN RETURN NEW; END IF;
    IF binding.input_outcome IS NULL AND EXISTS (
        SELECT 1 FROM workspace_guardrail_revisions r
        WHERE r.organization_id=binding.organization_id AND r.project_id=binding.project_id
          AND r.revision IN (binding.workspace_revision,binding.key_policy_revision)
          AND jsonb_array_length(COALESCE(r.policy->'input_rules','[]'::jsonb)) > 0
    ) THEN
        RAISE EXCEPTION 'input inspection result required' USING ERRCODE='P0006';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER zyb_require_input_inspection_result
BEFORE UPDATE OF execution ON attempts
FOR EACH ROW EXECUTE FUNCTION niu_require_input_inspection_result();
