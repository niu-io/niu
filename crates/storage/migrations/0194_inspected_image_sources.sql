-- Private content storage, separate from immutable approval/accounting metadata.
-- This does not publish a URL or authorize Supplier ingestion.
CREATE TABLE inspected_image_sources (
    id UUID PRIMARY KEY,
    approval_id UUID NOT NULL REFERENCES image_processing_approvals(id),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    content_sha256 TEXT NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
    content_type TEXT NOT NULL CHECK(content_type IN ('image/png','image/jpeg','image/webp')),
    byte_length BIGINT NOT NULL CHECK(byte_length BETWEEN 1 AND 8388608),
    created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK(expires_at>created_at AND expires_at<=created_at+interval '15 minutes'),
    FOREIGN KEY(organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id)
);
CREATE TRIGGER immutable_inspected_image_source BEFORE UPDATE OR DELETE ON inspected_image_sources
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE inspected_image_source_content (
    source_id UUID PRIMARY KEY REFERENCES inspected_image_sources(id),
    ciphertext BYTEA NOT NULL CHECK(octet_length(ciphertext) BETWEEN 28 AND 8388736)
);
CREATE TRIGGER immutable_inspected_image_source_bytes BEFORE UPDATE ON inspected_image_source_content
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE inspected_image_source_erasures (
    source_id UUID PRIMARY KEY REFERENCES inspected_image_sources(id),
    erased_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_inspected_image_source_erasure BEFORE UPDATE OR DELETE ON inspected_image_source_erasures
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
