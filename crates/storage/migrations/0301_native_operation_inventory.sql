-- Ordered workspace discovery of durable native operations; no OFFSET scans.
-- Existing workspace/idempotency uniqueness already indexes request lookup.
CREATE INDEX workspace_provider_operation_inventory
 ON workspace_provider_asset_operations(organization_id,project_id,created_at DESC,id DESC);
