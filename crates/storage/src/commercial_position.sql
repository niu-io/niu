-- Revenue excludes consumed gifts and recorded refunds; nongift is not proof
-- of cash collection. These are dispatch-cohort totals, not posting-period income.
-- Missing source allocation leaves full revenue and net contribution unknown.
-- One database snapshot; all period membership uses UTC dispatch timestamps.
-- Monetary ledgers are joined by attempt before aggregation, never by model alone.
WITH bounds AS MATERIALIZED (
    SELECT statement_timestamp() AS until,
           statement_timestamp() - make_interval(days => $2) AS since
), currencies AS (
    SELECT currency FROM cost_entries
    UNION SELECT currency FROM provider_earnings
    UNION SELECT currency FROM customer_charges
    UNION SELECT currency FROM provider_offer_revisions
    UNION SELECT currency FROM customer_tariff_revisions
    UNION SELECT currency FROM customer_media_charges
    UNION SELECT currency FROM customer_balance_accounts
    UNION SELECT document->'tariff'->>'currency' FROM supplier_media_rate_cards
), mappings AS (
    SELECT own.provider_id, m.alias AS model_alias, m.alias AS route_alias,
           m.vendor_id, m.enabled AND v.enabled AS route_enabled
    FROM vendor_supplier_ownership own
    JOIN vendors v ON v.id=own.vendor_id
    JOIN vendor_models m ON m.vendor_id=v.id
    WHERE NOT EXISTS (SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=v.id)
    UNION
    SELECT own.provider_id, pool.alias, m.alias, m.vendor_id,
           pool.enabled AND (candidate.value->>'enabled')::boolean AND m.enabled AND v.enabled
    FROM model_route_pools pool
    CROSS JOIN LATERAL jsonb_array_elements(pool.candidates) candidate(value)
    JOIN vendor_models m ON m.alias=candidate.value->>'alias'
    JOIN vendors v ON v.id=m.vendor_id
    JOIN vendor_supplier_ownership own ON own.vendor_id=v.id
    WHERE NOT EXISTS (SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=v.id)
), traffic AS MATERIALIZED (
    SELECT a.id, b.provider_id, a.resource_id AS model_alias,
           a.execution, a.usage_confidence, c.amount_nanos AS charge,
           e.amount_nanos AS earning, cost.cash_nanos AS cost,
           (c.amount_nanos=0 OR allocation.source_coverage='known')
               AND refunds.covered AS revenue_covered,
           refunds.nominal AS refunded,
           CASE WHEN c.amount_nanos=0 THEN 0 ELSE allocation.nongift_nanos END::numeric
               - refunds.nongift - late_gifts.amount AS net_revenue,
           CASE WHEN c.amount_nanos=0 THEN 0 ELSE allocation.gift_nanos END::numeric
               - refunds.gift + late_gifts.amount AS gift_allowance,
           settled.attempt_id IS NOT NULL AS supplier_settled
    FROM provider_attempt_offers b
    JOIN attempts a ON a.id=b.attempt_id
    JOIN provider_offers o ON o.id=b.offer_id
    JOIN provider_offer_revisions rate ON rate.id=b.revision_id
    LEFT JOIN supplier_media_attempt_pricing media ON media.attempt_id=a.id
    CROSS JOIN bounds
    LEFT JOIN (
        SELECT attempt_id,currency,amount_nanos FROM customer_charges
        UNION ALL
        SELECT attempt_id,currency,amount_nanos FROM customer_media_charges
    ) c ON c.attempt_id=a.id AND c.currency=$1
    LEFT JOIN customer_balance_entries debit ON debit.attempt_id=a.id
        AND debit.organization_id=a.organization_id AND debit.project_id=a.project_id
        AND debit.currency=$1 AND debit.kind='charge'
        AND debit.amount_nanos::numeric=-c.amount_nanos::numeric
    LEFT JOIN customer_balance_consumption_allocations allocation ON allocation.entry_id=debit.id
    LEFT JOIN LATERAL (
        SELECT COALESCE(bool_and(COALESCE(refund_allocation.source_coverage='known',false)),true) AS covered,
               COALESCE(sum(refund.amount_nanos::numeric),0) AS nominal,
               COALESCE(sum(refund_allocation.nongift_nanos::numeric),0) AS nongift,
               COALESCE(sum(refund_allocation.gift_nanos::numeric),0) AS gift
        FROM customer_balance_entries refund
        LEFT JOIN customer_balance_consumption_allocations refund_allocation ON refund_allocation.entry_id=refund.id
        WHERE refund.reverses_entry_id=debit.id AND refund.kind='refund'
    ) refunds ON true
    LEFT JOIN LATERAL (
        SELECT COALESCE(sum(application.amount_nanos::numeric),0) AS amount
        FROM customer_grant_credit_applications application
        WHERE application.charge_entry_id=debit.id
    ) late_gifts ON true
    LEFT JOIN provider_earnings e ON e.attempt_id=a.id AND e.currency=$1
    LEFT JOIN cost_entries cost ON cost.attempt_id=a.id AND cost.currency=$1
    LEFT JOIN provider_settlement_entries settled ON settled.attempt_id=e.attempt_id
    WHERE (COALESCE(rate.currency,media.snapshot->'tariff'->>'currency')=$1
        OR c.attempt_id IS NOT NULL OR e.attempt_id IS NOT NULL OR cost.attempt_id IS NOT NULL)
      AND NOT EXISTS (SELECT 1 FROM personal_attempt_routes personal WHERE personal.attempt_id=a.id)
      AND NOT EXISTS (SELECT 1 FROM operation_funding_sources funding WHERE funding.operation_id=a.operation_id AND funding.funding_source='personal')
      AND a.dispatched_at>=bounds.since AND a.dispatched_at<bounds.until
      AND NOT EXISTS (SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=o.vendor_id)
), inventory AS (
    SELECT provider_id,model_alias FROM mappings
    UNION SELECT provider_id,model_alias FROM traffic
), quotes AS (
    SELECT mapping.provider_id,mapping.model_alias,
           jsonb_agg(DISTINCT jsonb_build_object(
               'offer_id',o.id,'route_alias',mapping.route_alias,
               'revision',rate.id,'rate_kind',rate.rate_kind,
               'prompt_rate',rate.prompt_rate::text,'completion_rate',rate.completion_rate::text,
               'media_rates',COALESCE((SELECT jsonb_agg(jsonb_build_object(
                   'revision',card.revision,'tariff',card.document->'tariff'||jsonb_build_object('amount_units',card.document->'tariff'->>'amount_units','effective_from',card.document->'tariff'->>'effective_from','effective_until',card.document->'tariff'->>'effective_until'),
                   'discounts',(SELECT COALESCE(jsonb_agg(rule.value||jsonb_build_object('effective_from',rule.value->>'effective_from','effective_until',rule.value->>'effective_until') ORDER BY rule.ordinality),'[]'::jsonb) FROM jsonb_array_elements(card.document->'discounts') WITH ORDINALITY AS rule(value,ordinality))) ORDER BY card.revision)
                   FROM supplier_media_rate_cards card
                   CROSS JOIN bounds
                   WHERE card.provider_id=o.provider_id AND card.offer_revision=rate.id
                     AND card.document->'tariff'->>'currency'=$1
                     AND card.effective_from<=floor(extract(epoch FROM bounds.until))::bigint
                     AND (card.effective_until IS NULL OR card.effective_until>floor(extract(epoch FROM bounds.until))::bigint)
                     AND NOT EXISTS (SELECT 1 FROM supplier_media_rate_retirements retired
                         WHERE retired.provider_id=card.provider_id AND retired.revision=card.revision
                           AND retired.effective_until<=floor(extract(epoch FROM bounds.until))::bigint)), '[]'::jsonb),
               'state',CASE WHEN NOT o.active OR NOT mapping.route_enabled THEN 'paused'
                   WHEN niu_offer_qualification_current(o.provider_id,o.id,o.current_revision) THEN 'qualified'
                   ELSE 'unqualified' END)) AS offers
    FROM mappings mapping
    JOIN provider_offers o ON o.provider_id=mapping.provider_id
        AND o.model_alias=mapping.route_alias AND o.vendor_id=mapping.vendor_id
    JOIN provider_offer_revisions rate ON rate.id=o.current_revision
        AND (rate.currency=$1 OR (rate.rate_kind='media' AND EXISTS (
            SELECT 1 FROM supplier_media_rate_cards card
            WHERE card.provider_id=o.provider_id AND card.offer_revision=rate.id
              AND card.document->'tariff'->>'currency'=$1)))
    GROUP BY mapping.provider_id,mapping.model_alias
), totals AS (
    SELECT provider_id,model_alias,
           sum(charge)::text AS customer_charge_nanos,
           CASE WHEN count(charge)>0 THEN sum(refunded)::text END AS customer_refunds_nanos,
           count(*) FILTER (WHERE charge IS NOT NULL AND revenue_covered IS NOT TRUE)::text AS revenue_uncovered_attempts,
           CASE WHEN count(charge)>0
               AND count(*) FILTER (WHERE charge IS NOT NULL AND revenue_covered IS NOT TRUE)=0
               AND count(*) FILTER (WHERE execution<>'confirmed_not_executed'
                   AND (execution<>'confirmed_completed' OR usage_confidence<>'provider_reported' OR charge IS NULL))=0
               THEN sum(net_revenue)::text END AS net_customer_revenue_nanos,
           CASE WHEN count(charge)>0
               AND count(*) FILTER (WHERE charge IS NOT NULL AND revenue_covered IS NOT TRUE)=0
               AND count(*) FILTER (WHERE execution<>'confirmed_not_executed'
                   AND (execution<>'confirmed_completed' OR usage_confidence<>'provider_reported' OR charge IS NULL))=0
               THEN sum(gift_allowance)::text END AS consumed_gift_allowance_nanos,
           CASE WHEN count(*) FILTER (WHERE charge IS NOT NULL AND earning IS NOT NULL)>0
               AND count(*) FILTER (WHERE charge IS NOT NULL AND revenue_covered IS NOT TRUE)=0
               AND count(*) FILTER (WHERE execution<>'confirmed_not_executed'
                   AND (execution<>'confirmed_completed' OR usage_confidence<>'provider_reported' OR charge IS NULL OR earning IS NULL))=0
               THEN sum(net_revenue-earning::numeric) FILTER (WHERE charge IS NOT NULL AND earning IS NOT NULL)::text
               END AS net_contribution_nanos,
           CASE WHEN count(cost)>0 THEN sum(cost)::text END AS known_upstream_cost_subtotal_nanos,
           count(cost)::text AS upstream_cost_recorded_attempts,
           sum(earning)::text AS earning_nanos,
           CASE WHEN count(earning)>0 THEN
               COALESCE(sum(earning) FILTER (WHERE supplier_settled),0)::text END AS settled_earning_nanos,
           CASE WHEN count(earning)>0 THEN
               COALESCE(sum(earning) FILTER (WHERE NOT supplier_settled),0)::text END AS unsettled_earning_nanos,
           count(*) FILTER (WHERE execution<>'confirmed_not_executed'
               AND (execution<>'confirmed_completed' OR usage_confidence<>'provider_reported'
                    OR charge IS NULL OR earning IS NULL))::text AS unresolved_attempts,
           count(*) FILTER (WHERE charge IS NOT NULL AND earning IS NOT NULL)::text AS matched_attempts,
           count(*) FILTER (WHERE charge IS NOT NULL AND earning IS NOT NULL AND cost IS NOT NULL)::text AS cost_known_attempts,
           CASE WHEN count(*) FILTER (WHERE charge IS NOT NULL AND earning IS NOT NULL)>0
               AND count(*) FILTER (WHERE charge IS NOT NULL AND earning IS NOT NULL AND cost IS NULL)=0
               THEN sum(cost) FILTER (WHERE charge IS NOT NULL AND earning IS NOT NULL)::text END AS cost_nanos,
           CASE WHEN count(*) FILTER (WHERE charge IS NOT NULL AND earning IS NOT NULL)>0
               AND count(*) FILTER (WHERE execution<>'confirmed_not_executed'
                   AND (execution<>'confirmed_completed' OR usage_confidence<>'provider_reported'
                        OR charge IS NULL OR earning IS NULL))=0
               THEN sum(charge::numeric-earning::numeric)
                   FILTER (WHERE charge IS NOT NULL AND earning IS NOT NULL)::text END AS margin_nanos
    FROM traffic GROUP BY provider_id,model_alias
), rows AS (
    SELECT inventory.provider_id,inventory.model_alias,
           jsonb_build_object('supplier_id',inventory.provider_id,'supplier_name',business.name,
               'model_alias',inventory.model_alias,'currency',$1,
               'offers',COALESCE(quotes.offers,'[]'::jsonb),
               'customer_charge_nanos',totals.customer_charge_nanos,
               'customer_refunds_nanos',totals.customer_refunds_nanos,
               'net_customer_revenue_nanos',totals.net_customer_revenue_nanos,
               'consumed_gift_allowance_nanos',totals.consumed_gift_allowance_nanos,
               'net_contribution_nanos',totals.net_contribution_nanos,
               'revenue_uncovered_attempts',COALESCE(totals.revenue_uncovered_attempts,'0'),
               'earning_nanos',totals.earning_nanos,
               'settled_earning_nanos',totals.settled_earning_nanos,
               'unsettled_earning_nanos',totals.unsettled_earning_nanos,
               'cost_nanos',totals.cost_nanos,'margin_nanos',totals.margin_nanos,
               'known_upstream_cost_subtotal_nanos',totals.known_upstream_cost_subtotal_nanos,
               'upstream_cost_recorded_attempts',COALESCE(totals.upstream_cost_recorded_attempts,'0'),
               'unresolved_attempts',COALESCE(totals.unresolved_attempts,'0'),
               'matched_attempts',COALESCE(totals.matched_attempts,'0'),
               'cost_known_attempts',COALESCE(totals.cost_known_attempts,'0')) AS document
    FROM inventory JOIN provider_businesses business ON business.id=inventory.provider_id
    LEFT JOIN quotes USING(provider_id,model_alias)
    LEFT JOIN totals USING(provider_id,model_alias)
)
SELECT EXISTS(SELECT 1 FROM currencies WHERE currency=$1),
       jsonb_build_object('currency',$1,'days',$2,'from',bounds.since,'until',bounds.until,
           'data',COALESCE((SELECT jsonb_agg(document ORDER BY model_alias,provider_id) FROM rows),'[]'::jsonb))
FROM bounds;
