-- Forward cash/credit provenance only. No historical debit is guessed or
-- backfilled; non-gift consumption is not automatically a verified cash sale.
CREATE TABLE customer_credit_sources (
    entry_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('charge','refund')),
    nominal_nanos BIGINT NOT NULL CHECK (nominal_nanos>0),
    nongift_nanos BIGINT CHECK (nongift_nanos>=0 AND nongift_nanos<=nominal_nanos),
    cash_nanos BIGINT,
    credit_nanos BIGINT,
    source_coverage TEXT NOT NULL CHECK (source_coverage IN ('known','legacy_unknown')),
    source_charge_entry_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id,account_id,currency,entry_id),
    FOREIGN KEY(organization_id,account_id,currency,entry_id)
        REFERENCES customer_balance_entries(organization_id,account_id,currency,id),
    FOREIGN KEY(organization_id,account_id,currency,source_charge_entry_id)
        REFERENCES customer_balance_entries(organization_id,account_id,currency,id),
    CHECK ((kind='charge' AND source_charge_entry_id IS NULL)
        OR (kind='refund' AND source_charge_entry_id IS NOT NULL)),
    CHECK ((source_coverage='known' AND nongift_nanos IS NOT NULL
        AND cash_nanos IS NOT NULL AND credit_nanos IS NOT NULL
        AND cash_nanos>=0 AND credit_nanos>=0
        AND cash_nanos::numeric+credit_nanos::numeric=nongift_nanos)
        OR (source_coverage='legacy_unknown' AND cash_nanos IS NULL AND credit_nanos IS NULL))
);
CREATE INDEX customer_credit_sources_account ON customer_credit_sources(account_id,created_at,entry_id);
CREATE INDEX customer_credit_sources_refunds ON customer_credit_sources(source_charge_entry_id) WHERE kind='refund';
CREATE TABLE customer_credit_repayments (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    funding_entry_id UUID NOT NULL REFERENCES customer_funding_receipts(entry_id),
    charge_entry_id UUID NOT NULL,
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(funding_entry_id,charge_entry_id),
    FOREIGN KEY(organization_id,account_id,currency,funding_entry_id)
        REFERENCES customer_balance_entries(organization_id,account_id,currency,id),
    FOREIGN KEY(organization_id,account_id,currency,charge_entry_id)
        REFERENCES customer_credit_sources(organization_id,account_id,currency,entry_id)
);
CREATE INDEX customer_credit_repayments_account ON customer_credit_repayments(account_id,created_at,id);
CREATE INDEX customer_credit_repayments_charge ON customer_credit_repayments(charge_entry_id);

