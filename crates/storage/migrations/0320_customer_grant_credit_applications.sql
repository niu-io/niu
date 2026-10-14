-- Explicit policies and late sales allowances. No existing gift/debit is
-- rewritten or backfilled; absent legacy policy remains future_only.
CREATE TABLE customer_grant_policies (
    grant_id UUID PRIMARY KEY REFERENCES customer_balance_grants(id),
    policy TEXT NOT NULL CHECK (policy IN ('future_only','unpaid_credit_first')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE customer_grant_credit_applications (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    grant_id UUID NOT NULL REFERENCES customer_balance_grants(id),
    charge_entry_id UUID NOT NULL,
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(grant_id,charge_entry_id),
    UNIQUE(organization_id,account_id,currency,id),
    FOREIGN KEY(organization_id,account_id,currency,charge_entry_id)
        REFERENCES customer_credit_sources(organization_id,account_id,currency,entry_id)
);
CREATE INDEX customer_grant_credit_applications_account ON customer_grant_credit_applications(account_id,created_at,id);
CREATE INDEX customer_grant_credit_applications_charge ON customer_grant_credit_applications(charge_entry_id);
CREATE TABLE customer_grant_credit_refund_restorations (
    refund_entry_id UUID NOT NULL,
    application_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(refund_entry_id,application_id),
    FOREIGN KEY(organization_id,account_id,currency,refund_entry_id)
        REFERENCES customer_balance_entries(organization_id,account_id,currency,id),
    FOREIGN KEY(organization_id,account_id,currency,application_id)
        REFERENCES customer_grant_credit_applications(organization_id,account_id,currency,id)
);
CREATE INDEX customer_grant_credit_refund_application ON customer_grant_credit_refund_restorations(application_id);
CREATE TRIGGER immutable_customer_grant_policy BEFORE UPDATE OR DELETE ON customer_grant_policies
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_grant_credit_application BEFORE UPDATE OR DELETE ON customer_grant_credit_applications
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_grant_credit_restoration BEFORE UPDATE OR DELETE ON customer_grant_credit_refund_restorations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- Restorations are already in refund explicit_gift_nanos: never add them again.
CREATE FUNCTION niu_customer_explicit_gift_pool(account UUID) RETURNS NUMERIC
LANGUAGE SQL VOLATILE AS $$
SELECT COALESCE((SELECT sum(g.amount_nanos::numeric) FROM customer_balance_grants g WHERE g.account_id=account),0)
    -COALESCE((SELECT sum(CASE WHEN a.kind='charge' THEN a.explicit_gift_nanos::numeric ELSE -a.explicit_gift_nanos::numeric END)
        FROM customer_balance_consumption_allocations a WHERE a.account_id=account),0)
    -COALESCE((SELECT sum(a.amount_nanos::numeric) FROM customer_grant_credit_applications a WHERE a.account_id=account),0);
$$;
CREATE FUNCTION niu_customer_unpaid_credit(charge UUID) RETURNS NUMERIC
LANGUAGE SQL VOLATILE AS $$
SELECT s.credit_nanos::numeric
    -COALESCE((SELECT sum(r.credit_nanos::numeric) FROM customer_credit_sources r
        WHERE r.kind='refund' AND r.source_charge_entry_id=s.entry_id),0)
    -COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_credit_repayments r WHERE r.charge_entry_id=s.entry_id),0)
    -COALESCE((SELECT sum(a.amount_nanos::numeric) FROM customer_grant_credit_applications a WHERE a.charge_entry_id=s.entry_id),0)
FROM customer_credit_sources s WHERE s.entry_id=charge AND s.kind='charge' AND s.source_coverage='known';
$$;
CREATE FUNCTION niu_customer_verified_prepaid_cash(account UUID) RETURNS NUMERIC
LANGUAGE SQL VOLATILE AS $$
SELECT COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_funding_receipts r WHERE r.account_id=account),0)
    -COALESCE((SELECT sum(s.cash_nanos::numeric) FROM customer_credit_sources s WHERE s.account_id=account AND s.kind='charge'),0)
    +COALESCE((SELECT sum(s.cash_nanos::numeric) FROM customer_credit_sources s WHERE s.account_id=account AND s.kind='refund'),0)
    -COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_credit_repayments r WHERE r.account_id=account),0);
$$;

