-- Identity-only onboarding can be replayed without storing or reissuing a secret.
-- Retain receipts after revocation/deletion so retries cannot restore access.
CREATE TABLE operator_creation_receipts (
    organization_id UUID NOT NULL,
    key_sha256 BYTEA NOT NULL CHECK (octet_length(key_sha256)=32),
    request_sha256 BYTEA NOT NULL CHECK (octet_length(request_sha256)=32),
    operator_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, key_sha256)
);
CREATE TRIGGER immutable_operator_creation_receipt BEFORE UPDATE OR DELETE
    ON operator_creation_receipts FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
