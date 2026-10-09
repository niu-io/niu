-- Read rights require their own reviewed grant. Existing creation grants retain
-- exactly their original operation and cannot authorize account reads.
ALTER TABLE asset_operation_authorizations
    DROP CONSTRAINT asset_operation_authorizations_operation_check;
ALTER TABLE asset_operation_authorizations
    ADD CONSTRAINT asset_operation_authorizations_operation_check
    CHECK (operation IN ('CreateAssetGroup','GetAssetGroup'));
