-- Eliminate O(N^2) full-history scans in allocate_customer_credit_repayments
-- and apply_customer_grant_credit_policy by indexing credit-bearing charges
-- and avoiding redundant per-row full-account scans during trigger-driven loops.

CREATE INDEX IF NOT EXISTS customer_credit_sources_known_credit_charges_idx
    ON customer_credit_sources (account_id, entry_id)
    WHERE kind = 'charge' AND source_coverage = 'known' AND credit_nanos > 0;

CREATE OR REPLACE FUNCTION validate_customer_grant_credit_application() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE grant_amount NUMERIC; used NUMERIC; owed NUMERIC; pool NUMERIC;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    IF current_setting('niu.verified_grant_credit_application_grant', true) = NEW.grant_id::text THEN
        RETURN NEW;
    END IF;
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

CREATE OR REPLACE FUNCTION apply_customer_grant_credit_policy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal customer_balance_grants%ROWTYPE; target RECORD; remaining BIGINT; amount BIGINT; pool NUMERIC; covered BOOLEAN;
BEGIN
    IF NEW.policy='future_only' THEN RETURN NEW; END IF;
    SELECT * INTO STRICT journal FROM customer_balance_grants WHERE id=NEW.grant_id;
    PERFORM id FROM customer_balance_accounts WHERE id=journal.account_id FOR NO KEY UPDATE;
    remaining:=journal.amount_nanos;
    covered:=niu_customer_credit_account_covered(journal.account_id);
    pool:=niu_customer_explicit_gift_pool(journal.account_id);
    FOR target IN SELECT s.entry_id,niu_customer_unpaid_credit(s.entry_id) AS owed
        FROM customer_credit_sources s JOIN customer_balance_entries e ON e.id=s.entry_id
        WHERE s.account_id=journal.account_id AND s.kind='charge' AND s.source_coverage='known' AND s.credit_nanos>0
        ORDER BY e.created_at,e.id
    LOOP
        IF target.owed IS NULL OR target.owed<0 THEN RAISE EXCEPTION 'Unpaid credit is inconsistent' USING ERRCODE='23514'; END IF;
        amount:=LEAST(remaining::numeric,target.owed)::bigint;
        IF amount>0 THEN
            IF NOT covered OR pool<amount THEN
                RAISE EXCEPTION 'Grant application exceeds available gift or exact unpaid credit' USING ERRCODE='23514';
            END IF;
            PERFORM set_config('niu.verified_grant_credit_application_grant', journal.id::text, true);
            INSERT INTO customer_grant_credit_applications(id,organization_id,account_id,currency,grant_id,charge_entry_id,amount_nanos)
            VALUES(gen_random_uuid(),journal.organization_id,journal.account_id,journal.currency,journal.id,target.entry_id,amount);
            PERFORM set_config('niu.verified_grant_credit_application_grant', '', true);
            remaining:=remaining-amount;
            pool:=pool-amount;
        END IF;
        EXIT WHEN remaining=0;
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_customer_credit_repayment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE receipt_amount NUMERIC; capacity NUMERIC; committed NUMERIC; available_cash NUMERIC;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    IF current_setting('niu.verified_credit_repayment_funding', true) = NEW.funding_entry_id::text THEN
        RETURN NEW;
    END IF;
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
DECLARE remaining BIGINT; target RECORD; amount BIGINT; available_cash NUMERIC;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    IF NOT EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.id=NEW.entry_id AND e.organization_id=NEW.organization_id
        AND e.account_id=NEW.account_id AND e.currency=NEW.currency AND e.kind='funding' AND e.amount_nanos=NEW.amount_nanos) THEN
        RAISE EXCEPTION 'Verified receipt requires its exact positive funding entry' USING ERRCODE='23514';
    END IF;
    IF NOT niu_customer_credit_account_covered(NEW.account_id) THEN RETURN NEW; END IF;
    remaining:=NEW.amount_nanos;
    available_cash:=niu_customer_verified_prepaid_cash(NEW.account_id);
    FOR target IN SELECT s.entry_id,niu_customer_unpaid_credit(s.entry_id) AS owed
        FROM customer_credit_sources s JOIN customer_balance_entries e ON e.id=s.entry_id
        WHERE s.account_id=NEW.account_id AND s.kind='charge' AND s.source_coverage='known' AND s.credit_nanos>0
        ORDER BY e.created_at,e.id
    LOOP
        IF target.owed IS NULL OR target.owed<0 THEN RAISE EXCEPTION 'Outstanding credit is inconsistent' USING ERRCODE='23514'; END IF;
        amount:=LEAST(remaining::numeric,target.owed)::bigint;
        IF amount>0 THEN
            IF available_cash<amount THEN
                RAISE EXCEPTION 'Repayment exceeds exact cash or unpaid credit after allowances' USING ERRCODE='23514';
            END IF;
            PERFORM set_config('niu.verified_credit_repayment_funding', NEW.entry_id::text, true);
            INSERT INTO customer_credit_repayments(id,organization_id,account_id,currency,funding_entry_id,charge_entry_id,amount_nanos)
            VALUES(gen_random_uuid(),NEW.organization_id,NEW.account_id,NEW.currency,NEW.entry_id,target.entry_id,amount);
            PERFORM set_config('niu.verified_credit_repayment_funding', '', true);
            remaining:=remaining-amount;
            available_cash:=available_cash-amount;
        END IF;
        EXIT WHEN remaining=0;
    END LOOP;
    RETURN NEW;
END;
$$;
