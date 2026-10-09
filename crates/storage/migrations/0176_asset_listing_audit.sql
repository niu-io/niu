-- Listing audit contains no descriptive content, URL, cursor or billing data.
CREATE TABLE asset_listing_claims (
    id UUID PRIMARY KEY,
    intent_id UUID NOT NULL REFERENCES asset_group_create_intents(id),
    authorization_id UUID NOT NULL REFERENCES asset_operation_authorizations(id),
    maximum_items INTEGER NOT NULL CHECK (maximum_items BETWEEN 1 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE asset_listing_outcomes (
    listing_id UUID PRIMARY KEY REFERENCES asset_listing_claims(id),
    outcome TEXT NOT NULL CHECK (outcome IN ('succeeded','failed')),
    reason TEXT CHECK (reason IN ('invalid_configuration','destination_rejected','unavailable','transport','timeout','response_limit','invalid_response')),
    duration_ms BIGINT NOT NULL CHECK (duration_ms>=0),
    item_count INTEGER CHECK (item_count BETWEEN 0 AND 100),
    has_more BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((outcome='succeeded')=(reason IS NULL)),
    CHECK ((outcome='succeeded')=(item_count IS NOT NULL)),
    CHECK ((outcome='succeeded')=(has_more IS NOT NULL))
);
CREATE TRIGGER immutable_asset_listing_claim BEFORE UPDATE OR DELETE ON asset_listing_claims
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE TRIGGER immutable_asset_listing_outcome BEFORE UPDATE OR DELETE ON asset_listing_outcomes
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE INDEX asset_listing_claim_intent ON asset_listing_claims(intent_id,created_at);
