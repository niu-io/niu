-- A committed deletion claim permanently fences further group mutation. Neither
-- caller disconnect nor an uncertain outcome permits automatic replay.
CREATE TABLE asset_group_deletion_claims (
    consent_id UUID PRIMARY KEY REFERENCES asset_group_deletion_consents(id),
    intent_id UUID UNIQUE NOT NULL REFERENCES asset_group_create_intents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_group_deletion_claim BEFORE UPDATE OR DELETE ON asset_group_deletion_claims
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE TABLE asset_group_deletion_outcomes (
    consent_id UUID PRIMARY KEY REFERENCES asset_group_deletion_claims(consent_id),
    outcome TEXT NOT NULL CHECK (outcome IN ('acknowledged','uncertain')),
    reason TEXT CHECK (reason IN ('invalid_configuration','destination_rejected','unavailable','transport','timeout','response_limit','invalid_response')),
    duration_ms BIGINT NOT NULL CHECK (duration_ms>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((outcome='uncertain')=(reason IS NOT NULL))
);
CREATE TRIGGER immutable_asset_group_deletion_outcome BEFORE UPDATE OR DELETE ON asset_group_deletion_outcomes
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
