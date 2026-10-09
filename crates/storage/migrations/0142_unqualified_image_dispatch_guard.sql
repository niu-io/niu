-- Reference-image approval binding is not yet integrated. Never silently ignore
-- a required image detector when transitioning any request to paid dispatch.
CREATE FUNCTION niu_check_unqualified_image_requirements() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy JSONB;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    -- Earlier dispatch guards establish current workspace/key coordination locks.
    FOR policy IN
      SELECT r.policy FROM workspace_guardrail_heads h JOIN workspace_guardrail_revisions r USING(organization_id,project_id,revision)
        WHERE h.organization_id=NEW.organization_id AND h.project_id=NEW.project_id
      UNION ALL
      SELECT r.policy FROM key_guardrail_assignments a JOIN workspace_guardrail_revisions r
        ON r.organization_id=a.organization_id AND r.project_id=a.project_id AND r.revision=a.policy_revision
        WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id
    LOOP
      IF policy ? 'image_detectors' AND policy->'image_detectors' IS DISTINCT FROM '[]'::jsonb THEN
        RAISE EXCEPTION 'required image inspection is not qualified' USING ERRCODE='P0010',
          DETAIL=niu_guardrail_rejection_detail(NEW.organization_id,NEW.project_id,NEW.api_key_id,'input_binding_missing');
      END IF;
    END LOOP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER zz_unqualified_image_dispatch_guard BEFORE UPDATE OF execution ON attempts
FOR EACH ROW EXECUTE FUNCTION niu_check_unqualified_image_requirements();
