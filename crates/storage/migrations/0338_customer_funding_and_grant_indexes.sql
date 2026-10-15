-- Add missing account_id and (currency, created_at) indexes on customer funding,
-- grant, and financial summary tables (#27 #132).

CREATE INDEX IF NOT EXISTS customer_funding_receipts_account
    ON customer_funding_receipts(account_id) INCLUDE (amount_nanos, entry_id);

CREATE INDEX IF NOT EXISTS customer_balance_grants_account
    ON customer_balance_grants(account_id) INCLUDE (amount_nanos, entry_id);

CREATE INDEX IF NOT EXISTS customer_funding_receipts_currency_created
    ON customer_funding_receipts(currency, created_at);

CREATE INDEX IF NOT EXISTS customer_balance_grants_currency_created
    ON customer_balance_grants(currency, created_at);

CREATE INDEX IF NOT EXISTS customer_charges_currency_created
    ON customer_charges(currency, created_at);

CREATE INDEX IF NOT EXISTS customer_media_charges_currency_created
    ON customer_media_charges(currency, created_at);

CREATE INDEX IF NOT EXISTS customer_balance_entries_currency_created
    ON customer_balance_entries(currency, created_at);

CREATE INDEX IF NOT EXISTS customer_grant_credit_applications_currency_created
    ON customer_grant_credit_applications(currency, created_at);

CREATE INDEX IF NOT EXISTS customer_invoice_payments_created_at
    ON customer_invoice_payments(created_at, invoice_id);