CREATE FUNCTION validate_customer_grant_policy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal customer_balance_grants%ROWTYPE; same_transaction BOOLEAN;
BEGIN
    SELECT * INTO journal FROM customer_balance_grants WHERE id=NEW.grant_id;
    SELECT g.xmin::text=mod(pg_current_xact_id()::text::numeric,4294967296)::text
        INTO same_transaction FROM customer_balance_grants g WHERE g.id=NEW.grant_id;
    IF journal.id IS NULL OR same_transaction IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Grant policy must be published with a fresh grant journal' USING ERRCODE='23514';
    END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=journal.account_id FOR NO KEY UPDATE;
    IF NEW.policy='unpaid_credit_first' AND NOT niu_customer_credit_account_covered(journal.account_id) THEN
        RAISE EXCEPTION 'Debt-first grant requires complete cash and credit provenance' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_grant_policy BEFORE INSERT ON customer_grant_policies
    FOR EACH ROW EXECUTE FUNCTION validate_customer_grant_policy();
CREATE FUNCTION validate_customer_grant_credit_application() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE grant_amount NUMERIC; used NUMERIC; owed NUMERIC; pool NUMERIC;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT g.amount_nanos::numeric INTO STRICT grant_amount FROM customer_balance_grants g
        JOIN customer_grant_policies p ON p.grant_id=g.id AND p.policy='unpaid_credit_first'
        WHERE g.id=NEW.grant_id AND g.organization_id=NEW.organization_id AND g.account_id=NEW.account_id AND g.currency=NEW.currency;
    IF NOT EXISTS(SELECT 1 FROM customer_credit_sources s WHERE s.entry_id=NEW.charge_entry_id
        AND s.organization_id=NEW.organization_id AND s.account_id=NEW.account_id AND s.currency=NEW.currency
        AND s.kind='charge' AND s.source_coverage='known') THEN
        RAISE EXCEPTION 'Grant application requires exact known customer credit' USING ERRCODE='23514';
    END IF;
    SELECT COALESCE(sum(amount_nanos::numeric),0) INTO used FROM customer_grant_credit_applications WHERE grant_id=NEW.grant_id;
    owed:=niu_customer_unpaid_credit(NEW.charge_entry_id); pool:=niu_customer_explicit_gift_pool(NEW.account_id);
    IF NOT niu_customer_credit_account_covered(NEW.account_id) OR used+NEW.amount_nanos>grant_amount
        OR owed IS NULL OR owed<NEW.amount_nanos OR pool<NEW.amount_nanos THEN
        RAISE EXCEPTION 'Grant application exceeds available gift or exact unpaid credit' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_grant_credit_application BEFORE INSERT ON customer_grant_credit_applications
    FOR EACH ROW EXECUTE FUNCTION validate_customer_grant_credit_application();
CREATE FUNCTION apply_customer_grant_credit_policy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal customer_balance_grants%ROWTYPE; target RECORD; remaining BIGINT; amount BIGINT;
BEGIN
    IF NEW.policy='future_only' THEN RETURN NEW; END IF;
    SELECT * INTO STRICT journal FROM customer_balance_grants WHERE id=NEW.grant_id;
    PERFORM id FROM customer_balance_accounts WHERE id=journal.account_id FOR NO KEY UPDATE;
    remaining:=journal.amount_nanos;
    FOR target IN SELECT s.entry_id,niu_customer_unpaid_credit(s.entry_id) AS owed
        FROM customer_credit_sources s JOIN customer_balance_entries e ON e.id=s.entry_id
        WHERE s.account_id=journal.account_id AND s.kind='charge' AND s.source_coverage='known'
        ORDER BY e.created_at,e.id
    LOOP
        IF target.owed IS NULL OR target.owed<0 THEN RAISE EXCEPTION 'Unpaid credit is inconsistent' USING ERRCODE='23514'; END IF;
        amount:=LEAST(remaining::numeric,target.owed)::bigint;
        IF amount>0 THEN
            INSERT INTO customer_grant_credit_applications(id,organization_id,account_id,currency,grant_id,charge_entry_id,amount_nanos)
            VALUES(gen_random_uuid(),journal.organization_id,journal.account_id,journal.currency,journal.id,target.entry_id,amount);
            remaining:=remaining-amount;
        END IF;
        EXIT WHEN remaining=0;
    END LOOP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER apply_customer_grant_credit_policy AFTER INSERT ON customer_grant_policies
    FOR EACH ROW EXECUTE FUNCTION apply_customer_grant_credit_policy();

-- Refund restoration is a subset of the refund's gift component, never a new
-- balance credit or a reversal that recreates an already forgiven receivable.
CREATE FUNCTION niu_customer_late_refund_quantity(refund UUID) RETURNS NUMERIC
LANGUAGE SQL VOLATILE AS $$
SELECT GREATEST(0,a.explicit_gift_nanos::numeric-GREATEST(0,original.explicit_gift_nanos::numeric
    -COALESCE((SELECT sum(previous.explicit_gift_nanos::numeric)
        FROM customer_balance_consumption_allocations previous
        WHERE previous.kind='refund' AND previous.source_charge_entry_id=original.entry_id AND previous.entry_id<>a.entry_id),0)
    +COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_grant_credit_refund_restorations r
        JOIN customer_balance_entries e ON e.id=r.refund_entry_id
        WHERE e.reverses_entry_id=original.entry_id AND r.refund_entry_id<>a.entry_id),0)))
