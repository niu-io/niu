-- Financial posting interval, separate from the commercial dispatch cohort.
-- Unknown historical funding allocation must never become zero gift / gross income.
WITH bounds AS MATERIALIZED (
    SELECT statement_timestamp() AS until,
           statement_timestamp() - make_interval(days => $2) AS since
), currency AS (
    SELECT EXISTS(SELECT 1 FROM customer_balance_accounts WHERE currency=$1
        UNION ALL SELECT 1 FROM customer_tariff_revisions WHERE currency=$1
        UNION ALL SELECT 1 FROM customer_media_charges WHERE currency=$1) AS known
), retail AS (
    SELECT attempt_id,organization_id,project_id,currency,amount_nanos,created_at
        FROM customer_charges
    UNION ALL
    SELECT attempt_id,organization_id,project_id,currency,amount_nanos,created_at
        FROM customer_media_charges
), consumption AS (
    SELECT c.amount_nanos::numeric AS nominal, 'charge'::text AS kind,
           c.amount_nanos=0 OR allocation.source_coverage='known' AS covered,
           CASE WHEN c.amount_nanos=0 THEN 0 ELSE allocation.gift_nanos END::numeric AS gift,
           CASE WHEN c.amount_nanos=0 THEN 0 ELSE allocation.nongift_nanos END::numeric AS nongift
    FROM retail c CROSS JOIN bounds
    JOIN attempts attempt ON attempt.id=c.attempt_id
    LEFT JOIN operation_funding_sources funding ON funding.operation_id=attempt.operation_id
    LEFT JOIN customer_balance_entries entry ON entry.attempt_id=c.attempt_id
        AND entry.organization_id=c.organization_id AND entry.project_id=c.project_id
        AND entry.currency=c.currency AND entry.kind='charge'
        AND entry.amount_nanos::numeric=-c.amount_nanos::numeric
    LEFT JOIN customer_balance_consumption_allocations allocation ON allocation.entry_id=entry.id
    WHERE c.currency=$1 AND c.created_at>=bounds.since AND c.created_at<bounds.until
        AND funding.funding_source IS DISTINCT FROM 'personal'
    UNION ALL
    SELECT entry.amount_nanos::numeric, 'refund', allocation.source_coverage='known',
           allocation.gift_nanos::numeric, allocation.nongift_nanos::numeric
    FROM customer_balance_entries entry CROSS JOIN bounds
    JOIN customer_balance_entries original ON original.id=entry.reverses_entry_id
    JOIN attempts attempt ON attempt.id=original.attempt_id
    LEFT JOIN operation_funding_sources funding ON funding.operation_id=attempt.operation_id
    LEFT JOIN customer_balance_consumption_allocations allocation ON allocation.entry_id=entry.id
    WHERE entry.currency=$1 AND entry.kind='refund'
        AND entry.created_at>=bounds.since AND entry.created_at<bounds.until
        AND funding.funding_source IS DISTINCT FROM 'personal'
), totals AS (
    SELECT COALESCE(sum(nominal) FILTER (WHERE kind='charge'),0) AS nominal,
           COALESCE(sum(nominal) FILTER (WHERE kind='refund'),0) AS refunded,
           COALESCE(sum(CASE WHEN kind='charge' THEN nongift ELSE -nongift END)
               FILTER (WHERE covered IS TRUE),0) AS known_revenue,
           COALESCE(sum(CASE WHEN kind='charge' THEN gift ELSE -gift END)
               FILTER (WHERE covered IS TRUE),0) AS known_allowance,
           count(*) FILTER (WHERE covered IS NOT TRUE) AS uncovered_entries,
           COALESCE(sum(nominal) FILTER (WHERE covered IS NOT TRUE),0) AS uncovered_nominal
    FROM consumption
), receipts AS (
    SELECT COALESCE(sum(amount_nanos::numeric),0) AS amount
    FROM customer_funding_receipts CROSS JOIN bounds
    WHERE currency=$1 AND created_at>=bounds.since AND created_at<bounds.until
), invoice_receipts AS (
    SELECT COALESCE(sum(invoice.amount_nanos::numeric),0) AS amount
    FROM customer_invoice_payments payment JOIN customer_invoices invoice ON invoice.id=payment.invoice_id
    CROSS JOIN bounds
    WHERE invoice.currency=$1 AND payment.created_at>=bounds.since AND payment.created_at<bounds.until
), receipt_conflicts AS (
    -- The legacy invoice receipt has no channel. A matching balance reference
    -- is ambiguous, not proof of two payments. Keep the combined total unknown.
    SELECT count(*) AS count FROM customer_invoice_payments payment
    JOIN customer_invoices invoice ON invoice.id=payment.invoice_id CROSS JOIN bounds
    WHERE invoice.currency=$1 AND EXISTS (
        SELECT 1 FROM customer_funding_receipts receipt
        WHERE receipt.payment_reference=payment.payment_reference
          AND ((payment.created_at>=bounds.since AND payment.created_at<bounds.until)
            OR (receipt.created_at>=bounds.since AND receipt.created_at<bounds.until)))
), gifts AS (
    SELECT COALESCE(sum(amount_nanos::numeric),0) AS amount
    FROM customer_balance_grants CROSS JOIN bounds
    WHERE currency=$1 AND created_at>=bounds.since AND created_at<bounds.until
), reversals AS (
    SELECT COALESCE(sum(-entry.amount_nanos::numeric),0) AS amount
    FROM customer_balance_entries entry CROSS JOIN bounds
    JOIN customer_funding_receipts receipt ON receipt.entry_id=entry.reverses_entry_id
    WHERE entry.currency=$1 AND entry.kind='funding_reversal'
        AND entry.created_at>=bounds.since AND entry.created_at<bounds.until
)
SELECT currency.known,
    jsonb_build_object('currency',$1,'days',$2,'from',bounds.since,'until',bounds.until,
        'nominal_consumption_nanos',totals.nominal::text,
        'customer_refunds_nanos',totals.refunded::text,
        'recognized_revenue_nanos',CASE WHEN totals.uncovered_entries=0 THEN totals.known_revenue::text END,
        'consumed_gift_allowance_nanos',CASE WHEN totals.uncovered_entries=0 THEN totals.known_allowance::text END,
        'known_revenue_subtotal_nanos',totals.known_revenue::text,
        'known_gift_allowance_subtotal_nanos',totals.known_allowance::text,
        'uncovered_entries',totals.uncovered_entries::text,
        'uncovered_nominal_nanos',totals.uncovered_nominal::text,
        'verified_cash_receipts_nanos',CASE WHEN receipt_conflicts.count=0 THEN (receipts.amount+invoice_receipts.amount)::text END,
        'balance_funding_receipts_nanos',receipts.amount::text,
        'external_invoice_receipts_nanos',invoice_receipts.amount::text,
        'cash_receipt_reference_conflicts',receipt_conflicts.count::text,
        'recorded_funding_reversals_nanos',reversals.amount::text,
        'issued_gifts_nanos',gifts.amount::text)
FROM bounds,currency,totals,receipts,invoice_receipts,receipt_conflicts,gifts,reversals;
