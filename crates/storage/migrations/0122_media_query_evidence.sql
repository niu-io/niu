-- Content-free query receipts, independent of customer billing mode.
CREATE TABLE media_query_evidence (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    receipt_sha256 BYTEA NOT NULL CHECK (octet_length(receipt_sha256)=32),
    metadata JSONB NOT NULL CHECK (jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=8192),
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (attempt_id,receipt_sha256),
    FOREIGN KEY (organization_id,project_id,attempt_id)
        REFERENCES media_jobs(organization_id,project_id,attempt_id),
    CHECK (metadata ?& ARRAY['version','source','protocol_revision','meter','status','quantity','provider_times']),
    CHECK (metadata - ARRAY['version','source','protocol_revision','meter','status','quantity','provider_times']='{}'::jsonb),
    CHECK (metadata->>'version'='1' AND metadata->>'source'='query')
);
CREATE TRIGGER immutable_media_query_evidence BEFORE UPDATE OR DELETE ON media_query_evidence
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE INDEX media_query_evidence_scoped ON media_query_evidence(organization_id,project_id,attempt_id,observed_at);
