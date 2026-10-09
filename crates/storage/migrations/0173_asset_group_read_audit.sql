-- Read-only management audit; no inference ledger or balance mutation.
CREATE TABLE asset_group_read_claims (
    id UUID PRIMARY KEY,
    intent_id UUID NOT NULL REFERENCES asset_group_create_intents(id),
    authorization_id UUID NOT NULL REFERENCES asset_operation_authorizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE asset_group_read_outcomes (
    read_id UUID PRIMARY KEY REFERENCES asset_group_read_claims(id),
    outcome TEXT NOT NULL CHECK (outcome IN ('succeeded','failed')),
    reason TEXT CHECK (reason IN ('invalid_configuration','destination_rejected','unavailable','transport','timeout','response_limit','invalid_response')),
    duration_ms BIGINT NOT NULL CHECK (duration_ms>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((outcome='succeeded')=(reason IS NULL))
);
CREATE TRIGGER immutable_asset_group_read_claim BEFORE UPDATE OR DELETE ON asset_group_read_claims
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE TRIGGER immutable_asset_group_read_outcome BEFORE UPDATE OR DELETE ON asset_group_read_outcomes
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE INDEX asset_group_read_claim_intent ON asset_group_read_claims(intent_id,created_at);
