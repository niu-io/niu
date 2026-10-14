-- Source allocation for future balance debits/refunds only. No historical
-- backfill: an absent allocation or unclassified old adjustment is unknown.
-- Non-gift consumption can be prepaid cash or credit-backed receivable; it is
-- not proof of a cash receipt. Gifts reduce consumed revenue, never offset it
-- with a promotional expense. Grant issuance itself recognizes neither.
CREATE TABLE customer_balance_consumption_allocations (
    entry_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('charge', 'refund')),
    nominal_nanos BIGINT NOT NULL CHECK (nominal_nanos > 0),
    -- Always track the explicitly issued gift subset, even if total historical
    -- funding provenance is unknown. Otherwise the same gift could be reused.
    explicit_gift_nanos BIGINT NOT NULL CHECK (explicit_gift_nanos >= 0),
    gift_nanos BIGINT,
    nongift_nanos BIGINT,
    source_coverage TEXT NOT NULL CHECK (source_coverage IN ('known', 'legacy_unknown')),
    source_charge_entry_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, account_id, currency, entry_id),
    FOREIGN KEY (organization_id, account_id, currency, entry_id)
        REFERENCES customer_balance_entries(organization_id, account_id, currency, id),
    FOREIGN KEY (organization_id, account_id, currency, source_charge_entry_id)
        REFERENCES customer_balance_entries(organization_id, account_id, currency, id),
    CHECK (explicit_gift_nanos <= nominal_nanos),
    CHECK ((source_coverage = 'known' AND gift_nanos IS NOT NULL AND nongift_nanos IS NOT NULL
            AND gift_nanos >= 0 AND nongift_nanos >= 0
            AND gift_nanos = explicit_gift_nanos
            AND gift_nanos::numeric + nongift_nanos::numeric = nominal_nanos)
        OR (source_coverage = 'legacy_unknown' AND gift_nanos IS NULL AND nongift_nanos IS NULL)),
    CHECK ((kind = 'charge' AND source_charge_entry_id IS NULL)
        OR (kind = 'refund' AND source_charge_entry_id IS NOT NULL))
);
CREATE INDEX customer_balance_consumption_account
    ON customer_balance_consumption_allocations(account_id, created_at, entry_id);
CREATE INDEX customer_balance_consumption_refunds
    ON customer_balance_consumption_allocations(source_charge_entry_id)
    WHERE kind = 'refund';

CREATE FUNCTION validate_customer_balance_consumption_allocation() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM customer_balance_entries e
        WHERE e.id = NEW.entry_id AND e.organization_id = NEW.organization_id
          AND e.account_id = NEW.account_id AND e.currency = NEW.currency
          AND e.kind = NEW.kind
          AND e.amount_nanos::numeric = CASE WHEN NEW.kind = 'charge'
              THEN -NEW.nominal_nanos::numeric ELSE NEW.nominal_nanos::numeric END
          AND e.reverses_entry_id IS NOT DISTINCT FROM NEW.source_charge_entry_id
    ) THEN
        RAISE EXCEPTION 'consumption allocation requires an exact scoped balance entry'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.kind = 'refund' AND NOT EXISTS (
        SELECT 1 FROM customer_balance_entries e
        WHERE e.id = NEW.source_charge_entry_id AND e.organization_id = NEW.organization_id
          AND e.account_id = NEW.account_id AND e.currency = NEW.currency AND e.kind = 'charge'
    ) THEN
        RAISE EXCEPTION 'refund allocation requires its original scoped charge'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_balance_consumption_allocation
    BEFORE INSERT ON customer_balance_consumption_allocations
    FOR EACH ROW EXECUTE FUNCTION validate_customer_balance_consumption_allocation();
CREATE TRIGGER immutable_customer_balance_consumption_allocation
    BEFORE UPDATE OR DELETE ON customer_balance_consumption_allocations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION allocate_customer_balance_consumption() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    nominal BIGINT;
    explicit_gift BIGINT := 0;
    pool NUMERIC;
    refunded_nominal NUMERIC;
    refunded_gift NUMERIC;
    original_amount NUMERIC;
    original customer_balance_consumption_allocations%ROWTYPE;
    coverage TEXT := 'known';
