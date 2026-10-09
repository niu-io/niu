-- One-shot handoff. Neither uncertainty nor disconnect authorizes replay.
CREATE TABLE asset_image_ingestion_claims (
    consent_id UUID PRIMARY KEY REFERENCES asset_image_ingestion_consents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_image_ingestion_claim BEFORE UPDATE OR DELETE ON asset_image_ingestion_claims
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE asset_image_ingestion_outcomes (
    consent_id UUID PRIMARY KEY REFERENCES asset_image_ingestion_claims(consent_id),
    outcome TEXT NOT NULL CHECK(outcome IN ('accepted','uncertain')),
    upstream_asset_id TEXT CHECK(upstream_asset_id ~ '^asset-[A-Za-z0-9_-]+$' AND length(upstream_asset_id)<=128),
    reason TEXT CHECK(reason IN ('invalid_configuration','destination_rejected','unavailable','transport','timeout','response_limit','invalid_response')),
    duration_ms BIGINT NOT NULL CHECK(duration_ms>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK((outcome='accepted')=(upstream_asset_id IS NOT NULL)),
    CHECK((outcome='uncertain')=(reason IS NOT NULL))
);
CREATE TRIGGER immutable_asset_image_ingestion_outcome BEFORE UPDATE OR DELETE ON asset_image_ingestion_outcomes
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