-- VOLATILE deliberately observes preceding trigger writes in the same owned
-- transaction. Account serialization, not an old statement snapshot, is the
-- authority for pool availability. Missing history always withholds coverage.
CREATE FUNCTION niu_customer_credit_account_covered(account UUID,ignore_entry UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE SQL VOLATILE AS $$
SELECT EXISTS(SELECT 1 FROM customer_balance_accounts a WHERE a.id=account)
AND NOT EXISTS (
    SELECT 1 FROM customer_balance_entries e
    WHERE e.account_id=account AND e.id IS DISTINCT FROM ignore_entry AND (
        e.kind='funding_reversal'
        OR (e.kind IN ('charge','refund') AND NOT EXISTS (
            SELECT 1 FROM customer_credit_sources s WHERE s.entry_id=e.id AND s.source_coverage='known'))
        OR (e.kind='funding' AND NOT EXISTS (
            SELECT 1 FROM customer_funding_receipts r
            WHERE r.entry_id=e.id AND r.organization_id=e.organization_id AND r.account_id=e.account_id
              AND r.currency=e.currency AND r.amount_nanos=e.amount_nanos AND e.amount_nanos>0))
        OR (e.kind='adjustment' AND NOT EXISTS (
            SELECT 1 FROM customer_balance_grants g
            WHERE g.entry_id=e.id AND g.organization_id=e.organization_id AND g.account_id=e.account_id
              AND g.currency=e.currency AND g.amount_nanos=e.amount_nanos AND e.amount_nanos>0))
    )
)
AND NOT EXISTS (
    SELECT 1 FROM customer_funding_receipts r
    LEFT JOIN customer_balance_entries e ON e.id=r.entry_id
    WHERE r.account_id=account AND (e.id IS NULL OR e.kind<>'funding'
        OR e.organization_id<>r.organization_id OR e.account_id<>r.account_id
        OR e.currency<>r.currency OR e.amount_nanos<>r.amount_nanos)
);
$$;

CREATE FUNCTION validate_customer_credit_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source customer_balance_consumption_allocations%ROWTYPE;
    original customer_credit_sources%ROWTYPE;
    pool NUMERIC; owed NUMERIC; paid NUMERIC; repayment NUMERIC;
    refunded_cash NUMERIC; refunded_credit NUMERIC;
    expected_cash BIGINT; expected_credit BIGINT; expected_coverage TEXT:='legacy_unknown';
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id
        AND organization_id=NEW.organization_id AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT a.* INTO STRICT source FROM customer_balance_consumption_allocations a
        JOIN customer_balance_entries e ON e.id=a.entry_id
        WHERE a.entry_id=NEW.entry_id AND a.organization_id=NEW.organization_id
          AND a.account_id=NEW.account_id AND a.currency=NEW.currency AND a.kind=NEW.kind
          AND a.nominal_nanos=NEW.nominal_nanos AND e.kind=NEW.kind
          AND e.amount_nanos::numeric=CASE WHEN NEW.kind='charge' THEN -NEW.nominal_nanos::numeric ELSE NEW.nominal_nanos::numeric END
          AND e.reverses_entry_id IS NOT DISTINCT FROM NEW.source_charge_entry_id;
    IF source.nongift_nanos IS DISTINCT FROM NEW.nongift_nanos
        OR (NEW.source_coverage='known' AND source.source_coverage<>'known') THEN
        RAISE EXCEPTION 'Credit source must match exact consumption provenance' USING ERRCODE='23514';
    END IF;
    IF NEW.kind='refund' AND NOT EXISTS(SELECT 1 FROM customer_balance_entries e
        WHERE e.id=NEW.source_charge_entry_id AND e.organization_id=NEW.organization_id
          AND e.account_id=NEW.account_id AND e.currency=NEW.currency AND e.kind='charge') THEN
        RAISE EXCEPTION 'Credit refund must reference its original scoped charge' USING ERRCODE='23514';
    END IF;
    -- Check the deterministic split independently at the table boundary. A
    -- caller cannot forge covered cash/credit proportions with a direct insert.
    IF source.source_coverage='known' AND niu_customer_credit_account_covered(NEW.account_id,NEW.entry_id) THEN
        IF NEW.kind='charge' THEN
            SELECT COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_funding_receipts r
                        WHERE r.account_id=NEW.account_id),0)
                -COALESCE((SELECT sum(s.cash_nanos::numeric) FROM customer_credit_sources s
                        WHERE s.account_id=NEW.account_id AND s.kind='charge'),0)
                +COALESCE((SELECT sum(s.cash_nanos::numeric) FROM customer_credit_sources s
                        WHERE s.account_id=NEW.account_id AND s.kind='refund'),0)
                -COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_credit_repayments r
                        WHERE r.account_id=NEW.account_id),0) INTO pool;
            IF pool<0 THEN RAISE EXCEPTION 'Verified prepaid cash pool is inconsistent' USING ERRCODE='23514'; END IF;
            expected_cash:=LEAST(pool,source.nongift_nanos::numeric)::bigint;
            expected_credit:=source.nongift_nanos-expected_cash; expected_coverage:='known';
        ELSE
            SELECT * INTO original FROM customer_credit_sources WHERE entry_id=NEW.source_charge_entry_id;
            IF FOUND AND original.source_coverage='known' THEN
                SELECT COALESCE(sum(s.cash_nanos::numeric),0),COALESCE(sum(s.credit_nanos::numeric),0)
                    INTO refunded_cash,refunded_credit FROM customer_credit_sources s
                    WHERE s.kind='refund' AND s.source_charge_entry_id=original.entry_id;
                SELECT COALESCE(sum(r.amount_nanos::numeric),0) INTO repayment
                    FROM customer_credit_repayments r WHERE r.charge_entry_id=original.entry_id;
                owed:=original.credit_nanos::numeric-refunded_credit-repayment;
                paid:=original.cash_nanos::numeric+repayment-refunded_cash;
                IF owed<0 OR paid<0 OR source.nongift_nanos::numeric>owed+paid THEN
                    RAISE EXCEPTION 'Credit refund exceeds original unpaid or paid sources' USING ERRCODE='23514';
                END IF;
                expected_credit:=LEAST(owed,source.nongift_nanos::numeric)::bigint;
                expected_cash:=source.nongift_nanos-expected_credit; expected_coverage:='known';
            END IF;
        END IF;
    END IF;
    IF NEW.source_coverage<>expected_coverage OR NEW.cash_nanos IS DISTINCT FROM expected_cash
        OR NEW.credit_nanos IS DISTINCT FROM expected_credit THEN
        RAISE EXCEPTION 'Credit source differs from the deterministic available cash or refund split' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_credit_source BEFORE INSERT ON customer_credit_sources
    FOR EACH ROW EXECUTE FUNCTION validate_customer_credit_source();
