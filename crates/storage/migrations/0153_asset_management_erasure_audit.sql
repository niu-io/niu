CREATE TABLE vendor_asset_management_erasures (
    vendor_id UUID NOT NULL,
    through_revision BIGINT NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind='installation'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (vendor_id,through_revision),
    FOREIGN KEY (vendor_id,through_revision) REFERENCES vendor_asset_management_revocations(vendor_id,through_revision)
);
CREATE TRIGGER immutable_asset_management_erasure
    BEFORE UPDATE OR DELETE ON vendor_asset_management_erasures
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_management_revocation();
