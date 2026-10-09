CREATE TABLE guardrail_preparation_denials (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    reason TEXT NOT NULL CHECK (reason IN ('model_denied','provider_denied','unsupported_policy')),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
    FOREIGN KEY (organization_id,project_id,workspace_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision),
    FOREIGN KEY (organization_id,project_id,key_policy_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision),
    CHECK (key_assignment_revision IS NULL OR key_assignment_revision > 0)
);
CREATE INDEX guardrail_preparation_denials_scope_time ON guardrail_preparation_denials(organization_id,project_id,recorded_at DESC,id DESC);
CREATE TRIGGER immutable_guardrail_preparation_denial
BEFORE UPDATE OR DELETE ON guardrail_preparation_denials
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
