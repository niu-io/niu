-- Individual reads require separate review; do not widen existing grants.
ALTER TABLE asset_operation_authorizations
    DROP CONSTRAINT asset_operation_authorizations_operation_check;
ALTER TABLE asset_operation_authorizations
    ADD CONSTRAINT asset_operation_authorizations_operation_check
    CHECK (operation IN ('CreateAssetGroup','GetAssetGroup','ListAssets','GetAsset'));
