-- Exact source/destination ingestion consent; no URL publication or dispatch.
CREATE TABLE asset_image_ingestion_consents (
    id UUID PRIMARY KEY,
    source_id UUID NOT NULL REFERENCES inspected_image_sources(id),
    group_intent_id UUID NOT NULL REFERENCES asset_group_create_intents(id),
    authorization_id UUID NOT NULL REFERENCES asset_operation_authorizations(id),
    valid_for_seconds INTEGER NOT NULL CHECK(valid_for_seconds BETWEEN 1 AND 900),
    confirm_ingestion BOOLEAN NOT NULL CHECK(confirm_ingestion),
    created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK(expires_at>created_at AND expires_at<=created_at+interval '15 minutes')
);
CREATE TRIGGER immutable_asset_image_ingestion_consent BEFORE UPDATE OR DELETE ON asset_image_ingestion_consents
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE asset_image_ingestion_consent_revocations (
    consent_id UUID PRIMARY KEY REFERENCES asset_image_ingestion_consents(id),
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_image_ingestion_consent_revocation BEFORE UPDATE OR DELETE ON asset_image_ingestion_consent_revocations
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
