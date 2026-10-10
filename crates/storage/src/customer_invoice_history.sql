WITH cursor_row AS (
    SELECT created_at,id FROM customer_invoices
    WHERE organization_id=$1 AND project_id=$2 AND id=$3
      AND ($4::text IS NULL OR currency=$4)
      AND ($5::bigint IS NULL OR created_at>=to_timestamp($5::double precision/1000))
      AND ($6::bigint IS NULL OR created_at<to_timestamp($6::double precision/1000))
), selected AS MATERIALIZED (
    SELECT * FROM customer_invoices
    WHERE organization_id=$1 AND project_id=$2
      AND ($4::text IS NULL OR currency=$4)
      AND ($5::bigint IS NULL OR created_at>=to_timestamp($5::double precision/1000))
      AND ($6::bigint IS NULL OR created_at<to_timestamp($6::double precision/1000))
      AND ($3::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM cursor_row))
    ORDER BY created_at DESC,id DESC LIMIT $7+1
), page AS (
    SELECT * FROM selected ORDER BY created_at DESC,id DESC LIMIT $7
), rows AS (
    SELECT i.id,i.from_ms,i.to_ms,i.currency,i.amount_nanos::text AS amount_nanos,i.created_at,
      -- Match the overview: posted customer debits settle prepaid invoices,
      -- including credit-backed debits. Refunds do not reopen that obligation.
      CASE WHEN p.invoice_id IS NOT NULL OR (
        EXISTS(SELECT 1 FROM customer_invoice_entries e
          JOIN customer_invoice_charge_sources c ON c.attempt_id=e.attempt_id
          WHERE e.invoice_id=i.id)
        AND NOT EXISTS(SELECT 1 FROM customer_invoice_entries e
          JOIN customer_invoice_charge_sources c ON c.attempt_id=e.attempt_id
          WHERE e.invoice_id=i.id AND c.amount_nanos<>0 AND NOT EXISTS(
            SELECT 1 FROM customer_attempt_balance_accounts b
            JOIN customer_balance_entries d ON d.account_id=b.account_id
              AND d.organization_id=b.organization_id AND d.project_id=b.project_id
              AND d.currency=b.currency AND d.attempt_id=b.attempt_id
            WHERE b.attempt_id=c.attempt_id AND b.organization_id=c.organization_id
              AND b.project_id=c.project_id AND b.currency=c.currency
              AND d.kind='charge' AND d.amount_nanos=-c.amount_nanos)))
        THEN 'paid' ELSE 'issued' END AS status,p.payment_reference
    FROM page i LEFT JOIN customer_invoice_payments p ON p.invoice_id=i.id
)
SELECT ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM cursor_row)),jsonb_build_object(
    'data',COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC,r.id DESC) FROM rows r),'[]'::jsonb),
    'next_cursor',CASE WHEN (SELECT count(*) FROM selected)>$7
        THEN (SELECT id FROM page ORDER BY created_at,id LIMIT 1) ELSE NULL END)
FROM projects WHERE organization_id=$1 AND id=$2
