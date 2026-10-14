-- Checked gateway admission evidence, separate from upstream failures and billing.
CREATE TABLE gateway_admission_denials (
    attempt_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    requested_key_id UUID NOT NULL,
    requested_key_name TEXT NOT NULL,
    requested_key_revision BIGINT NOT NULL CHECK (requested_key_revision > 0),
    kind TEXT NOT NULL CHECK (kind = 'key_request_rate_disabled'),
    http_status SMALLINT NOT NULL CHECK (http_status = 429),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES attempts (organization_id, project_id, id),
    FOREIGN KEY (organization_id, project_id, requested_key_id)
        REFERENCES api_keys (organization_id, project_id, id)
);
CREATE TRIGGER immutable_gateway_admission_denial
    BEFORE UPDATE OR DELETE ON gateway_admission_denials
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

