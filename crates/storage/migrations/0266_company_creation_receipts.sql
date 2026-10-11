-- Installation-scoped creation identity. Keep the receipt after company deletion
-- so a retry cannot silently create a new company or a new balance account.
CREATE TABLE company_creation_receipts (
    key_sha256 BYTEA PRIMARY KEY CHECK (octet_length(key_sha256)=32),
    request_sha256 BYTEA NOT NULL CHECK (octet_length(request_sha256)=32),
    organization_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_company_creation_receipt BEFORE UPDATE OR DELETE
    ON company_creation_receipts FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
