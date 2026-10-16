-- Consolidate redundant attempt guardrail dispatch triggers and add transition
-- WHEN predicates so completion updates skip dispatch-only PL/pgSQL functions.

CREATE OR REPLACE FUNCTION niu_guardrail_rejection_detail(org UUID, workspace UUID, key UUID, reason TEXT)
RETURNS TEXT LANGUAGE sql VOLATILE AS $$
    SELECT jsonb_build_object(
        'reason', reason,
        'organization_id', org,
        'project_id', workspace,
        'key_id', key,
        'workspace_revision', (
            SELECT NULLIF(revision, 0)
            FROM workspace_guardrail_heads
            WHERE organization_id = org AND project_id = workspace
        ),
        'key_policy_revision', a.policy_revision,
        'key_assignment_revision', a.assignment_revision
    )::text
    FROM (SELECT 1) AS one_row
    LEFT JOIN key_guardrail_assignments a
      ON a.organization_id = org AND a.project_id = workspace AND a.key_id = key;
$$;

CREATE OR REPLACE FUNCTION niu_record_dispatch_guardrails() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    workspace_rev BIGINT;
    policy_rev BIGINT;
    assignment_rev BIGINT;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    SELECT NULLIF(revision, 0) INTO workspace_rev
      FROM workspace_guardrail_heads
     WHERE organization_id = NEW.organization_id AND project_id = NEW.project_id;
    SELECT policy_revision, assignment_revision INTO policy_rev, assignment_rev
      FROM key_guardrail_assignments
     WHERE organization_id = NEW.organization_id AND project_id = NEW.project_id AND key_id = NEW.api_key_id;
    INSERT INTO dispatch_guardrail_decisions (
        organization_id, project_id, attempt_id, workspace_revision,
        key_policy_revision, key_assignment_revision
    ) VALUES (
        NEW.organization_id, NEW.project_id, NEW.id,
        workspace_rev, policy_rev, assignment_rev
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION niu_check_inspected_guardrail_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    binding inspected_guardrail_bindings%ROWTYPE;
    has_binding BOOLEAN;
    workspace_revision BIGINT;
    workspace_policy JSONB;
    policy_revision BIGINT;
    assignment_revision BIGINT;
    key_policy JSONB;
    policy JSONB;
    detector JSONB;
    image_binding image_request_bindings%ROWTYPE;
    has_image_binding BOOLEAN := FALSE;
    checked_image_binding BOOLEAN := FALSE;
    position INTEGER;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;

    SELECT NULLIF(h.revision, 0), r.policy
      INTO workspace_revision, workspace_policy
      FROM workspace_guardrail_heads h
      LEFT JOIN workspace_guardrail_revisions r USING (organization_id, project_id, revision)
     WHERE h.organization_id = NEW.organization_id AND h.project_id = NEW.project_id;

    SELECT a.policy_revision, a.assignment_revision, r.policy
      INTO policy_revision, assignment_revision, key_policy
      FROM key_guardrail_assignments a
      LEFT JOIN workspace_guardrail_revisions r
        ON r.organization_id = a.organization_id
       AND r.project_id = a.project_id
       AND r.revision = a.policy_revision
     WHERE a.organization_id = NEW.organization_id
       AND a.project_id = NEW.project_id
       AND a.key_id = NEW.api_key_id;

    SELECT * INTO binding
      FROM inspected_guardrail_bindings
     WHERE organization_id = NEW.organization_id
       AND project_id = NEW.project_id
       AND attempt_id = NEW.id;
    has_binding := FOUND;

    -- 1. Inspected guardrail binding check
    IF NOT has_binding THEN
        IF (workspace_policy IS NOT NULL AND jsonb_array_length(COALESCE(workspace_policy->'input_rules', '[]'::jsonb)) > 0)
           OR (key_policy IS NOT NULL AND jsonb_array_length(COALESCE(key_policy->'input_rules', '[]'::jsonb)) > 0) THEN
            RAISE EXCEPTION 'input inspection binding required'
                USING ERRCODE = 'P0010',
                      DETAIL = niu_guardrail_rejection_detail(NEW.organization_id, NEW.project_id, NEW.api_key_id, 'input_binding_missing');
        END IF;
    ELSE
        IF binding.key_id IS DISTINCT FROM NEW.api_key_id
            OR binding.workspace_revision IS DISTINCT FROM workspace_revision
            OR binding.key_policy_revision IS DISTINCT FROM policy_revision
            OR binding.key_assignment_revision IS DISTINCT FROM assignment_revision THEN
            RAISE EXCEPTION 'inspected guardrail policy changed'
                USING ERRCODE = 'P0010',
                      DETAIL = niu_guardrail_rejection_detail(NEW.organization_id, NEW.project_id, NEW.api_key_id, 'policy_changed');
        END IF;

        -- 2. Input inspection result requirement check
        IF binding.input_outcome IS NULL
           AND ((workspace_policy IS NOT NULL AND jsonb_array_length(COALESCE(workspace_policy->'input_rules', '[]'::jsonb)) > 0)
                OR (key_policy IS NOT NULL AND jsonb_array_length(COALESCE(key_policy->'input_rules', '[]'::jsonb)) > 0)) THEN
            RAISE EXCEPTION 'input inspection result required' USING ERRCODE = 'P0006';
        END IF;
    END IF;

    -- 3. Input detector bindings check
    FOREACH policy IN ARRAY ARRAY[workspace_policy, key_policy] LOOP
        IF policy IS NULL THEN CONTINUE; END IF;
        FOR detector IN SELECT value FROM jsonb_array_elements(COALESCE(policy->'input_detectors', '[]'::jsonb)) LOOP
            IF detector->>'consent_to_external_processing' IS DISTINCT FROM 'true' OR NOT EXISTS (
                SELECT 1 FROM input_detector_decisions d
                 WHERE d.id = ANY(binding.input_detector_decision_ids)
                   AND d.organization_id = NEW.organization_id
                   AND d.project_id = NEW.project_id
                   AND d.key_id = NEW.api_key_id
                   AND d.workspace_revision IS NOT DISTINCT FROM binding.workspace_revision
                   AND d.key_policy_revision IS NOT DISTINCT FROM binding.key_policy_revision
                   AND d.key_assignment_revision IS NOT DISTINCT FROM binding.key_assignment_revision
                   AND d.detector_name = detector->>'detector'
                   AND d.configuration_fingerprint = detector->>'configuration_fingerprint'
                   AND d.outcome = 'clear'
            ) THEN
                RAISE EXCEPTION 'required detector inspection missing'
                    USING ERRCODE = 'P0010',
                          DETAIL = niu_guardrail_rejection_detail(NEW.organization_id, NEW.project_id, NEW.api_key_id, 'input_binding_missing');
            END IF;
        END LOOP;
    END LOOP;

    -- 4. Record dispatch guardrail attribution decision
    INSERT INTO dispatch_guardrail_decisions (
        organization_id, project_id, attempt_id, workspace_revision,
        key_policy_revision, key_assignment_revision
    ) VALUES (
        NEW.organization_id, NEW.project_id, NEW.id,
        workspace_revision, policy_revision, assignment_revision
    );

    -- 5. Image inspection coverage check
    FOREACH policy IN ARRAY ARRAY[workspace_policy, key_policy] LOOP
        IF policy IS NULL OR NOT (policy ? 'image_detectors') OR policy->'image_detectors' = '[]'::jsonb THEN
            CONTINUE;
        END IF;
        IF jsonb_typeof(policy->'image_detectors') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'invalid required image inspection'
                USING ERRCODE = 'P0010',
                      DETAIL = niu_guardrail_rejection_detail(NEW.organization_id, NEW.project_id, NEW.api_key_id, 'input_binding_missing');
        END IF;
        IF NOT checked_image_binding THEN
            checked_image_binding := TRUE;
            IF has_binding THEN
                SELECT i.* INTO image_binding
                  FROM image_request_bindings i
                 WHERE i.organization_id = NEW.organization_id
                   AND i.project_id = NEW.project_id
                   AND i.attempt_id = NEW.id
                   AND i.key_id = NEW.api_key_id
                   AND i.workspace_revision IS NOT DISTINCT FROM binding.workspace_revision
                   AND i.key_policy_revision IS NOT DISTINCT FROM binding.key_policy_revision
                   AND i.key_assignment_revision IS NOT DISTINCT FROM binding.key_assignment_revision;
                has_image_binding := FOUND;
            END IF;
        END IF;
        IF NOT has_image_binding THEN
            RAISE EXCEPTION 'required image request binding missing'
                USING ERRCODE = 'P0010',
                      DETAIL = niu_guardrail_rejection_detail(NEW.organization_id, NEW.project_id, NEW.api_key_id, 'input_binding_missing');
        END IF;
        FOR detector IN SELECT value FROM jsonb_array_elements(policy->'image_detectors') LOOP
            FOREACH position IN ARRAY image_binding.image_positions LOOP
                IF detector->>'consent_to_image_processing' IS DISTINCT FROM 'true' OR NOT EXISTS (
                    SELECT 1
                      FROM image_request_approval_bindings a
                      JOIN image_processing_approvals r
                        ON r.organization_id = a.organization_id
                       AND r.project_id = a.project_id
                       AND r.key_id = a.key_id
                       AND r.id = a.approval_id
                     WHERE a.attempt_id = NEW.id
                       AND a.organization_id = NEW.organization_id
                       AND a.project_id = NEW.project_id
                       AND a.key_id = NEW.api_key_id
                       AND r.content_position = position
                       AND r.detector_name = detector->>'detector'
                       AND r.configuration_fingerprint = detector->>'configuration_fingerprint'
                       AND r.workspace_revision IS NOT DISTINCT FROM image_binding.workspace_revision
                       AND r.key_policy_revision IS NOT DISTINCT FROM image_binding.key_policy_revision
                       AND r.key_assignment_revision IS NOT DISTINCT FROM image_binding.key_assignment_revision
                ) THEN
                    RAISE EXCEPTION 'required image inspection coverage missing'
                        USING ERRCODE = 'P0010',
                              DETAIL = niu_guardrail_rejection_detail(NEW.organization_id, NEW.project_id, NEW.api_key_id, 'input_binding_missing');
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zyb_require_input_inspection_result ON attempts;
DROP TRIGGER IF EXISTS zz_input_detector_dispatch_guard ON attempts;
DROP TRIGGER IF EXISTS zz_record_dispatch_guardrail_decision ON attempts;
DROP TRIGGER IF EXISTS zz_unqualified_image_dispatch_guard ON attempts;

DROP TRIGGER IF EXISTS dispatch_requires_current_model_guardrails ON attempts;
CREATE TRIGGER dispatch_requires_current_model_guardrails
    BEFORE UPDATE OF execution ON attempts
    FOR EACH ROW
    WHEN (OLD.execution = 'not_sent' AND NEW.execution = 'may_have_executed')
    EXECUTE FUNCTION niu_check_dispatch_model_guardrails();

DROP TRIGGER IF EXISTS zy_check_inspected_guardrail_binding ON attempts;
CREATE TRIGGER zy_check_inspected_guardrail_binding
    BEFORE UPDATE OF execution ON attempts
    FOR EACH ROW
    WHEN (OLD.execution = 'not_sent' AND NEW.execution = 'may_have_executed')
    EXECUTE FUNCTION niu_check_inspected_guardrail_binding();

DROP TRIGGER IF EXISTS attempts_require_current_supplier_qualification ON attempts;
CREATE TRIGGER attempts_require_current_supplier_qualification
    BEFORE UPDATE OF execution ON attempts
    FOR EACH ROW
    WHEN (OLD.execution = 'not_sent' AND NEW.execution = 'may_have_executed')
    EXECUTE FUNCTION niu_guard_qualified_supplier_dispatch();

DROP TRIGGER IF EXISTS media_offer_requires_media_dispatch ON attempts;
CREATE TRIGGER media_offer_requires_media_dispatch
    BEFORE UPDATE OF execution ON attempts
    FOR EACH ROW
    WHEN (OLD.execution = 'not_sent' AND NEW.execution = 'may_have_executed')
    EXECUTE FUNCTION niu_guard_media_offer_dispatch();

DROP TRIGGER IF EXISTS guard_platform_media_liability_dispatch ON attempts;
CREATE TRIGGER guard_platform_media_liability_dispatch
    BEFORE UPDATE OF execution ON attempts
    FOR EACH ROW
    WHEN (OLD.execution = 'not_sent' AND NEW.execution = 'may_have_executed')
    EXECUTE FUNCTION guard_platform_media_liability_dispatch();

DROP TRIGGER IF EXISTS require_media_output_before_dispatch ON attempts;
CREATE TRIGGER require_media_output_before_dispatch
    BEFORE UPDATE OF dispatched_at ON attempts
    FOR EACH ROW
    WHEN (OLD.dispatched_at IS NULL AND NEW.dispatched_at IS NOT NULL)
    EXECUTE FUNCTION require_media_output_before_dispatch();

DROP TRIGGER IF EXISTS require_current_ingested_video_deadline ON attempts;
CREATE TRIGGER require_current_ingested_video_deadline
    BEFORE UPDATE OF dispatched_at ON attempts
    FOR EACH ROW
    WHEN (OLD.dispatched_at IS NULL AND NEW.dispatched_at IS NOT NULL)
    EXECUTE FUNCTION require_current_ingested_video_deadline();
