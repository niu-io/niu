CREATE INDEX asset_group_intents_reconciliation ON asset_group_create_intents(organization_id,project_id,id)
WHERE state IN ('dispatching','uncertain');
