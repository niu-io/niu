-- Cascading deletion requires its own review; existing grants stay unchanged.
-- Qualification is not destructive consent and never dispatches a mutation.
ALTER TABLE asset_operation_authorizations
    DROP CONSTRAINT asset_operation_authorizations_operation_check;
ALTER TABLE asset_operation_authorizations
    ADD CONSTRAINT asset_operation_authorizations_operation_check
    CHECK (operation IN ('CreateAssetGroup','GetAssetGroup','ListAssets','GetAsset','UpdateAssetGroup','DeleteAssetGroup'));
