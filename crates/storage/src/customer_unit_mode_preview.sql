-- One statement snapshot. This is advisory, never a mode-change authorization.
-- Only customer accounting participates; procurement and Provider settlement
-- remain monetary and do not enter this response.
WITH configuration AS MATERIALIZED (
    SELECT c.*, (SELECT max(revision) FROM customer_unit_definitions) AS definition_revision,
        (SELECT currency FROM platform_currency WHERE singleton) AS payment_currency
    FROM customer_unit_configuration c WHERE singleton
), consumed AS (
    SELECT lot_id,sum(end_atom-first_atom) AS atoms
    FROM customer_unit_consumed_ranges GROUP BY lot_id
), restored AS (
    SELECT c.lot_id,sum(LEAST(r.end_atom,c.charge_offset+c.end_atom-c.first_atom)
        -GREATEST(r.first_atom,c.charge_offset)) AS atoms
    FROM customer_unit_consumed_ranges c JOIN customer_unit_restorations r
        ON r.attempt_id=c.attempt_id AND r.first_atom<c.charge_offset+c.end_atom-c.first_atom
        AND r.end_atom>c.charge_offset GROUP BY c.lot_id
), facts(category, organization_id) AS MATERIALIZED (
    SELECT 'monetary_balance',organization_id FROM customer_balance_accounts WHERE posted_balance_nanos<>0
    UNION ALL SELECT 'monetary_credit_facility',organization_id FROM customer_balance_accounts WHERE credit_limit_nanos>0
    UNION ALL SELECT 'monetary_reservation',organization_id FROM customer_balance_reservations WHERE released_at IS NULL
    UNION ALL SELECT 'unposted_monetary_charge',c.organization_id FROM (
        SELECT attempt_id,organization_id,amount_nanos FROM customer_charges
        UNION ALL SELECT attempt_id,organization_id,amount_nanos FROM customer_media_charges
    ) c WHERE c.amount_nanos>0 AND NOT EXISTS (
        SELECT 1 FROM customer_balance_entries e WHERE e.attempt_id=c.attempt_id AND e.kind='charge')
    UNION ALL SELECT 'pending_checkout',o.organization_id FROM customer_topup_orders o
        WHERE NOT EXISTS(SELECT 1 FROM customer_topup_settlements s WHERE s.order_id=o.id)
          AND NOT EXISTS(SELECT 1 FROM customer_topup_closures c WHERE c.order_id=o.id)
    UNION ALL SELECT 'unapplied_monetary_grant',p.organization_id FROM prepared_customer_balance_grants p
        WHERE NOT EXISTS(SELECT 1 FROM customer_balance_grants g
            WHERE g.organization_id=p.organization_id AND g.idempotency_key=p.idempotency_key)
    UNION ALL SELECT 'remaining_credits',l.organization_id FROM customer_unit_lots l
        LEFT JOIN consumed c ON c.lot_id=l.id LEFT JOIN restored r ON r.lot_id=l.id
        WHERE (l.expires_at IS NULL OR l.expires_at>statement_timestamp())
          AND l.credit_atoms-COALESCE(c.atoms,0)+COALESCE(r.atoms,0)>0
    UNION ALL SELECT 'credits_reservation',r.organization_id FROM customer_unit_reservations r
        WHERE NOT EXISTS(SELECT 1 FROM customer_unit_resolutions s WHERE s.attempt_id=r.attempt_id)
    UNION ALL SELECT 'unresolved_credits_charge',r.organization_id FROM customer_unit_text_charges c
        JOIN customer_unit_reservations r USING(attempt_id)
        WHERE NOT EXISTS(SELECT 1 FROM customer_unit_resolutions s WHERE s.attempt_id=c.attempt_id)
    UNION ALL SELECT 'unsettled_customer_request',a.organization_id FROM attempts a
        WHERE (EXISTS(SELECT 1 FROM customer_attempt_tariffs t WHERE t.attempt_id=a.id)
            OR EXISTS(SELECT 1 FROM customer_media_attempt_pricing t WHERE t.attempt_id=a.id)
            OR EXISTS(SELECT 1 FROM customer_unit_attempt_tariffs t WHERE t.attempt_id=a.id))
          AND (a.execution='may_have_executed' OR (a.execution='confirmed_completed'
            AND NOT EXISTS(SELECT 1 FROM customer_charges c WHERE c.attempt_id=a.id)
            AND NOT EXISTS(SELECT 1 FROM customer_media_charges c WHERE c.attempt_id=a.id)
            AND NOT EXISTS(SELECT 1 FROM customer_unit_resolutions c WHERE c.attempt_id=a.id AND c.kind='charge')))
    UNION ALL SELECT 'missing_unit_definition',NULL::uuid FROM configuration
        WHERE $1='credits' AND definition_revision IS NULL
    UNION ALL SELECT 'missing_payment_currency',NULL::uuid FROM configuration
        WHERE $1='credits' AND payment_currency IS NULL
    UNION ALL SELECT 'missing_purchase_rule',NULL::uuid FROM configuration c
        WHERE $1='credits' AND c.payment_currency IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customer_unit_purchase_rules r
            WHERE r.definition_revision=c.definition_revision AND r.payment_currency=c.payment_currency)
), categories AS (
    SELECT category,count(*) AS records,count(DISTINCT organization_id) AS organizations
    FROM facts GROUP BY category
), accounts AS (
    SELECT f.category,f.organization_id,o.name,count(*) AS records,
        row_number() OVER(PARTITION BY f.category ORDER BY o.name,f.organization_id) AS ordinal
    FROM facts f JOIN organizations o ON o.id=f.organization_id
    GROUP BY f.category,f.organization_id,o.name
)
SELECT jsonb_build_object(
    'revision',c.revision::text,'billing_mode',c.billing_mode,'target_mode',$1::text,
    'change_required',c.billing_mode<>$1,'blockers_empty',NOT EXISTS(SELECT 1 FROM facts),
    'observed_at',to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'blockers',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'category',g.category,'record_count',g.records::text,'organization_count',g.organizations::text,
        'accounts_truncated',g.organizations>100,
        'accounts',COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'organization_id',a.organization_id,'name',a.name,'record_count',a.records::text
        ) ORDER BY a.ordinal) FROM accounts a WHERE a.category=g.category AND a.ordinal<=100),'[]'::jsonb)
    ) ORDER BY g.category) FROM categories g),'[]'::jsonb),
    'preserved_configuration',jsonb_build_object(
        'monetary_workspace_limits',(SELECT count(*)::text FROM customer_workspace_spending_limits),
        'monetary_key_limits',(SELECT count(*)::text FROM customer_key_spending_limits WHERE limit_nanos IS NOT NULL),
        'monetary_text_tariffs',(SELECT count(*)::text FROM customer_tariffs WHERE current_revision IS NOT NULL),
        'monetary_retail_prices',(SELECT count(*)::text FROM platform_retail_price_heads WHERE current_revision IS NOT NULL),
        'monetary_media_rate_history',(SELECT count(*)::text FROM customer_media_rate_cards),
        'credits_text_tariffs',(SELECT count(DISTINCT model_alias)::text FROM customer_unit_text_tariffs)
    )
) FROM configuration c
