-- Safe operation metadata only; no prices, amounts or credential references.
-- Existing records are not backfilled with invented actors or timestamps.
CREATE TABLE procurement_configuration_events (
 id BIGSERIAL PRIMARY KEY,
 organization_id UUID NOT NULL,
 project_id UUID NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('procurement_budget_created','upstream_account_registered')),
 account_id UUID,
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('installation','operator','unknown')),
 actor_operator_id UUID REFERENCES admin_operators(id),
 target_label TEXT NOT NULL CHECK(char_length(target_label) BETWEEN 1 AND 512),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id),
 FOREIGN KEY(organization_id,project_id,account_id) REFERENCES supplier_accounts(organization_id,project_id,id),
 CHECK((actor_kind='operator')=(actor_operator_id IS NOT NULL)),
 CHECK((action='upstream_account_registered')=(account_id IS NOT NULL))
);
CREATE INDEX procurement_configuration_events_page ON procurement_configuration_events(created_at DESC,id DESC);
CREATE INDEX procurement_configuration_events_actor ON procurement_configuration_events(actor_operator_id);
CREATE INDEX procurement_configuration_events_workspace ON procurement_configuration_events(organization_id,project_id);
CREATE UNIQUE INDEX procurement_configuration_budget_event ON procurement_configuration_events(organization_id,project_id)
 WHERE action='procurement_budget_created';
CREATE UNIQUE INDEX procurement_configuration_account_event ON procurement_configuration_events(account_id);
CREATE TRIGGER preserve_procurement_configuration_events BEFORE UPDATE OR DELETE ON procurement_configuration_events
 FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
