CREATE INDEX customer_invoice_history ON customer_invoices(organization_id,project_id,created_at DESC,id DESC);