CREATE TRIGGER immutable_customer_credit_source BEFORE UPDATE OR DELETE ON customer_credit_sources
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION validate_customer_credit_repayment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE receipt_amount NUMERIC; capacity NUMERIC; committed NUMERIC; available_cash NUMERIC;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id
        AND organization_id=NEW.organization_id AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT r.amount_nanos::numeric INTO STRICT receipt_amount FROM customer_funding_receipts r
        JOIN customer_balance_entries e ON e.id=r.entry_id
        WHERE r.entry_id=NEW.funding_entry_id AND r.organization_id=NEW.organization_id
          AND r.account_id=NEW.account_id AND r.currency=NEW.currency AND e.kind='funding'
          AND e.amount_nanos=r.amount_nanos;
    SELECT COALESCE(sum(amount_nanos::numeric),0) INTO committed FROM customer_credit_repayments
        WHERE funding_entry_id=NEW.funding_entry_id;
    SELECT COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_funding_receipts r
                WHERE r.account_id=NEW.account_id),0)
        -COALESCE((SELECT sum(s.cash_nanos::numeric) FROM customer_credit_sources s
                WHERE s.account_id=NEW.account_id AND s.kind='charge'),0)
        +COALESCE((SELECT sum(s.cash_nanos::numeric) FROM customer_credit_sources s
                WHERE s.account_id=NEW.account_id AND s.kind='refund'),0)
        -COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_credit_repayments r
                WHERE r.account_id=NEW.account_id),0) INTO available_cash;
    SELECT s.credit_nanos::numeric
        -COALESCE((SELECT sum(r.credit_nanos::numeric) FROM customer_credit_sources r
            WHERE r.kind='refund' AND r.source_charge_entry_id=s.entry_id),0)
        -COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_credit_repayments r
            WHERE r.charge_entry_id=s.entry_id),0)
        INTO STRICT capacity FROM customer_credit_sources s
        WHERE s.entry_id=NEW.charge_entry_id AND s.organization_id=NEW.organization_id
          AND s.account_id=NEW.account_id AND s.currency=NEW.currency
          AND s.kind='charge' AND s.source_coverage='known';
    IF NOT niu_customer_credit_account_covered(NEW.account_id)
        OR committed+NEW.amount_nanos>receipt_amount OR capacity<NEW.amount_nanos
        OR available_cash<NEW.amount_nanos THEN
        RAISE EXCEPTION 'Credit repayment requires exact available cash and unpaid credit' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_credit_repayment BEFORE INSERT ON customer_credit_repayments
    FOR EACH ROW EXECUTE FUNCTION validate_customer_credit_repayment();
CREATE TRIGGER immutable_customer_credit_repayment BEFORE UPDATE OR DELETE ON customer_credit_repayments
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION allocate_customer_credit_sources() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocation customer_balance_consumption_allocations%ROWTYPE;
    original customer_credit_sources%ROWTYPE; pool NUMERIC; owed NUMERIC; paid NUMERIC;
    refunded_cash NUMERIC; refunded_credit NUMERIC; repayment NUMERIC;
    cash BIGINT; credit BIGINT; coverage TEXT:='legacy_unknown';
