-- Index project foreign keys on operator_audit_events, customer_billing_audit,
-- and collector_keys (#27 #137).

CREATE INDEX IF NOT EXISTS operator_audit_events_by_project
    ON operator_audit_events(organization_id, project_id)
    WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS customer_billing_audit_by_project
    ON customer_billing_audit(organization_id, project_id);

CREATE INDEX IF NOT EXISTS collector_keys_by_project_created
    ON collector_keys(organization_id, project_id, created_at DESC, id DESC);
