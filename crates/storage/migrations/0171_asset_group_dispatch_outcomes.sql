-- Management audit only; does not mutate balances or inference accounting.
CREATE TABLE asset_group_dispatch_outcomes (
    intent_id UUID PRIMARY KEY REFERENCES asset_group_dispatch_authorizations(intent_id),
    outcome TEXT NOT NULL CHECK (outcome IN ('succeeded','uncertain')),
    reason TEXT CHECK (reason IN ('invalid_configuration','destination_rejected','upstream_uncertain','timeout')),
    duration_ms BIGINT NOT NULL CHECK (duration_ms>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((outcome='succeeded')=(reason IS NULL))
);
CREATE TRIGGER immutable_asset_group_dispatch_outcome BEFORE UPDATE OR DELETE ON asset_group_dispatch_outcomes
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
