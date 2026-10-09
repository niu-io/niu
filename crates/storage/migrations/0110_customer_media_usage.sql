-- Immutable reported media usage, separate from text-token completion and debits.
ALTER TABLE customer_media_attempt_pricing
    ADD UNIQUE (organization_id, project_id, attempt_id);
CREATE TABLE customer_media_usage_observations (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    receipt_sha256 BYTEA NOT NULL CHECK (octet_length(receipt_sha256)=32),
    source TEXT NOT NULL CHECK (source IN ('query','callback')),
    meter TEXT NOT NULL CHECK (length(meter) BETWEEN 1 AND 256),
    quantity JSONB NOT NULL CHECK (jsonb_typeof(quantity)='object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (attempt_id,receipt_sha256),
    FOREIGN KEY (organization_id,project_id,attempt_id)
        REFERENCES customer_media_attempt_pricing(organization_id,project_id,attempt_id)
);
CREATE TRIGGER immutable_customer_media_usage
    BEFORE UPDATE OR DELETE ON customer_media_usage_observations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
