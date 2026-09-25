CREATE TABLE key_audit_events (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('issued', 'revoked', 'rotated')),
    replacement_key_id UUID,
    actor TEXT NOT NULL DEFAULT 'bootstrap_administrator',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, project_id, key_id) REFERENCES api_keys(organization_id, project_id, id),
    FOREIGN KEY (organization_id, project_id, replacement_key_id) REFERENCES api_keys(organization_id, project_id, id)
);
CREATE INDEX key_audit_project ON key_audit_events(organization_id, project_id, created_at);
CREATE TRIGGER immutable_key_audit BEFORE UPDATE OR DELETE ON key_audit_events
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
