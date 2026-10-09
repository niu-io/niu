-- Readiness is a separately qualified original-account observation, not reuse.
CREATE TABLE ingested_image_readiness_claims (
    id UUID PRIMARY KEY,
    consent_id UUID NOT NULL REFERENCES asset_image_ingestion_outcomes(consent_id),
    authorization_id UUID NOT NULL REFERENCES asset_operation_authorizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ingested_image_readiness_scope ON ingested_image_readiness_claims(consent_id,created_at);
CREATE INDEX ingested_image_readiness_recovery ON ingested_image_readiness_claims(created_at,id);
CREATE TRIGGER immutable_ingested_image_readiness_claim BEFORE UPDATE OR DELETE ON ingested_image_readiness_claims
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE ingested_image_readiness_outcomes (
    read_id UUID PRIMARY KEY REFERENCES ingested_image_readiness_claims(id),
    asset_status TEXT CHECK(asset_status IN ('Active','Processing','Failed')),
    reason TEXT CHECK(reason IN ('invalid_configuration','destination_rejected','unavailable','transport','timeout','response_limit','invalid_response')),
    duration_ms BIGINT NOT NULL CHECK(duration_ms>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK((asset_status IS NOT NULL)<>(reason IS NOT NULL))
);
CREATE TRIGGER immutable_ingested_image_readiness_outcome BEFORE UPDATE OR DELETE ON ingested_image_readiness_outcomes
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
