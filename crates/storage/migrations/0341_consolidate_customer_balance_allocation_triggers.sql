-- Consolidate dual AFTER INSERT customer_balance_entries allocation triggers
-- (allocate_customer_balance_consumption and allocate_customer_credit_sources)
-- and add partial indexes for positive adjustment and reversal lookups (#27 #135).

CREATE INDEX IF NOT EXISTS customer_balance_entries_account_positive_adjustments
    ON customer_balance_entries(account_id, id)
    WHERE kind = 'adjustment' AND amount_nanos > 0;

CREATE INDEX IF NOT EXISTS customer_balance_entries_reverses_entry
    ON customer_balance_entries(reverses_entry_id, id)
    INCLUDE (amount_nanos)
    WHERE reverses_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_customer_balance_consumption_allocation() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF current_setting('niu.verified_consumption_allocation_entry', true) = NEW.entry_id::text THEN
        PERFORM set_config('niu.verified_consumption_allocation_entry', '', true);
        RETURN NEW;
    END IF;
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

CREATE OR REPLACE FUNCTION validate_customer_grant_credit_restoration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE available NUMERIC; needed NUMERIC; recorded NUMERIC; original UUID;
BEGIN
    IF current_setting('niu.verified_grant_credit_restoration_refund', true) = NEW.refund_entry_id::text THEN
        RETURN NEW;
    END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT e.reverses_entry_id INTO STRICT original FROM customer_balance_entries e
        WHERE e.id=NEW.refund_entry_id AND e.organization_id=NEW.organization_id AND e.account_id=NEW.account_id
          AND e.currency=NEW.currency AND e.kind='refund';
    SELECT a.amount_nanos::numeric-COALESCE((SELECT sum(r.amount_nanos::numeric)
        FROM customer_grant_credit_refund_restorations r WHERE r.application_id=a.id),0)
        INTO STRICT available FROM customer_grant_credit_applications a
        WHERE a.id=NEW.application_id AND a.organization_id=NEW.organization_id AND a.account_id=NEW.account_id
          AND a.currency=NEW.currency AND a.charge_entry_id=original;
    SELECT COALESCE(sum(amount_nanos::numeric),0) INTO recorded FROM customer_grant_credit_refund_restorations
        WHERE refund_entry_id=NEW.refund_entry_id;
    needed:=niu_customer_late_refund_quantity(NEW.refund_entry_id);
    IF needed IS NULL OR available<NEW.amount_nanos OR recorded+NEW.amount_nanos>needed THEN
        RAISE EXCEPTION 'Late gift restoration exceeds its exact application or refund' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_customer_credit_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected RECORD;
BEGIN
    IF current_setting('niu.verified_credit_source_entry', true) = NEW.entry_id::text THEN
        PERFORM set_config('niu.verified_credit_source_entry', '', true);
        RETURN NEW;
    END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    IF NOT EXISTS(SELECT 1 FROM customer_balance_consumption_allocations a JOIN customer_balance_entries e ON e.id=a.entry_id
        WHERE a.entry_id=NEW.entry_id AND a.organization_id=NEW.organization_id AND a.account_id=NEW.account_id
          AND a.currency=NEW.currency AND a.kind=NEW.kind AND a.nominal_nanos=NEW.nominal_nanos
          AND e.kind=NEW.kind AND e.amount_nanos::numeric=(CASE WHEN NEW.kind='charge' THEN -NEW.nominal_nanos::numeric ELSE NEW.nominal_nanos::numeric END)
          AND e.reverses_entry_id IS NOT DISTINCT FROM NEW.source_charge_entry_id) THEN
        RAISE EXCEPTION 'Credit source requires exact scoped consumption' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT expected FROM niu_customer_credit_source_split(NEW.entry_id);
    IF NEW.nongift_nanos IS DISTINCT FROM expected.nongift_nanos OR NEW.cash_nanos IS DISTINCT FROM expected.cash_nanos
        OR NEW.credit_nanos IS DISTINCT FROM expected.credit_nanos OR NEW.source_coverage<>expected.source_coverage THEN
        RAISE EXCEPTION 'Credit source differs from deterministic cash and unpaid-credit split' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS allocate_customer_credit_sources ON customer_balance_entries;

CREATE OR REPLACE FUNCTION allocate_customer_balance_consumption() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE nominal BIGINT; explicit_gift BIGINT:=0; nongift BIGINT; pool NUMERIC; refunded_nominal NUMERIC;
    original_amount NUMERIC; original customer_balance_consumption_allocations%ROWTYPE;
    original_credit customer_credit_sources%ROWTYPE;
    previous_gift NUMERIC; previous_late NUMERIC; base_remaining NUMERIC; late_remaining NUMERIC;
    late_to_restore NUMERIC:=0; target RECORD; amount BIGINT; coverage TEXT:='known';
    cash_pool NUMERIC; owed NUMERIC; paid NUMERIC; repayment NUMERIC; refunded_cash NUMERIC;
    cash_nanos BIGINT; credit_nanos BIGINT; credit_coverage TEXT:='legacy_unknown';
BEGIN
    IF NEW.kind NOT IN ('charge','refund') THEN RETURN NEW; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    nominal:=abs(NEW.amount_nanos::numeric)::bigint;
    IF NEW.kind='charge' THEN
        pool:=niu_customer_explicit_gift_pool(NEW.account_id);
        IF pool<0 THEN RAISE EXCEPTION 'Explicit gift pool is inconsistent' USING ERRCODE='23514'; END IF;
        explicit_gift:=LEAST(nominal::numeric,pool)::bigint;
        IF EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.account_id=NEW.account_id AND e.kind='adjustment'
            AND e.amount_nanos>0 AND NOT EXISTS(SELECT 1 FROM customer_balance_grants g WHERE g.entry_id=e.id)) THEN
            coverage:='legacy_unknown';
        END IF;
    ELSE
        SELECT -e.amount_nanos::numeric INTO original_amount FROM customer_balance_entries e
            WHERE e.id=NEW.reverses_entry_id AND e.organization_id=NEW.organization_id AND e.account_id=NEW.account_id
              AND e.currency=NEW.currency AND e.kind='charge';
        SELECT COALESCE(sum(e.amount_nanos::numeric),0) INTO refunded_nominal FROM customer_balance_entries e
            WHERE e.reverses_entry_id=NEW.reverses_entry_id AND e.id<>NEW.id;
        IF original_amount IS NULL OR refunded_nominal+nominal>original_amount THEN
            RAISE EXCEPTION 'Refund exceeds original scoped consumption' USING ERRCODE='23514';
        END IF;
        SELECT * INTO original FROM customer_balance_consumption_allocations WHERE entry_id=NEW.reverses_entry_id;
        IF NOT FOUND THEN coverage:='legacy_unknown';
        ELSE
            SELECT COALESCE(sum(a.explicit_gift_nanos::numeric),0) INTO previous_gift
                FROM customer_balance_consumption_allocations a WHERE a.kind='refund' AND a.source_charge_entry_id=original.entry_id;
            SELECT COALESCE(sum(r.amount_nanos::numeric),0) INTO previous_late
                FROM customer_grant_credit_refund_restorations r JOIN customer_balance_entries e ON e.id=r.refund_entry_id
                WHERE e.reverses_entry_id=original.entry_id;
            base_remaining:=original.explicit_gift_nanos::numeric-(previous_gift-previous_late);
            SELECT COALESCE(sum(a.amount_nanos::numeric),0)-previous_late INTO late_remaining
                FROM customer_grant_credit_applications a WHERE a.charge_entry_id=original.entry_id;
            IF base_remaining<0 OR late_remaining<0 THEN
                RAISE EXCEPTION 'Refund gift sources exceed original consumption or applications' USING ERRCODE='23514';
            END IF;
            explicit_gift:=LEAST(nominal::numeric,base_remaining+late_remaining)::bigint;
            late_to_restore:=GREATEST(0,explicit_gift::numeric-base_remaining);
            coverage:=original.source_coverage;
        END IF;
    END IF;
    nongift:=CASE WHEN coverage='known' THEN nominal-explicit_gift ELSE NULL END;
    PERFORM set_config('niu.verified_consumption_allocation_entry', NEW.id::text, true);
    INSERT INTO customer_balance_consumption_allocations(entry_id,organization_id,account_id,currency,kind,nominal_nanos,
        explicit_gift_nanos,gift_nanos,nongift_nanos,source_coverage,source_charge_entry_id)
    VALUES(NEW.id,NEW.organization_id,NEW.account_id,NEW.currency,NEW.kind,nominal,explicit_gift,
        CASE WHEN coverage='known' THEN explicit_gift ELSE NULL END,
        nongift,coverage,NEW.reverses_entry_id);
    PERFORM set_config('niu.verified_consumption_allocation_entry', '', true);
    IF late_to_restore>0 THEN
        PERFORM set_config('niu.verified_grant_credit_restoration_refund', NEW.id::text, true);
        FOR target IN SELECT a.id,a.amount_nanos::numeric-COALESCE((SELECT sum(r.amount_nanos::numeric)
            FROM customer_grant_credit_refund_restorations r WHERE r.application_id=a.id),0) AS available
            FROM customer_grant_credit_applications a WHERE a.charge_entry_id=NEW.reverses_entry_id ORDER BY a.created_at,a.id
        LOOP
            IF target.available<0 THEN RAISE EXCEPTION 'Late gift restoration is inconsistent' USING ERRCODE='23514'; END IF;
            amount:=LEAST(late_to_restore,target.available)::bigint;
            IF amount>0 THEN
                INSERT INTO customer_grant_credit_refund_restorations(refund_entry_id,application_id,organization_id,account_id,currency,amount_nanos)
                VALUES(NEW.id,target.id,NEW.organization_id,NEW.account_id,NEW.currency,amount);
                late_to_restore:=late_to_restore-amount;
            END IF;
            EXIT WHEN late_to_restore=0;
        END LOOP;
        PERFORM set_config('niu.verified_grant_credit_restoration_refund', '', true);
        IF late_to_restore<>0 THEN RAISE EXCEPTION 'Late gift refund could not restore its exact sources' USING ERRCODE='23514'; END IF;
    END IF;

    -- Inline credit-source allocation in the same trigger pass without
    -- re-querying customer_balance_consumption_allocations or re-locking the account.
    cash_nanos:=NULL;
    credit_nanos:=NULL;
    credit_coverage:='legacy_unknown';
    IF coverage='known' AND niu_customer_credit_account_covered(NEW.account_id,NEW.id) THEN
        IF NEW.kind='charge' THEN
            cash_pool:=niu_customer_verified_prepaid_cash(NEW.account_id);
            IF cash_pool<0 THEN RAISE EXCEPTION 'Verified prepaid cash pool is inconsistent' USING ERRCODE='23514'; END IF;
            cash_nanos:=LEAST(cash_pool,nongift::numeric)::bigint;
            credit_nanos:=nongift-cash_nanos;
            credit_coverage:='known';
        ELSE
            SELECT * INTO original_credit FROM customer_credit_sources WHERE entry_id=NEW.reverses_entry_id;
            IF FOUND AND original_credit.source_coverage='known' THEN
                owed:=niu_customer_unpaid_credit(original_credit.entry_id);
                SELECT COALESCE(sum(r.cash_nanos::numeric),0) INTO refunded_cash FROM customer_credit_sources r
                    WHERE r.kind='refund' AND r.source_charge_entry_id=original_credit.entry_id;
                SELECT COALESCE(sum(r.amount_nanos::numeric),0) INTO repayment FROM customer_credit_repayments r
                    WHERE r.charge_entry_id=original_credit.entry_id;
                paid:=original_credit.cash_nanos::numeric+repayment-refunded_cash;
                IF owed IS NULL OR owed<0 OR paid<0 OR nongift::numeric>owed+paid THEN
                    RAISE EXCEPTION 'Refund exceeds remaining credit or paid cash after gift allowance' USING ERRCODE='23514';
                END IF;
                credit_nanos:=LEAST(owed,nongift::numeric)::bigint;
                cash_nanos:=nongift-credit_nanos;
                credit_coverage:='known';
            END IF;
        END IF;
    END IF;
    PERFORM set_config('niu.verified_credit_source_entry', NEW.id::text, true);
    INSERT INTO customer_credit_sources(entry_id,organization_id,account_id,currency,kind,nominal_nanos,
        nongift_nanos,cash_nanos,credit_nanos,source_coverage,source_charge_entry_id)
    VALUES(NEW.id,NEW.organization_id,NEW.account_id,NEW.currency,NEW.kind,nominal,
        nongift,cash_nanos,credit_nanos,credit_coverage,NEW.reverses_entry_id);
    PERFORM set_config('niu.verified_credit_source_entry', '', true);
    RETURN NEW;
END;
$$;
