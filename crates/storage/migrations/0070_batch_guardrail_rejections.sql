-- Distinguish checked policy rejection from unrelated admission conflicts.
-- Details contain only revision metadata, never policies, payloads or credentials.
CREATE OR REPLACE FUNCTION niu_guardrail_rejection_detail(org UUID, workspace UUID, key UUID, reason TEXT)
RETURNS TEXT LANGUAGE sql VOLATILE AS $$
    SELECT jsonb_build_object(
        'reason',reason,
        'organization_id',org,'project_id',workspace,'key_id',key,
        'workspace_revision',(SELECT NULLIF(revision,0) FROM workspace_guardrail_heads WHERE organization_id=org AND project_id=workspace),
        'key_policy_revision',(SELECT policy_revision FROM key_guardrail_assignments WHERE organization_id=org AND project_id=workspace AND key_id=key),
        'key_assignment_revision',(SELECT assignment_revision FROM key_guardrail_assignments WHERE organization_id=org AND project_id=workspace AND key_id=key)
    )::text;
$$;


-- Batch failure can roll back attempts; do not fabricate attempt attribution.
-- Retain denial outside the subtransaction that rejected dispatch.
CREATE TABLE batch_guardrail_rejections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    reason TEXT NOT NULL CHECK(reason IN ('access_denied','input_binding_missing','policy_changed')),
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY(organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
    FOREIGN KEY(organization_id,project_id,workspace_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision),
    FOREIGN KEY(organization_id,project_id,key_policy_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision),
    CHECK(key_assignment_revision IS NULL OR key_assignment_revision > 0)
);
CREATE INDEX batch_guardrail_rejections_scope_time ON batch_guardrail_rejections(organization_id,project_id,recorded_at DESC,id DESC);
CREATE TRIGGER immutable_batch_guardrail_rejection BEFORE UPDATE OR DELETE ON batch_guardrail_rejections
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