BEGIN
    IF NEW.kind NOT IN ('charge', 'refund') THEN RETURN NEW; END IF;
    -- This lock serializes gift issuance, debits and refunds for this exact
    -- account. Never upgrade admission's FK-compatible non-key-changing lock.
    PERFORM id FROM customer_balance_accounts
        WHERE id = NEW.account_id AND organization_id = NEW.organization_id
          AND currency = NEW.currency FOR NO KEY UPDATE;
    nominal := abs(NEW.amount_nanos::numeric)::bigint;
    IF NEW.kind = 'charge' THEN
        SELECT COALESCE((SELECT sum(g.amount_nanos::numeric)
                    FROM customer_balance_grants g WHERE g.account_id = NEW.account_id), 0)
            - COALESCE((SELECT sum(CASE WHEN a.kind = 'charge'
                        THEN a.explicit_gift_nanos::numeric ELSE -a.explicit_gift_nanos::numeric END)
                    FROM customer_balance_consumption_allocations a
                    WHERE a.account_id = NEW.account_id), 0)
            INTO pool;
        IF pool < 0 THEN
            RAISE EXCEPTION 'explicit gift pool is inconsistent' USING ERRCODE = '23514';
        END IF;
        explicit_gift := LEAST(nominal::numeric, pool)::bigint;
        IF EXISTS (
            SELECT 1 FROM customer_balance_entries e
            WHERE e.account_id = NEW.account_id AND e.kind = 'adjustment'
              AND e.amount_nanos > 0
              AND NOT EXISTS (SELECT 1 FROM customer_balance_grants g WHERE g.entry_id = e.id)
        ) THEN coverage := 'legacy_unknown'; END IF;
    ELSE
        SELECT -e.amount_nanos::numeric INTO original_amount
            FROM customer_balance_entries e
            WHERE e.id = NEW.reverses_entry_id AND e.organization_id = NEW.organization_id
              AND e.account_id = NEW.account_id AND e.currency = NEW.currency AND e.kind = 'charge';
        SELECT COALESCE(sum(e.amount_nanos::numeric), 0) INTO refunded_nominal
            FROM customer_balance_entries e
            WHERE e.reverses_entry_id = NEW.reverses_entry_id AND e.id <> NEW.id;
        IF original_amount IS NULL OR refunded_nominal + nominal > original_amount THEN
            RAISE EXCEPTION 'refund exceeds original scoped consumption' USING ERRCODE = '23514';
        END IF;
        SELECT * INTO original FROM customer_balance_consumption_allocations a
            WHERE a.entry_id = NEW.reverses_entry_id;
        IF NOT FOUND THEN
            -- Legacy refunds retain their existing semantics. They cannot
            -- manufacture gift restoration from absent historical provenance.
            coverage := 'legacy_unknown';
        ELSE
            SELECT COALESCE(sum(a.explicit_gift_nanos::numeric), 0) INTO refunded_gift
                FROM customer_balance_consumption_allocations a
                WHERE a.kind = 'refund' AND a.source_charge_entry_id = NEW.reverses_entry_id;
            IF refunded_gift > original.explicit_gift_nanos THEN
                RAISE EXCEPTION 'refund gift allocation exceeds its original source'
                    USING ERRCODE = '23514';
            END IF;
            explicit_gift := LEAST(nominal::numeric,
                original.explicit_gift_nanos::numeric - refunded_gift)::bigint;
            coverage := original.source_coverage;
        END IF;
    END IF;
    INSERT INTO customer_balance_consumption_allocations
        (entry_id, organization_id, account_id, currency, kind, nominal_nanos,
         explicit_gift_nanos, gift_nanos, nongift_nanos, source_coverage, source_charge_entry_id)
    VALUES (NEW.id, NEW.organization_id, NEW.account_id, NEW.currency, NEW.kind, nominal,
        explicit_gift, CASE WHEN coverage = 'known' THEN explicit_gift ELSE NULL END,
        CASE WHEN coverage = 'known' THEN nominal - explicit_gift ELSE NULL END,
        coverage, CASE WHEN NEW.kind = 'refund' THEN NEW.reverses_entry_id ELSE NULL END);
    RETURN NEW;
END;
$$;
CREATE TRIGGER allocate_customer_balance_consumption
    AFTER INSERT ON customer_balance_entries
    FOR EACH ROW EXECUTE FUNCTION allocate_customer_balance_consumption();