FROM customer_balance_consumption_allocations a
JOIN customer_balance_consumption_allocations original ON original.entry_id=a.source_charge_entry_id
WHERE a.entry_id=refund AND a.kind='refund';
$$;
CREATE FUNCTION validate_customer_grant_credit_restoration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE available NUMERIC; needed NUMERIC; recorded NUMERIC; original UUID;
BEGIN
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
CREATE TRIGGER validate_customer_grant_credit_restoration BEFORE INSERT ON customer_grant_credit_refund_restorations
    FOR EACH ROW EXECUTE FUNCTION validate_customer_grant_credit_restoration();
CREATE FUNCTION check_customer_grant_credit_restoration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected NUMERIC; actual NUMERIC;
BEGIN
    IF NEW.kind<>'refund' THEN RETURN NEW; END IF;
    expected:=COALESCE(niu_customer_late_refund_quantity(NEW.entry_id),0);
    SELECT COALESCE(sum(amount_nanos::numeric),0) INTO actual FROM customer_grant_credit_refund_restorations
        WHERE refund_entry_id=NEW.entry_id;
    IF expected<>actual THEN
        RAISE EXCEPTION 'Late gift refund requires complete exact restoration provenance' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER check_customer_grant_credit_restoration
    AFTER INSERT ON customer_balance_consumption_allocations DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_customer_grant_credit_restoration();

CREATE OR REPLACE FUNCTION allocate_customer_balance_consumption() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE nominal BIGINT; explicit_gift BIGINT:=0; pool NUMERIC; refunded_nominal NUMERIC;
    original_amount NUMERIC; original customer_balance_consumption_allocations%ROWTYPE;
    previous_gift NUMERIC; previous_late NUMERIC; base_remaining NUMERIC; late_remaining NUMERIC;
    late_to_restore NUMERIC:=0; target RECORD; amount BIGINT; coverage TEXT:='known';
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
    INSERT INTO customer_balance_consumption_allocations(entry_id,organization_id,account_id,currency,kind,nominal_nanos,
        explicit_gift_nanos,gift_nanos,nongift_nanos,source_coverage,source_charge_entry_id)
    VALUES(NEW.id,NEW.organization_id,NEW.account_id,NEW.currency,NEW.kind,nominal,explicit_gift,
        CASE WHEN coverage='known' THEN explicit_gift ELSE NULL END,
        CASE WHEN coverage='known' THEN nominal-explicit_gift ELSE NULL END,coverage,NEW.reverses_entry_id);
    IF late_to_restore>0 THEN
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
        IF late_to_restore<>0 THEN RAISE EXCEPTION 'Late gift refund could not restore its exact sources' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- One shared calculation powers both automatic allocation and direct-insert
-- validation. Original immutable cash/credit rows are never reclassified.
CREATE FUNCTION niu_customer_credit_source_split(entry UUID)
RETURNS TABLE(nongift_nanos BIGINT,cash_nanos BIGINT,credit_nanos BIGINT,source_coverage TEXT)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE allocation customer_balance_consumption_allocations%ROWTYPE; original customer_credit_sources%ROWTYPE;
    pool NUMERIC; owed NUMERIC; paid NUMERIC; repayment NUMERIC; refunded_cash NUMERIC;
BEGIN
    SELECT * INTO STRICT allocation FROM customer_balance_consumption_allocations WHERE entry_id=entry;
    PERFORM id FROM customer_balance_accounts WHERE id=allocation.account_id FOR NO KEY UPDATE;
    nongift_nanos:=allocation.nongift_nanos; cash_nanos:=NULL; credit_nanos:=NULL; source_coverage:='legacy_unknown';
    IF allocation.source_coverage='known' AND niu_customer_credit_account_covered(allocation.account_id,entry) THEN
        IF allocation.kind='charge' THEN
            pool:=niu_customer_verified_prepaid_cash(allocation.account_id);
            IF pool<0 THEN RAISE EXCEPTION 'Verified prepaid cash pool is inconsistent' USING ERRCODE='23514'; END IF;
            cash_nanos:=LEAST(pool,nongift_nanos::numeric)::bigint; credit_nanos:=nongift_nanos-cash_nanos; source_coverage:='known';
        ELSE
            SELECT * INTO original FROM customer_credit_sources WHERE entry_id=allocation.source_charge_entry_id;
            IF FOUND AND original.source_coverage='known' THEN
                owed:=niu_customer_unpaid_credit(original.entry_id);
                SELECT COALESCE(sum(r.cash_nanos::numeric),0) INTO refunded_cash FROM customer_credit_sources r
                    WHERE r.kind='refund' AND r.source_charge_entry_id=original.entry_id;
                SELECT COALESCE(sum(r.amount_nanos::numeric),0) INTO repayment FROM customer_credit_repayments r
                    WHERE r.charge_entry_id=original.entry_id;
                paid:=original.cash_nanos::numeric+repayment-refunded_cash;
                IF owed IS NULL OR owed<0 OR paid<0 OR nongift_nanos::numeric>owed+paid THEN
                    RAISE EXCEPTION 'Refund exceeds remaining credit or paid cash after gift allowance' USING ERRCODE='23514';
                END IF;
                credit_nanos:=LEAST(owed,nongift_nanos::numeric)::bigint; cash_nanos:=nongift_nanos-credit_nanos; source_coverage:='known';
            END IF;
        END IF;
    END IF;
    RETURN NEXT;
