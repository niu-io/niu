CREATE INDEX customer_balance_entries_company_history ON customer_balance_entries(organization_id, created_at DESC, id DESC);
