-- Original 0174 deployments predate in-flight read deletion tombstones.
-- Current 0174 deployments already have them; preserve both receipt histories.
CREATE TABLE IF NOT EXISTS asset_group_read_result_deletions (
    read_id UUID PRIMARY KEY REFERENCES asset_group_read_claims(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='asset_group_read_result_deletions'::regclass
        AND tgname='immutable_asset_group_read_result_deletion') THEN
        CREATE TRIGGER immutable_asset_group_read_result_deletion
            BEFORE UPDATE OR DELETE ON asset_group_read_result_deletions
            FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
    END IF;
END $$;
