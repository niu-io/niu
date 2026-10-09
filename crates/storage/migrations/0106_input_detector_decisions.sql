-- Metadata-only receipts; request text and detector response bodies are excluded.
CREATE TABLE input_detector_decisions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    detector_name TEXT NOT NULL CHECK (length(detector_name) BETWEEN 1 AND 200),
    configuration_fingerprint TEXT NOT NULL CHECK (configuration_fingerprint ~ '^[a-f0-9]{64}$'),
    outcome TEXT NOT NULL CHECK (outcome IN ('clear','matched','indeterminate')),
    reason TEXT NOT NULL CHECK (reason IN ('detector_verdict','resource_limit','capacity_exhausted','credential_unavailable','endpoint_unavailable','transport_failure','service_failure','response_limit','invalid_response','timeout','configuration_unavailable','unsupported_content')),
    elapsed_ms BIGINT NOT NULL CHECK (elapsed_ms >= 0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
    CHECK ((outcome IN ('clear','matched') AND reason='detector_verdict') OR outcome='indeterminate')
);
CREATE INDEX input_detector_decisions_scope_time ON input_detector_decisions(organization_id,project_id,recorded_at DESC);
CREATE TRIGGER immutable_input_detector_decision BEFORE UPDATE OR DELETE ON input_detector_decisions
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
ALTER TABLE inspected_guardrail_bindings ADD COLUMN input_detector_decision_ids UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE guardrail_preparation_denials DROP CONSTRAINT guardrail_preparation_denials_reason_check;
ALTER TABLE guardrail_preparation_denials ADD CONSTRAINT guardrail_preparation_denials_reason_check CHECK (
    reason IN ('model_denied','provider_denied','unsupported_policy','input_blocked','input_unsupported','input_resource_limit','input_unavailable','output_incompatible','detector_blocked','detector_unavailable','detector_unsupported')
);
CREATE FUNCTION niu_check_input_detector_bindings() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy JSONB; detector JSONB; binding inspected_guardrail_bindings%ROWTYPE;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    -- Existing dispatch guards acquire policy/key coordination locks first.
    SELECT * INTO binding FROM inspected_guardrail_bindings
      WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND attempt_id=NEW.id;
    FOR policy IN
      SELECT r.policy FROM workspace_guardrail_heads h JOIN workspace_guardrail_revisions r USING(organization_id,project_id,revision)
        WHERE h.organization_id=NEW.organization_id AND h.project_id=NEW.project_id
      UNION ALL
      SELECT r.policy FROM key_guardrail_assignments a JOIN workspace_guardrail_revisions r
        ON r.organization_id=a.organization_id AND r.project_id=a.project_id AND r.revision=a.policy_revision
        WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id
    LOOP
      FOR detector IN SELECT value FROM jsonb_array_elements(COALESCE(policy->'input_detectors','[]'::jsonb)) LOOP
        IF detector->>'consent_to_external_processing' IS DISTINCT FROM 'true' OR NOT EXISTS (
          SELECT 1 FROM input_detector_decisions d WHERE d.id=ANY(binding.input_detector_decision_ids)
            AND d.organization_id=NEW.organization_id AND d.project_id=NEW.project_id AND d.key_id=NEW.api_key_id
            AND d.workspace_revision IS NOT DISTINCT FROM binding.workspace_revision
            AND d.key_policy_revision IS NOT DISTINCT FROM binding.key_policy_revision
            AND d.key_assignment_revision IS NOT DISTINCT FROM binding.key_assignment_revision
            AND d.detector_name=detector->>'detector'
            AND d.configuration_fingerprint=detector->>'configuration_fingerprint' AND d.outcome='clear'
        ) THEN
          RAISE EXCEPTION 'required detector inspection missing' USING ERRCODE='P0010', DETAIL=niu_guardrail_rejection_detail(NEW.organization_id,NEW.project_id,NEW.api_key_id,'input_binding_missing');
        END IF;
      END LOOP;
    END LOOP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER zz_input_detector_dispatch_guard BEFORE UPDATE OF execution ON attempts
FOR EACH ROW EXECUTE FUNCTION niu_check_input_detector_bindings();
