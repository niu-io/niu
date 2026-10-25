-- Exact Credits purchase reversals and original-range backing conservation (#110).
-- Reversals remove only unoccupied ranges of the original purchase lot and
-- require processor minor-unit precision without discarding residual atoms.

CREATE FUNCTION niu_credit_range_backing(
    lot_atoms BIGINT,
    backing_nanos BIGINT,
    start_atom BIGINT,
    end_atom BIGINT
) RETURNS BIGINT LANGUAGE sql IMMUTABLE STRICT AS $$
    SELECT CASE
        WHEN lot_atoms <= 0 OR backing_nanos < 0 OR start_atom < 0 OR end_atom < start_atom OR end_atom > lot_atoms
        THEN NULL
        ELSE (div(backing_nanos::numeric * end_atom::numeric, lot_atoms::numeric)
            - div(backing_nanos::numeric * start_atom::numeric, lot_atoms::numeric))::bigint
    END
$$;

CREATE TABLE customer_unit_purchase_reversals (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES customer_unit_accounts(organization_id),
    order_id UUID NOT NULL REFERENCES customer_unit_topups(order_id),
    lot_id UUID NOT NULL,
    definition_revision BIGINT NOT NULL REFERENCES customer_unit_definitions(revision),
    provenance TEXT NOT NULL CHECK (provenance IN ('purchased', 'simulated')),
    payment_currency TEXT NOT NULL CHECK (payment_currency ~ '^[A-Z]{3}$'),
    credit_atoms BIGINT NOT NULL CHECK (credit_atoms > 0),
    refund_payment_nanos BIGINT NOT NULL CHECK (
        refund_payment_nanos > 0
        AND refund_payment_nanos % 10000000 = 0
    ),
    refund_backing_nanos BIGINT NOT NULL CHECK (
        (provenance = 'purchased' AND refund_backing_nanos = refund_payment_nanos)
        OR (provenance = 'simulated' AND refund_backing_nanos = 0)
    ),
    reason TEXT NOT NULL CHECK (
        char_length(reason) BETWEEN 1 AND 500
        AND reason = btrim(reason)
        AND reason !~ '[[:cntrl:]]'
    ),
    idempotency_key UUID NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (order_id, idempotency_key),
    UNIQUE (organization_id, id, lot_id),
    FOREIGN KEY (organization_id, lot_id) REFERENCES customer_unit_lots(organization_id, id),
    CHECK ((actor_kind = 'operator') = (actor_operator_id IS NOT NULL))
);
CREATE INDEX customer_unit_purchase_reversals_lot
    ON customer_unit_purchase_reversals(lot_id, created_at, id);
CREATE INDEX customer_unit_purchase_reversals_currency_created
    ON customer_unit_purchase_reversals(payment_currency, created_at)
    WHERE provenance = 'purchased';
CREATE TRIGGER immutable_customer_unit_purchase_reversal
    BEFORE UPDATE OR DELETE ON customer_unit_purchase_reversals
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE TABLE customer_unit_purchase_reversal_ranges (
    reversal_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    ordinal BIGINT NOT NULL CHECK (ordinal >= 0),
    lot_id UUID NOT NULL,
    first_atom BIGINT NOT NULL CHECK (first_atom >= 0),
    end_atom BIGINT NOT NULL CHECK (end_atom > first_atom),
    payment_nanos BIGINT NOT NULL CHECK (payment_nanos >= 0),
    backing_nanos BIGINT NOT NULL CHECK (backing_nanos >= 0),
    PRIMARY KEY (reversal_id, ordinal),
    FOREIGN KEY (organization_id, reversal_id, lot_id)
        REFERENCES customer_unit_purchase_reversals(organization_id, id, lot_id),
    FOREIGN KEY (organization_id, lot_id)
        REFERENCES customer_unit_lots(organization_id, id)
);
CREATE INDEX customer_unit_purchase_reversal_ranges_lot
    ON customer_unit_purchase_reversal_ranges(lot_id);
CREATE TRIGGER immutable_customer_unit_purchase_reversal_range
    BEFORE UPDATE OR DELETE ON customer_unit_purchase_reversal_ranges
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE OR REPLACE VIEW customer_unit_occupied_ranges AS
SELECT r.organization_id, r.attempt_id, r.lot_id, int8range(r.first_atom, r.end_atom, '[)') AS atoms
FROM customer_unit_reserved_ranges r
WHERE NOT EXISTS (SELECT 1 FROM customer_unit_resolutions c WHERE c.attempt_id = r.attempt_id)
UNION ALL
SELECT c.organization_id, c.attempt_id, c.lot_id, remaining.atoms
FROM customer_unit_consumed_ranges c
CROSS JOIN LATERAL unnest(
    int8multirange(int8range(c.first_atom, c.end_atom, '[)')) - COALESCE((
        SELECT range_agg(int8range(
            c.first_atom + GREATEST(0, r.first_atom - c.charge_offset),
            c.first_atom + LEAST(c.end_atom - c.first_atom, r.end_atom - c.charge_offset),
            '[)'
        ))
        FROM customer_unit_restorations r
        WHERE r.attempt_id = c.attempt_id
          AND r.first_atom < c.charge_offset + (c.end_atom - c.first_atom)
          AND r.end_atom > c.charge_offset
    ), '{}'::int8multirange)
) AS remaining(atoms)
UNION ALL
SELECT p.organization_id, NULL::uuid AS attempt_id, p.lot_id, int8range(p.first_atom, p.end_atom, '[)') AS atoms
FROM customer_unit_purchase_reversal_ranges p;

CREATE FUNCTION validate_customer_unit_purchase_reversal() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    lot customer_unit_lots;
BEGIN
    PERFORM organization_id FROM customer_unit_accounts
        WHERE organization_id = NEW.organization_id FOR NO KEY UPDATE;
    SELECT * INTO STRICT lot FROM customer_unit_lots
        WHERE organization_id = NEW.organization_id AND id = NEW.lot_id;
    IF lot.order_id IS NULL
       OR lot.order_id <> NEW.order_id
       OR lot.definition_revision <> NEW.definition_revision
       OR lot.provenance <> NEW.provenance
       OR lot.payment_currency IS DISTINCT FROM NEW.payment_currency
       OR NEW.credit_atoms > lot.credit_atoms
       OR NEW.refund_payment_nanos > lot.payment_nanos
       OR NEW.refund_backing_nanos > lot.backing_nanos THEN
        RAISE EXCEPTION 'Credits purchase reversal must match the original purchase lot and provenance'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_purchase_reversal
    BEFORE INSERT ON customer_unit_purchase_reversals
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_purchase_reversal();

CREATE FUNCTION validate_customer_unit_purchase_reversal_range() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    lot customer_unit_lots;
    previous_end BIGINT;
BEGIN
    PERFORM organization_id FROM customer_unit_accounts
        WHERE organization_id = NEW.organization_id FOR NO KEY UPDATE;
    SELECT * INTO STRICT lot FROM customer_unit_lots
        WHERE organization_id = NEW.organization_id AND id = NEW.lot_id;
    IF NEW.end_atom > lot.credit_atoms
       OR NEW.payment_nanos IS DISTINCT FROM niu_credit_range_backing(
            lot.credit_atoms, lot.payment_nanos, NEW.first_atom, NEW.end_atom
       )
       OR NEW.backing_nanos IS DISTINCT FROM niu_credit_range_backing(
            lot.credit_atoms, lot.backing_nanos, NEW.first_atom, NEW.end_atom
       )
       OR EXISTS (
            SELECT 1 FROM customer_unit_occupied_ranges o
            WHERE o.lot_id = NEW.lot_id
              AND o.atoms && int8range(NEW.first_atom, NEW.end_atom, '[)')
       ) THEN
        RAISE EXCEPTION 'Credits purchase reversal range is occupied, out of bounds or has inexact backing'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.ordinal > 0 THEN
        SELECT end_atom INTO previous_end
        FROM customer_unit_purchase_reversal_ranges
        WHERE reversal_id = NEW.reversal_id AND ordinal = NEW.ordinal - 1;
        IF previous_end IS NULL OR previous_end > NEW.first_atom THEN
            RAISE EXCEPTION 'Credits purchase reversal ranges must be ordered and disjoint'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_purchase_reversal_range
    BEFORE INSERT ON customer_unit_purchase_reversal_ranges
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_purchase_reversal_range();

CREATE FUNCTION validate_customer_unit_purchase_reversal_total() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    rev_id UUID;
    rev customer_unit_purchase_reversals;
    lot customer_unit_lots;
    last_range customer_unit_purchase_reversal_ranges;
BEGIN
    IF TG_TABLE_NAME = 'customer_unit_purchase_reversals' THEN
        rev_id := NEW.id;
    ELSE
        rev_id := NEW.reversal_id;
    END IF;
    SELECT * INTO STRICT rev FROM customer_unit_purchase_reversals WHERE id = rev_id;
    SELECT * INTO STRICT lot FROM customer_unit_lots WHERE id = rev.lot_id;
    IF (
        SELECT ROW(
            COALESCE(SUM(end_atom - first_atom), 0)::bigint,
            COALESCE(SUM(payment_nanos), 0)::bigint,
            COALESCE(SUM(backing_nanos), 0)::bigint
        )
        FROM customer_unit_purchase_reversal_ranges
        WHERE reversal_id = rev_id
    ) IS DISTINCT FROM ROW(rev.credit_atoms, rev.refund_payment_nanos, rev.refund_backing_nanos) THEN
        RAISE EXCEPTION 'Credits purchase reversal must equal the sum of its disjoint ranges'
            USING ERRCODE = '23514';
    END IF;
    SELECT * INTO STRICT last_range
    FROM customer_unit_purchase_reversal_ranges
    WHERE reversal_id = rev_id
    ORDER BY ordinal DESC
    LIMIT 1;
    IF niu_credit_range_backing(
        lot.credit_atoms,
        lot.payment_nanos,
        last_range.first_atom,
        last_range.end_atom - 1
    ) >= last_range.payment_nanos THEN
        RAISE EXCEPTION 'Credits purchase reversal cannot discard trailing residual atoms without payment value'
            USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER customer_unit_purchase_reversal_total
    AFTER INSERT ON customer_unit_purchase_reversals
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_purchase_reversal_total();
CREATE CONSTRAINT TRIGGER customer_unit_purchase_reversal_range_total
    AFTER INSERT ON customer_unit_purchase_reversal_ranges
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_purchase_reversal_total();

CREATE OR REPLACE FUNCTION niu_customer_unit_mode_preview(TEXT) RETURNS JSONB LANGUAGE SQL VOLATILE AS $preview$
WITH configuration AS MATERIALIZED (
    SELECT c.*, (SELECT max(revision) FROM customer_unit_definitions) AS definition_revision,
        (SELECT currency FROM platform_currency WHERE singleton) AS payment_currency
    FROM customer_unit_configuration c WHERE singleton
), consumed AS (
    SELECT lot_id, sum(end_atom - first_atom) AS atoms
    FROM customer_unit_consumed_ranges GROUP BY lot_id
), restored AS (
    SELECT c.lot_id, sum(LEAST(r.end_atom, c.charge_offset + c.end_atom - c.first_atom)
        - GREATEST(r.first_atom, c.charge_offset)) AS atoms
    FROM customer_unit_consumed_ranges c JOIN customer_unit_restorations r
        ON r.attempt_id = c.attempt_id AND r.first_atom < c.charge_offset + c.end_atom - c.first_atom
        AND r.end_atom > c.charge_offset GROUP BY c.lot_id
), reversed AS (
    SELECT lot_id, sum(end_atom - first_atom) AS atoms
    FROM customer_unit_purchase_reversal_ranges GROUP BY lot_id
), facts(category, organization_id) AS MATERIALIZED (
    SELECT 'monetary_balance', organization_id FROM customer_balance_accounts WHERE posted_balance_nanos <> 0
    UNION ALL SELECT 'monetary_credit_facility', organization_id FROM customer_balance_accounts WHERE credit_limit_nanos > 0
    UNION ALL SELECT 'monetary_reservation', organization_id FROM customer_balance_reservations WHERE released_at IS NULL
    UNION ALL SELECT 'unposted_monetary_charge', c.organization_id FROM (
        SELECT attempt_id, organization_id, amount_nanos FROM customer_charges
        UNION ALL SELECT attempt_id, organization_id, amount_nanos FROM customer_media_charges
    ) c WHERE c.amount_nanos > 0 AND NOT EXISTS (
        SELECT 1 FROM customer_balance_entries e WHERE e.attempt_id = c.attempt_id AND e.kind = 'charge')
    UNION ALL SELECT 'pending_checkout', o.organization_id FROM customer_topup_orders o
        WHERE NOT EXISTS(SELECT 1 FROM customer_topup_settlements s WHERE s.order_id = o.id)
          AND NOT EXISTS(SELECT 1 FROM customer_topup_closures c WHERE c.order_id = o.id)
    UNION ALL SELECT 'unapplied_monetary_grant', p.organization_id FROM prepared_customer_balance_grants p
        WHERE NOT EXISTS(SELECT 1 FROM customer_balance_grants g
            WHERE g.organization_id = p.organization_id AND g.idempotency_key = p.idempotency_key)
    UNION ALL SELECT 'remaining_credits', l.organization_id FROM customer_unit_lots l
        LEFT JOIN consumed c ON c.lot_id = l.id
        LEFT JOIN restored r ON r.lot_id = l.id
        LEFT JOIN reversed rev ON rev.lot_id = l.id
        WHERE (l.expires_at IS NULL OR l.expires_at > statement_timestamp())
          AND l.credit_atoms - COALESCE(rev.atoms, 0) - COALESCE(c.atoms, 0) + COALESCE(r.atoms, 0) > 0
    UNION ALL SELECT 'credits_reservation', r.organization_id FROM customer_unit_reservations r
        WHERE NOT EXISTS(SELECT 1 FROM customer_unit_resolutions s WHERE s.attempt_id = r.attempt_id)
    UNION ALL SELECT 'unresolved_credits_charge', r.organization_id FROM customer_unit_text_charges c
        JOIN customer_unit_reservations r USING(attempt_id)
        WHERE NOT EXISTS(SELECT 1 FROM customer_unit_resolutions s WHERE s.attempt_id = c.attempt_id)
    UNION ALL SELECT 'unsettled_customer_request', a.organization_id FROM attempts a
        WHERE (EXISTS(SELECT 1 FROM customer_attempt_tariffs t WHERE t.attempt_id = a.id)
            OR EXISTS(SELECT 1 FROM customer_media_attempt_pricing t WHERE t.attempt_id = a.id)
            OR EXISTS(SELECT 1 FROM customer_unit_attempt_tariffs t WHERE t.attempt_id = a.id))
          AND (a.execution = 'may_have_executed' OR (a.execution = 'confirmed_completed'
            AND NOT EXISTS(SELECT 1 FROM customer_charges c WHERE c.attempt_id = a.id)
            AND NOT EXISTS(SELECT 1 FROM customer_media_charges c WHERE c.attempt_id = a.id)
            AND NOT EXISTS(SELECT 1 FROM customer_unit_resolutions c WHERE c.attempt_id = a.id AND c.kind = 'charge')))
    UNION ALL SELECT 'missing_unit_definition', NULL::uuid FROM configuration
        WHERE $1 = 'credits' AND definition_revision IS NULL
    UNION ALL SELECT 'missing_payment_currency', NULL::uuid FROM configuration
        WHERE $1 = 'credits' AND payment_currency IS NULL
    UNION ALL SELECT 'missing_purchase_rule', NULL::uuid FROM configuration c
        WHERE $1 = 'credits' AND c.payment_currency IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customer_unit_purchase_rules r
            WHERE r.definition_revision = c.definition_revision AND r.payment_currency = c.payment_currency)
), categories AS (
    SELECT category, count(*) AS records, count(DISTINCT organization_id) AS organizations
    FROM facts GROUP BY category
), accounts AS (
    SELECT f.category, f.organization_id, o.name, count(*) AS records,
        row_number() OVER(PARTITION BY f.category ORDER BY o.name, f.organization_id) AS ordinal
    FROM facts f JOIN organizations o ON o.id = f.organization_id
    GROUP BY f.category, f.organization_id, o.name
)
SELECT jsonb_build_object(
    'revision', c.revision::text, 'billing_mode', c.billing_mode, 'target_mode', $1::text,
    'change_required', c.billing_mode <> $1, 'blockers_empty', NOT EXISTS(SELECT 1 FROM facts),
    'observed_at', to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'blockers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'category', g.category, 'record_count', g.records::text, 'organization_count', g.organizations::text,
        'accounts_truncated', g.organizations > 100,
        'accounts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'organization_id', a.organization_id, 'name', a.name, 'record_count', a.records::text
        ) ORDER BY a.ordinal) FROM accounts a WHERE a.category = g.category AND a.ordinal <= 100), '[]'::jsonb)
    ) ORDER BY g.category) FROM categories g), '[]'::jsonb),
    'preserved_configuration', jsonb_build_object(
        'monetary_workspace_limits', (SELECT count(*)::text FROM customer_workspace_spending_limits),
        'monetary_key_limits', (SELECT count(*)::text FROM customer_key_spending_limits WHERE limit_nanos IS NOT NULL),
        'monetary_text_tariffs', (SELECT count(*)::text FROM customer_tariffs WHERE current_revision IS NOT NULL),
        'monetary_retail_prices', (SELECT count(*)::text FROM platform_retail_price_heads WHERE current_revision IS NOT NULL),
        'monetary_media_rate_history', (SELECT count(*)::text FROM customer_media_rate_cards),
        'credits_text_tariffs', (SELECT count(DISTINCT model_alias)::text FROM customer_unit_text_tariffs)
    )
) FROM configuration c
$preview$;

CREATE OR REPLACE FUNCTION niu_lock_customer_unit_mode_change() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    LOCK TABLE attempts, customer_balance_accounts, customer_balance_entries,
        customer_balance_reservations, customer_charges, customer_media_charges,
        customer_topup_orders, customer_topup_settlements, customer_topup_closures,
        prepared_customer_balance_grants, customer_balance_grants,
        customer_unit_lots, customer_unit_purchase_reversals, customer_unit_purchase_reversal_ranges,
        customer_unit_reservations, customer_unit_reserved_ranges,
        customer_unit_resolutions, customer_unit_restorations, customer_unit_text_charges,
        customer_attempt_tariffs, customer_media_attempt_pricing, customer_unit_attempt_tariffs
        IN SHARE MODE NOWAIT;
END;
$$;
