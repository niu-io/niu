-- Fresh reads admitted after an acknowledged metadata mutation. No hold release.
CREATE TABLE asset_group_update_reads (
    read_id UUID PRIMARY KEY REFERENCES asset_group_read_claims(id),
    update_id UUID NOT NULL REFERENCES asset_group_update_outcomes(update_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX asset_group_update_reads_update ON asset_group_update_reads(update_id);
CREATE TRIGGER immutable_asset_group_update_read BEFORE UPDATE OR DELETE ON asset_group_update_reads
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
