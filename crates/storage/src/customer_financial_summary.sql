-- Financial posting interval, separate from the commercial dispatch cohort.
-- Unknown historical funding allocation must never become zero gift / gross income.
WITH raw_bounds AS MATERIALIZED (
    SELECT LEAST(COALESCE(to_timestamp($4::bigint::double precision / 1000.0), statement_timestamp()), statement_timestamp()) AS until,
           COALESCE(to_timestamp($3::bigint::double precision / 1000.0), statement_timestamp() - make_interval(days => COALESCE($2, 30))) AS since
), bounds AS MATERIALIZED (
    SELECT GREATEST(raw_bounds.since, raw_bounds.until) AS until,
           raw_bounds.since AS since
    FROM raw_bounds
), currency AS (
    SELECT EXISTS(SELECT 1 FROM customer_balance_accounts WHERE currency=$1)
        OR EXISTS(SELECT 1 FROM customer_tariff_revisions WHERE currency=$1)
        OR EXISTS(SELECT 1 FROM customer_media_charges WHERE currency=$1)
        OR EXISTS(SELECT 1 FROM customer_unit_purchase_rules WHERE payment_currency=$1)
        OR EXISTS(SELECT 1 FROM customer_unit_lots WHERE payment_currency=$1) AS known
), simulated_accounts AS MATERIALIZED (
    -- The immutable receipt channel records checkout provenance. Current plugin
    -- settings cannot reclassify historical simulated money as cash.
    SELECT DISTINCT account_id FROM customer_funding_receipts
    WHERE channel='stripe:NiuMockPayments'
), retail AS (
    SELECT c.attempt_id,c.organization_id,c.project_id,c.currency,c.amount_nanos,c.created_at
        FROM customer_charges c CROSS JOIN bounds
        WHERE c.currency=$1 AND c.created_at>=bounds.since AND c.created_at<bounds.until
    UNION ALL
    SELECT c.attempt_id,c.organization_id,c.project_id,c.currency,c.amount_nanos,c.created_at
        FROM customer_media_charges c CROSS JOIN bounds
        WHERE c.currency=$1 AND c.created_at>=bounds.since AND c.created_at<bounds.until
), consumption AS (
    SELECT c.amount_nanos::numeric AS nominal, 'charge'::text AS kind,
           c.amount_nanos=0 OR (allocation.source_coverage='known'
               AND NOT EXISTS (SELECT 1 FROM simulated_accounts simulated
                   WHERE simulated.account_id=entry.account_id)) AS covered,
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
        AND NOT EXISTS (SELECT 1 FROM personal_attempt_routes personal
            WHERE personal.attempt_id=attempt.id)
        AND NOT EXISTS (SELECT 1 FROM provider_attempt_offers binding
            JOIN provider_offers offer ON offer.id=binding.offer_id
            JOIN personal_vendor_ownership personal ON personal.vendor_id=offer.vendor_id
            WHERE binding.attempt_id=attempt.id)
    UNION ALL
    SELECT entry.amount_nanos::numeric, 'refund', allocation.source_coverage='known'
        AND NOT EXISTS (SELECT 1 FROM simulated_accounts simulated
            WHERE simulated.account_id=entry.account_id),
           allocation.gift_nanos::numeric, allocation.nongift_nanos::numeric
    FROM customer_balance_entries entry CROSS JOIN bounds
    JOIN customer_balance_entries original ON original.id=entry.reverses_entry_id
    JOIN attempts attempt ON attempt.id=original.attempt_id
    LEFT JOIN operation_funding_sources funding ON funding.operation_id=attempt.operation_id
    LEFT JOIN customer_balance_consumption_allocations allocation ON allocation.entry_id=entry.id
    WHERE entry.currency=$1 AND entry.kind='refund'
        AND entry.created_at>=bounds.since AND entry.created_at<bounds.until
        AND funding.funding_source IS DISTINCT FROM 'personal'
        AND NOT EXISTS (SELECT 1 FROM personal_attempt_routes personal
            WHERE personal.attempt_id=attempt.id)
        AND NOT EXISTS (SELECT 1 FROM provider_attempt_offers binding
            JOIN provider_offers offer ON offer.id=binding.offer_id
            JOIN personal_vendor_ownership personal ON personal.vendor_id=offer.vendor_id
            WHERE binding.attempt_id=attempt.id)
    UNION ALL
    -- An application is an allowance posting, not another nominal charge or
    -- wallet adjustment. Late-gift refunds already appear in refund gift_nanos.
    SELECT 0::numeric, 'grant_application',
           NOT EXISTS (SELECT 1 FROM simulated_accounts simulated
               WHERE simulated.account_id=application.account_id), application.amount_nanos::numeric,
           -application.amount_nanos::numeric
    FROM customer_grant_credit_applications application CROSS JOIN bounds
    JOIN customer_balance_entries original ON original.id=application.charge_entry_id
    JOIN attempts attempt ON attempt.id=original.attempt_id
    LEFT JOIN operation_funding_sources funding ON funding.operation_id=attempt.operation_id
    WHERE application.currency=$1 AND application.created_at>=bounds.since
        AND application.created_at<bounds.until
        AND funding.funding_source IS DISTINCT FROM 'personal'
        AND NOT EXISTS (SELECT 1 FROM personal_attempt_routes personal WHERE personal.attempt_id=attempt.id)
        AND NOT EXISTS (SELECT 1 FROM provider_attempt_offers binding
            JOIN provider_offers offer ON offer.id=binding.offer_id
            JOIN personal_vendor_ownership personal ON personal.vendor_id=offer.vendor_id
            WHERE binding.attempt_id=attempt.id)
    UNION ALL
    -- Purchased Credits consumption and restorations release/restore exact cash
    -- backing from the original purchase lot; simulated and promotional lots
    -- have zero cash backing and never enter cash revenue or refunds.
    SELECT niu_credit_range_backing(l.credit_atoms,l.backing_nanos,c.first_atom,c.end_atom)::numeric,
           'charge', TRUE, 0::numeric,
           niu_credit_range_backing(l.credit_atoms,l.backing_nanos,c.first_atom,c.end_atom)::numeric
    FROM customer_unit_consumed_ranges c CROSS JOIN bounds
    JOIN customer_unit_resolutions res ON res.attempt_id=c.attempt_id AND res.kind='charge'
    JOIN customer_unit_lots l ON l.id=c.lot_id
    JOIN attempts attempt ON attempt.id=c.attempt_id
    LEFT JOIN operation_funding_sources funding ON funding.operation_id=attempt.operation_id
    WHERE l.provenance='purchased' AND l.payment_currency=$1
        AND res.created_at>=bounds.since AND res.created_at<bounds.until
        AND funding.funding_source IS DISTINCT FROM 'personal'
        AND NOT EXISTS (SELECT 1 FROM personal_attempt_routes personal WHERE personal.attempt_id=attempt.id)
        AND NOT EXISTS (SELECT 1 FROM provider_attempt_offers binding
            JOIN provider_offers offer ON offer.id=binding.offer_id
            JOIN personal_vendor_ownership personal ON personal.vendor_id=offer.vendor_id
            WHERE binding.attempt_id=attempt.id)
    UNION ALL
    SELECT niu_credit_range_backing(
               l.credit_atoms,
               l.backing_nanos,
               c.first_atom + GREATEST(0, rest.first_atom - c.charge_offset),
               c.first_atom + LEAST(c.end_atom - c.first_atom, rest.end_atom - c.charge_offset)
           )::numeric,
           'refund', TRUE, 0::numeric,
           niu_credit_range_backing(
               l.credit_atoms,
               l.backing_nanos,
               c.first_atom + GREATEST(0, rest.first_atom - c.charge_offset),
               c.first_atom + LEAST(c.end_atom - c.first_atom, rest.end_atom - c.charge_offset)
           )::numeric
    FROM customer_unit_restorations rest CROSS JOIN bounds
    JOIN customer_unit_consumed_ranges c ON c.attempt_id=rest.attempt_id
        AND rest.first_atom<c.charge_offset+(c.end_atom-c.first_atom)
        AND rest.end_atom>c.charge_offset
    JOIN customer_unit_lots l ON l.id=c.lot_id
    JOIN attempts attempt ON attempt.id=c.attempt_id
    LEFT JOIN operation_funding_sources funding ON funding.operation_id=attempt.operation_id
    WHERE l.provenance='purchased' AND l.payment_currency=$1
        AND rest.created_at>=bounds.since AND rest.created_at<bounds.until
        AND funding.funding_source IS DISTINCT FROM 'personal'
        AND NOT EXISTS (SELECT 1 FROM personal_attempt_routes personal WHERE personal.attempt_id=attempt.id)
        AND NOT EXISTS (SELECT 1 FROM provider_attempt_offers binding
            JOIN provider_offers offer ON offer.id=binding.offer_id
            JOIN personal_vendor_ownership personal ON personal.vendor_id=offer.vendor_id
            WHERE binding.attempt_id=attempt.id)
), totals AS (
    SELECT COALESCE(sum(nominal) FILTER (WHERE kind='charge'),0) AS nominal,
           COALESCE(sum(nominal) FILTER (WHERE kind='refund'),0) AS refunded,
           COALESCE(sum(CASE WHEN kind='refund' THEN -nongift ELSE nongift END)
               FILTER (WHERE covered IS TRUE),0) AS known_revenue,
           COALESCE(sum(CASE WHEN kind='refund' THEN -gift ELSE gift END)
               FILTER (WHERE covered IS TRUE),0) AS known_allowance,
           count(*) FILTER (WHERE covered IS NOT TRUE) AS uncovered_entries,
           COALESCE(sum(nominal) FILTER (WHERE covered IS NOT TRUE),0) AS uncovered_nominal
    FROM consumption
), credit_account_positions AS (
    -- Point-in-time wallet provenance, not revenue posted during this interval.
    -- Existing consumption splits combine real and simulated funding. Do not
    -- invent a cash allocation for mixed historical wallets.
    SELECT account.id, niu_customer_credit_account_covered(account.id)
        AND NOT EXISTS (SELECT 1 FROM simulated_accounts simulated
            WHERE simulated.account_id=account.id) AS covered,
        COALESCE((SELECT sum(receipt.amount_nanos::numeric) FROM customer_funding_receipts receipt
            WHERE receipt.account_id=account.id),0)
        -COALESCE(source.cash_consumed,0)+COALESCE(source.cash_restored,0)
        -COALESCE(repaid.amount,0) AS prepaid_cash,
        COALESCE(source.credit_incurred,0)-COALESCE(source.credit_cancelled,0)
        -COALESCE(repaid.amount,0)
        -COALESCE((SELECT sum(application.amount_nanos::numeric) FROM customer_grant_credit_applications application
            WHERE application.account_id=account.id),0) AS outstanding_credit
    FROM customer_balance_accounts account
    LEFT JOIN LATERAL (
        SELECT sum(cash_nanos::numeric) FILTER (WHERE kind='charge') AS cash_consumed,
            sum(cash_nanos::numeric) FILTER (WHERE kind='refund') AS cash_restored,
            sum(credit_nanos::numeric) FILTER (WHERE kind='charge') AS credit_incurred,
            sum(credit_nanos::numeric) FILTER (WHERE kind='refund') AS credit_cancelled
        FROM customer_credit_sources WHERE account_id=account.id
    ) source ON true
    LEFT JOIN LATERAL (
        SELECT sum(amount_nanos::numeric) AS amount FROM customer_credit_repayments
        WHERE account_id=account.id
    ) repaid ON true
    WHERE account.currency=$1
), credit_positions AS (
    SELECT count(*) FILTER (WHERE covered IS NOT TRUE OR prepaid_cash<0 OR outstanding_credit<0) AS uncovered_accounts,
        COALESCE(sum(prepaid_cash) FILTER (WHERE covered IS TRUE AND prepaid_cash>=0 AND outstanding_credit>=0),0) AS known_prepaid_cash,
        COALESCE(sum(outstanding_credit) FILTER (WHERE covered IS TRUE AND prepaid_cash>=0 AND outstanding_credit>=0),0) AS known_outstanding_credit
    FROM credit_account_positions
), payment_receipts AS (
    -- Monetary payment receipts cover both funding kinds. Credits purchases
    -- never enter monetary-wallet allocation or credit-repayment calculations.
    SELECT channel,payment_reference,currency,amount_nanos,created_at FROM customer_funding_receipts
    UNION ALL
    SELECT channel,payment_reference,currency,amount_nanos,created_at FROM customer_unit_funding_receipts
), receipts AS (
    SELECT COALESCE(sum(amount_nanos::numeric) FILTER (WHERE channel<>'stripe:NiuMockPayments'),0) AS amount,
        COALESCE(sum(amount_nanos::numeric) FILTER (WHERE channel='stripe:NiuMockPayments'),0) AS simulated_amount
    FROM payment_receipts CROSS JOIN bounds
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
        SELECT 1 FROM payment_receipts receipt
        WHERE receipt.payment_reference=payment.payment_reference
          AND ((payment.created_at>=bounds.since AND payment.created_at<bounds.until)
            OR (receipt.created_at>=bounds.since AND receipt.created_at<bounds.until)))
), gifts AS (
    SELECT COALESCE(sum(amount_nanos::numeric),0) AS amount
    FROM customer_balance_grants CROSS JOIN bounds
    WHERE currency=$1 AND created_at>=bounds.since AND created_at<bounds.until
), gift_corrections AS (
    SELECT COALESCE(sum(amount_nanos::numeric),0) AS amount
    FROM customer_balance_grant_corrections CROSS JOIN bounds
    WHERE currency=$1 AND created_at>=bounds.since AND created_at<bounds.until
), reversals AS (
    SELECT COALESCE((
        SELECT sum(-entry.amount_nanos::numeric)
        FROM customer_balance_entries entry
        JOIN customer_funding_receipts receipt ON receipt.entry_id=entry.reverses_entry_id
        WHERE entry.currency=$1 AND entry.kind='funding_reversal'
            AND receipt.channel<>'stripe:NiuMockPayments'
            AND entry.created_at>=bounds.since AND entry.created_at<bounds.until
    ),0) + COALESCE((
        SELECT sum(rev.refund_backing_nanos::numeric)
        FROM customer_unit_purchase_reversals rev
        WHERE rev.payment_currency=$1 AND rev.provenance='purchased'
            AND rev.created_at>=bounds.since AND rev.created_at<bounds.until
    ),0) AS amount
    FROM bounds
)
SELECT currency.known,
    jsonb_build_object('currency',$1,'days',COALESCE($2, GREATEST(1, ceil(extract(epoch FROM (bounds.until - bounds.since)) / 86400.0)::int)),'from',bounds.since,'until',bounds.until,
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
        'simulated_funding_receipts_nanos',receipts.simulated_amount::text,
        'external_invoice_receipts_nanos',invoice_receipts.amount::text,
        'cash_receipt_reference_conflicts',receipt_conflicts.count::text,
        'recorded_funding_reversals_nanos',reversals.amount::text,
        'issued_gifts_nanos',gifts.amount::text,
        'corrected_unused_gifts_nanos',gift_corrections.amount::text,
        'balance_credit_sources',jsonb_build_object(
            'as_of',bounds.until,
            'uncovered_accounts',credit_positions.uncovered_accounts::text,
            'simulated_funding_accounts',(SELECT count(*)::text FROM simulated_accounts simulated
                JOIN customer_balance_accounts account ON account.id=simulated.account_id WHERE account.currency=$1),
            'prepaid_cash_nanos',CASE WHEN credit_positions.uncovered_accounts=0 THEN credit_positions.known_prepaid_cash::text END,
            'outstanding_credit_nanos',CASE WHEN credit_positions.uncovered_accounts=0 THEN credit_positions.known_outstanding_credit::text END,
            'known_prepaid_cash_subtotal_nanos',credit_positions.known_prepaid_cash::text,
            'known_outstanding_credit_subtotal_nanos',credit_positions.known_outstanding_credit::text))
FROM bounds,currency,totals,credit_positions,receipts,invoice_receipts,receipt_conflicts,gifts,gift_corrections,reversals;
