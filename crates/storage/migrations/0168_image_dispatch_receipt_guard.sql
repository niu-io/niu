-- Require immutable exact-request coverage rather than rejecting every image
-- policy. Gateway admission must still inspect the actual outgoing content.
CREATE OR REPLACE FUNCTION niu_check_unqualified_image_requirements() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy JSONB; detector JSONB; binding image_request_bindings%ROWTYPE; position INTEGER;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    FOR policy IN
      SELECT r.policy FROM workspace_guardrail_heads h JOIN workspace_guardrail_revisions r USING(organization_id,project_id,revision)
        WHERE h.organization_id=NEW.organization_id AND h.project_id=NEW.project_id
      UNION ALL
      SELECT r.policy FROM key_guardrail_assignments a JOIN workspace_guardrail_revisions r
        ON r.organization_id=a.organization_id AND r.project_id=a.project_id AND r.revision=a.policy_revision
        WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id
    LOOP
      IF NOT (policy ? 'image_detectors') OR policy->'image_detectors' = '[]'::jsonb THEN CONTINUE; END IF;
      IF jsonb_typeof(policy->'image_detectors') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'invalid required image inspection' USING ERRCODE='P0010',
          DETAIL=niu_guardrail_rejection_detail(NEW.organization_id,NEW.project_id,NEW.api_key_id,'input_binding_missing');
      END IF;
      SELECT i.* INTO binding FROM image_request_bindings i JOIN inspected_guardrail_bindings b
        ON b.organization_id=i.organization_id AND b.project_id=i.project_id AND b.attempt_id=i.attempt_id AND b.key_id=i.key_id
        WHERE i.organization_id=NEW.organization_id AND i.project_id=NEW.project_id AND i.attempt_id=NEW.id AND i.key_id=NEW.api_key_id
          AND i.workspace_revision IS NOT DISTINCT FROM b.workspace_revision
          AND i.key_policy_revision IS NOT DISTINCT FROM b.key_policy_revision
          AND i.key_assignment_revision IS NOT DISTINCT FROM b.key_assignment_revision;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'required image request binding missing' USING ERRCODE='P0010',
          DETAIL=niu_guardrail_rejection_detail(NEW.organization_id,NEW.project_id,NEW.api_key_id,'input_binding_missing');
      END IF;
      FOR detector IN SELECT value FROM jsonb_array_elements(policy->'image_detectors') LOOP
        FOREACH position IN ARRAY binding.image_positions LOOP
          IF detector->>'consent_to_image_processing' IS DISTINCT FROM 'true' OR NOT EXISTS (
            SELECT 1 FROM image_request_approval_bindings a JOIN image_processing_approvals r
              ON r.organization_id=a.organization_id AND r.project_id=a.project_id AND r.key_id=a.key_id AND r.id=a.approval_id
              WHERE a.attempt_id=NEW.id AND a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id
                AND r.content_position=position AND r.detector_name=detector->>'detector'
                AND r.configuration_fingerprint=detector->>'configuration_fingerprint'
                AND r.workspace_revision IS NOT DISTINCT FROM binding.workspace_revision
                AND r.key_policy_revision IS NOT DISTINCT FROM binding.key_policy_revision
                AND r.key_assignment_revision IS NOT DISTINCT FROM binding.key_assignment_revision
          ) THEN
            RAISE EXCEPTION 'required image inspection coverage missing' USING ERRCODE='P0010',
              DETAIL=niu_guardrail_rejection_detail(NEW.organization_id,NEW.project_id,NEW.api_key_id,'input_binding_missing');
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
    RETURN NEW;
END;
$$;
