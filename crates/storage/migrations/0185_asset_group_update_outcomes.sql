-- Acknowledgement is not read-back verification; unacknowledged dispatch is uncertain.
CREATE TABLE asset_group_update_outcomes (
    update_id UUID PRIMARY KEY REFERENCES asset_group_update_claims(update_id),
    outcome TEXT NOT NULL CHECK (outcome IN ('acknowledged','uncertain')),
    reason TEXT CHECK (reason IN ('invalid_configuration','destination_rejected','unavailable','transport','timeout','response_limit','invalid_response')),
    duration_ms BIGINT NOT NULL CHECK (duration_ms>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((outcome='uncertain')=(reason IS NOT NULL))
);
CREATE TRIGGER immutable_asset_group_update_outcome BEFORE UPDATE OR DELETE ON asset_group_update_outcomes
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
