-- Customer selling-price snapshots only. Supplier purchase terms never belong here.
CREATE TABLE customer_media_attempt_pricing (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    snapshot JSONB NOT NULL CHECK (
        jsonb_typeof(snapshot) = 'object'
        AND snapshot->>'version' = '1'
        AND octet_length(snapshot::text) <= 131072
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES attempts(organization_id, project_id, id)
);
CREATE TRIGGER immutable_customer_media_pricing
    BEFORE UPDATE OR DELETE ON customer_media_attempt_pricing
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