BEGIN
    IF NEW.kind NOT IN ('charge','refund') THEN RETURN NEW; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id
        AND organization_id=NEW.organization_id AND currency=NEW.currency FOR NO KEY UPDATE;
    -- Trigger name sorts after allocate_customer_balance_consumption, so gift
    -- consumption has already been recorded in this same transaction.
    SELECT * INTO STRICT allocation FROM customer_balance_consumption_allocations WHERE entry_id=NEW.id;
    IF allocation.source_coverage='known' AND niu_customer_credit_account_covered(NEW.account_id,NEW.id) THEN
        IF NEW.kind='charge' THEN
            SELECT COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_funding_receipts r
                        WHERE r.account_id=NEW.account_id),0)
                -COALESCE((SELECT sum(s.cash_nanos::numeric) FROM customer_credit_sources s
                        WHERE s.account_id=NEW.account_id AND s.kind='charge'),0)
                +COALESCE((SELECT sum(s.cash_nanos::numeric) FROM customer_credit_sources s
                        WHERE s.account_id=NEW.account_id AND s.kind='refund'),0)
                -COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_credit_repayments r
                        WHERE r.account_id=NEW.account_id),0) INTO pool;
            IF pool<0 THEN RAISE EXCEPTION 'Verified prepaid cash pool is inconsistent' USING ERRCODE='23514'; END IF;
            cash:=LEAST(pool,allocation.nongift_nanos::numeric)::bigint;
            credit:=allocation.nongift_nanos-cash; coverage:='known';
        ELSE
            SELECT * INTO original FROM customer_credit_sources WHERE entry_id=NEW.reverses_entry_id;
            IF FOUND AND original.source_coverage='known' THEN
                SELECT COALESCE(sum(s.cash_nanos::numeric),0),COALESCE(sum(s.credit_nanos::numeric),0)
                    INTO refunded_cash,refunded_credit FROM customer_credit_sources s
                    WHERE s.kind='refund' AND s.source_charge_entry_id=original.entry_id;
                SELECT COALESCE(sum(r.amount_nanos::numeric),0) INTO repayment
                    FROM customer_credit_repayments r WHERE r.charge_entry_id=original.entry_id;
                owed:=original.credit_nanos::numeric-refunded_credit-repayment;
                paid:=original.cash_nanos::numeric+repayment-refunded_cash;
                IF owed<0 OR paid<0 OR allocation.nongift_nanos::numeric>owed+paid THEN
                    RAISE EXCEPTION 'Credit refund exceeds its remaining original sources' USING ERRCODE='23514';
                END IF;
                credit:=LEAST(owed,allocation.nongift_nanos::numeric)::bigint;
                cash:=allocation.nongift_nanos-credit; coverage:='known';
            END IF;
        END IF;
    END IF;
    INSERT INTO customer_credit_sources(entry_id,organization_id,account_id,currency,kind,nominal_nanos,
        nongift_nanos,cash_nanos,credit_nanos,source_coverage,source_charge_entry_id)
    VALUES(NEW.id,NEW.organization_id,NEW.account_id,NEW.currency,NEW.kind,allocation.nominal_nanos,
        allocation.nongift_nanos,cash,credit,coverage,NEW.reverses_entry_id);
    RETURN NEW;
END;
$$;
CREATE TRIGGER allocate_customer_credit_sources AFTER INSERT ON customer_balance_entries
    FOR EACH ROW EXECUTE FUNCTION allocate_customer_credit_sources();

CREATE FUNCTION allocate_customer_credit_repayments() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE remaining BIGINT; target RECORD; amount BIGINT;
BEGIN
    -- Funding entries precede their verified receipt. Do not allocate at the
    -- balance-entry insert or manufacture a receipt merely to classify cash.
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id
        AND organization_id=NEW.organization_id AND currency=NEW.currency FOR NO KEY UPDATE;
    IF NOT EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.id=NEW.entry_id
        AND e.organization_id=NEW.organization_id AND e.account_id=NEW.account_id
        AND e.currency=NEW.currency AND e.kind='funding' AND e.amount_nanos=NEW.amount_nanos) THEN
        RAISE EXCEPTION 'Verified cash receipt must match its positive scoped funding entry' USING ERRCODE='23514';
    END IF;
    IF NOT niu_customer_credit_account_covered(NEW.account_id) THEN RETURN NEW; END IF;
    remaining:=NEW.amount_nanos;
    FOR target IN
        SELECT s.entry_id,s.credit_nanos::numeric
            -COALESCE((SELECT sum(r.credit_nanos::numeric) FROM customer_credit_sources r
                WHERE r.kind='refund' AND r.source_charge_entry_id=s.entry_id),0)
            -COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_credit_repayments r
                WHERE r.charge_entry_id=s.entry_id),0) AS owed
        FROM customer_credit_sources s JOIN customer_balance_entries e ON e.id=s.entry_id
        WHERE s.account_id=NEW.account_id AND s.kind='charge' AND s.source_coverage='known'
        ORDER BY e.created_at,e.id
    LOOP
        IF target.owed<0 THEN RAISE EXCEPTION 'Outstanding customer credit is inconsistent' USING ERRCODE='23514'; END IF;
        amount:=LEAST(remaining::numeric,target.owed)::bigint;
        IF amount>0 THEN
            INSERT INTO customer_credit_repayments(id,organization_id,account_id,currency,funding_entry_id,charge_entry_id,amount_nanos)
            VALUES(gen_random_uuid(),NEW.organization_id,NEW.account_id,NEW.currency,NEW.entry_id,target.entry_id,amount);
            remaining:=remaining-amount;
        END IF;
        EXIT WHEN remaining=0;
    END LOOP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER allocate_customer_credit_repayments AFTER INSERT ON customer_funding_receipts
    FOR EACH ROW EXECUTE FUNCTION allocate_customer_credit_repayments();