END;
$$;
CREATE OR REPLACE FUNCTION validate_customer_credit_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected RECORD;
BEGIN
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
CREATE OR REPLACE FUNCTION allocate_customer_credit_sources() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocation customer_balance_consumption_allocations%ROWTYPE; split RECORD;
BEGIN
    IF NEW.kind NOT IN ('charge','refund') THEN RETURN NEW; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT * INTO STRICT allocation FROM customer_balance_consumption_allocations WHERE entry_id=NEW.id;
    SELECT * INTO STRICT split FROM niu_customer_credit_source_split(NEW.id);
    INSERT INTO customer_credit_sources(entry_id,organization_id,account_id,currency,kind,nominal_nanos,
        nongift_nanos,cash_nanos,credit_nanos,source_coverage,source_charge_entry_id)
    VALUES(NEW.id,NEW.organization_id,NEW.account_id,NEW.currency,NEW.kind,allocation.nominal_nanos,
        split.nongift_nanos,split.cash_nanos,split.credit_nanos,split.source_coverage,NEW.reverses_entry_id);
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION validate_customer_credit_repayment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE receipt_amount NUMERIC; capacity NUMERIC; committed NUMERIC; available_cash NUMERIC;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT r.amount_nanos::numeric INTO STRICT receipt_amount FROM customer_funding_receipts r JOIN customer_balance_entries e ON e.id=r.entry_id
        WHERE r.entry_id=NEW.funding_entry_id AND r.organization_id=NEW.organization_id AND r.account_id=NEW.account_id
          AND r.currency=NEW.currency AND e.kind='funding' AND e.amount_nanos=r.amount_nanos;
    IF NOT EXISTS(SELECT 1 FROM customer_credit_sources s WHERE s.entry_id=NEW.charge_entry_id AND s.organization_id=NEW.organization_id
        AND s.account_id=NEW.account_id AND s.currency=NEW.currency AND s.kind='charge' AND s.source_coverage='known') THEN
        RAISE EXCEPTION 'Repayment requires exact known customer credit' USING ERRCODE='23514';
    END IF;
    SELECT COALESCE(sum(amount_nanos::numeric),0) INTO committed FROM customer_credit_repayments WHERE funding_entry_id=NEW.funding_entry_id;
    capacity:=niu_customer_unpaid_credit(NEW.charge_entry_id); available_cash:=niu_customer_verified_prepaid_cash(NEW.account_id);
    IF NOT niu_customer_credit_account_covered(NEW.account_id) OR capacity IS NULL
        OR committed+NEW.amount_nanos>receipt_amount OR capacity<NEW.amount_nanos OR available_cash<NEW.amount_nanos THEN
        RAISE EXCEPTION 'Repayment exceeds exact cash or unpaid credit after allowances' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION allocate_customer_credit_repayments() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE remaining BIGINT; target RECORD; amount BIGINT;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    IF NOT EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.id=NEW.entry_id AND e.organization_id=NEW.organization_id
        AND e.account_id=NEW.account_id AND e.currency=NEW.currency AND e.kind='funding' AND e.amount_nanos=NEW.amount_nanos) THEN
        RAISE EXCEPTION 'Verified receipt requires its exact positive funding entry' USING ERRCODE='23514';
    END IF;
    IF NOT niu_customer_credit_account_covered(NEW.account_id) THEN RETURN NEW; END IF;
    remaining:=NEW.amount_nanos;
    FOR target IN SELECT s.entry_id,niu_customer_unpaid_credit(s.entry_id) AS owed
        FROM customer_credit_sources s JOIN customer_balance_entries e ON e.id=s.entry_id
        WHERE s.account_id=NEW.account_id AND s.kind='charge' AND s.source_coverage='known' ORDER BY e.created_at,e.id
    LOOP
        IF target.owed IS NULL OR target.owed<0 THEN RAISE EXCEPTION 'Outstanding credit is inconsistent' USING ERRCODE='23514'; END IF;
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
