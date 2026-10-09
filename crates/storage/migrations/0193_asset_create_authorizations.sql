-- Media ingestion has a separate reviewed grant; existing grants are unchanged.
-- Qualification alone does not establish processing consent or inspected bytes.
ALTER TABLE asset_operation_authorizations
    DROP CONSTRAINT asset_operation_authorizations_operation_check;
ALTER TABLE asset_operation_authorizations
    ADD CONSTRAINT asset_operation_authorizations_operation_check
    CHECK (operation IN ('CreateAssetGroup','GetAssetGroup','ListAssets','GetAsset','UpdateAssetGroup','DeleteAssetGroup','CreateAsset'));
