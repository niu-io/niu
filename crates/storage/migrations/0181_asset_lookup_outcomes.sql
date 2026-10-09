-- Transport success is distinct from the asset processing status observed.
CREATE TABLE asset_lookup_outcomes (
    lookup_id UUID PRIMARY KEY REFERENCES asset_lookup_claims(id),
    outcome TEXT NOT NULL CHECK (outcome IN ('succeeded','failed')),
    asset_status TEXT CHECK (asset_status IN ('Active','Processing','Failed')),
    reason TEXT CHECK (reason IN ('invalid_configuration','destination_rejected','unavailable','transport','timeout','response_limit','invalid_response')),
    duration_ms BIGINT NOT NULL CHECK (duration_ms>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((outcome='succeeded')=(asset_status IS NOT NULL)),
    CHECK ((outcome='failed')=(reason IS NOT NULL))
);
CREATE TRIGGER immutable_asset_lookup_outcome BEFORE UPDATE OR DELETE ON asset_lookup_outcomes
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
