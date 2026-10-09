-- Customer discovery includes every local intent state. The reconciliation
-- partial index does not cover prepared or completed requests.
CREATE INDEX asset_group_intents_workspace_discovery
ON asset_group_create_intents(organization_id, project_id, id);
