-- A matching retained, update-bound read can reconcile acknowledged writes only.
CREATE TABLE asset_group_update_reconciliations (
    update_id UUID PRIMARY KEY REFERENCES asset_group_update_outcomes(update_id),
    read_id UUID NOT NULL UNIQUE REFERENCES asset_group_update_reads(read_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_group_update_reconciliation BEFORE UPDATE OR DELETE ON asset_group_update_reconciliations
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
