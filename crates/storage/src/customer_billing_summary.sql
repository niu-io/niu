-- Invoice receipts and balance debits are alternative settlement evidence.
-- A debit can consume credit capacity: account debt remains in the balance
-- ledger, rather than becoming a second invoice obligation. Refunds do not
-- undo the historical debit or reopen the original invoice obligation.
WITH charge_settlement AS (
    SELECT c.*, e.invoice_id,
        p.invoice_id IS NOT NULL OR c.amount_nanos = 0 OR EXISTS (
            SELECT 1
            FROM customer_attempt_balance_accounts b
            JOIN customer_balance_entries d
                ON d.account_id = b.account_id
                AND d.organization_id = b.organization_id
                AND d.project_id = b.project_id
                AND d.currency = b.currency
                AND d.attempt_id = b.attempt_id
            WHERE b.attempt_id = c.attempt_id
                AND b.organization_id = c.organization_id
                AND b.project_id = c.project_id
                AND b.currency = c.currency
                AND d.kind = 'charge'
                AND d.amount_nanos = -c.amount_nanos
        ) AS settled
    FROM customer_invoice_charge_sources c
    LEFT JOIN customer_invoice_entries e ON e.attempt_id = c.attempt_id
    LEFT JOIN customer_invoice_payments p ON p.invoice_id = e.invoice_id
    WHERE c.organization_id = $1 AND c.project_id = $2
), balances AS (
    SELECT currency,
        SUM(amount_nanos)::text AS charged_nanos,
        SUM(CASE WHEN invoice_id IS NULL THEN amount_nanos ELSE 0 END)::text AS unbilled_nanos,
        SUM(CASE WHEN invoice_id IS NOT NULL AND NOT settled THEN amount_nanos ELSE 0 END)::text AS due_nanos,
        SUM(CASE WHEN settled THEN amount_nanos ELSE 0 END)::text AS paid_nanos
    FROM charge_settlement
    GROUP BY currency
), invoices AS (
    SELECT i.id, i.from_ms, i.to_ms, i.currency,
        i.amount_nanos::text AS amount_nanos, i.created_at,
        CASE WHEN p.invoice_id IS NOT NULL OR (
            EXISTS (SELECT 1 FROM charge_settlement c WHERE c.invoice_id = i.id)
            AND NOT EXISTS (
                SELECT 1 FROM charge_settlement c
                WHERE c.invoice_id = i.id AND NOT c.settled
            )
        ) THEN 'paid' ELSE 'issued' END AS status,
        p.payment_reference
    FROM customer_invoices i
    LEFT JOIN customer_invoice_payments p ON p.invoice_id = i.id
    WHERE i.organization_id = $1 AND i.project_id = $2
    ORDER BY i.created_at DESC, i.id
    LIMIT 100
)
SELECT
    COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.currency) FROM balances b), '[]'::jsonb),
    COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at DESC, i.id) FROM invoices i), '[]'::jsonb)
