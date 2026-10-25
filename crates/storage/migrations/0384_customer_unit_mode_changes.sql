-- Durable, explicit mode changes. Historical billing records retain their units.
CREATE FUNCTION niu_customer_unit_mode_preview(TEXT) RETURNS JSONB LANGUAGE SQL VOLATILE AS $preview$
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

$preview$;

CREATE TABLE customer_unit_mode_previews (
    id UUID PRIMARY KEY,
    expected_revision BIGINT NOT NULL CHECK(expected_revision>=0),
    source_mode TEXT NOT NULL CHECK(source_mode IN ('currency','credits')),
    target_mode TEXT NOT NULL CHECK(target_mode IN ('currency','credits')),
    snapshot JSONB NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
    idempotency_key UUID NOT NULL UNIQUE,
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('installation','operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()+interval '15 minutes',
    CHECK((actor_kind='operator')=(actor_operator_id IS NOT NULL)),
    CHECK(expires_at>created_at)
);
CREATE TRIGGER immutable_customer_unit_mode_preview BEFORE UPDATE OR DELETE ON customer_unit_mode_previews
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE customer_unit_mode_changes (
    revision BIGINT PRIMARY KEY,
    expected_revision BIGINT NOT NULL CHECK(expected_revision>=0 AND revision=expected_revision+1),
    preview_id UUID NOT NULL UNIQUE REFERENCES customer_unit_mode_previews(id),
    source_mode TEXT NOT NULL CHECK(source_mode IN ('currency','credits')),
    target_mode TEXT NOT NULL CHECK(target_mode IN ('currency','credits') AND target_mode<>source_mode),
    idempotency_key UUID NOT NULL UNIQUE,
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('installation','operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK((actor_kind='operator')=(actor_operator_id IS NOT NULL))
);
CREATE TRIGGER immutable_customer_unit_mode_change BEFORE UPDATE OR DELETE ON customer_unit_mode_changes
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- Rare installation changes fail quickly on concurrent writes. NOWAIT avoids
-- waiting with a lock order opposite to inference/payment recording. All tables
-- contributing blockers are stable before a fresh statement rechecks them.
CREATE FUNCTION niu_lock_customer_unit_mode_change() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    LOCK TABLE attempts, customer_balance_accounts, customer_balance_entries,
        customer_balance_reservations, customer_charges, customer_media_charges,
        customer_topup_orders, customer_topup_settlements, customer_topup_closures,
        prepared_customer_balance_grants, customer_balance_grants,
        customer_unit_lots, customer_unit_reservations, customer_unit_reserved_ranges,
        customer_unit_resolutions, customer_unit_restorations, customer_unit_text_charges,
        customer_attempt_tariffs, customer_media_attempt_pricing, customer_unit_attempt_tariffs
        IN SHARE MODE NOWAIT;
END;
$$;
CREATE FUNCTION validate_customer_unit_mode_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE snapshot JSONB;
BEGIN
    IF NEW.billing_mode=OLD.billing_mode THEN RETURN NEW; END IF;
    PERFORM niu_lock_customer_unit_mode_change();
    IF NEW.revision<>OLD.revision+1 OR NOT EXISTS (
        SELECT 1 FROM customer_unit_mode_changes e JOIN customer_unit_mode_previews p ON p.id=e.preview_id
        WHERE e.revision=NEW.revision AND e.expected_revision=OLD.revision
          AND e.source_mode=OLD.billing_mode AND e.target_mode=NEW.billing_mode
          AND p.expected_revision=OLD.revision AND p.source_mode=OLD.billing_mode
          AND p.target_mode=NEW.billing_mode AND p.expires_at>clock_timestamp()
          AND p.snapshot->>'blockers_empty'='true' AND p.snapshot->>'change_required'='true'
    ) THEN
        RAISE EXCEPTION 'Billing mode requires an unexpired compatible preview and immutable change record'
            USING ERRCODE='23514',CONSTRAINT='customer_unit_mode_guard';
    END IF;
    snapshot := niu_customer_unit_mode_preview(NEW.billing_mode);
    IF snapshot->>'blockers_empty'<>'true' THEN
        RAISE EXCEPTION 'Customer obligations prevent billing mode change'
            USING ERRCODE='23514',CONSTRAINT='customer_unit_mode_guard';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_mode_change BEFORE UPDATE OF billing_mode ON customer_unit_configuration
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_mode_change();

-- Serialize new issuance with mode publication. Historical refunds/settlements
-- keep their original units; no trigger relabels or converts existing records.
CREATE FUNCTION require_customer_issuance_mode() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE mode TEXT;
BEGIN
    SELECT billing_mode INTO STRICT mode FROM customer_unit_configuration WHERE singleton FOR SHARE;
    IF mode<>TG_ARGV[0] THEN
        RAISE EXCEPTION 'New issuance requires its configured customer billing mode'
            USING ERRCODE='23514',CONSTRAINT='customer_unit_mode_guard';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_customer_unit_issuance_mode BEFORE INSERT ON customer_unit_lots
    FOR EACH ROW EXECUTE FUNCTION require_customer_issuance_mode('credits');
CREATE TRIGGER require_customer_money_grant_mode BEFORE INSERT ON prepared_customer_balance_grants
    FOR EACH ROW EXECUTE FUNCTION require_customer_issuance_mode('currency');
CREATE TRIGGER require_customer_money_grant_mode BEFORE INSERT ON customer_balance_grants
    FOR EACH ROW EXECUTE FUNCTION require_customer_issuance_mode('currency');
CREATE TRIGGER require_customer_money_funding_mode BEFORE INSERT ON customer_balance_entries
    FOR EACH ROW WHEN (NEW.kind IN ('funding','adjustment'))
    EXECUTE FUNCTION require_customer_issuance_mode('currency');
