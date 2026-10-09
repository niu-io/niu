CREATE TABLE key_guardrail_assignment_events (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    assignment_revision BIGINT NOT NULL CHECK (assignment_revision > 0),
    policy_revision BIGINT NOT NULL,
    actor TEXT NOT NULL CHECK (length(actor) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id, project_id, key_id, assignment_revision),
    FOREIGN KEY (organization_id, project_id, key_id)
        REFERENCES api_keys(organization_id, project_id, id),
    FOREIGN KEY (organization_id, project_id, policy_revision)
        REFERENCES workspace_guardrail_revisions(organization_id, project_id, revision)
);
CREATE TRIGGER immutable_key_guardrail_assignment_event
BEFORE UPDATE OR DELETE ON key_guardrail_assignment_events
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
