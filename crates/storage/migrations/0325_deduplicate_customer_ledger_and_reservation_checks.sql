-- Avoid duplicate full-history ledger scans during customer balance reservation
-- and credit source allocation while preserving exact trigger invariants.

CREATE INDEX IF NOT EXISTS customer_balance_entries_account_kind_amount_idx
    ON customer_balance_entries (account_id, kind)
    INCLUDE (amount_nanos, id);

CREATE INDEX IF NOT EXISTS customer_credit_sources_account_kind_cash_idx
    ON customer_credit_sources (account_id, kind)
    INCLUDE (cash_nanos, source_coverage, entry_id);

CREATE INDEX IF NOT EXISTS attempts_api_key_spending_lookup_idx
    ON attempts (api_key_id, id)
    WHERE api_key_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS inspected_guardrail_bindings_key_lookup_idx
    ON inspected_guardrail_bindings (key_id, attempt_id);

CREATE OR REPLACE FUNCTION niu_customer_key_committed(p_root UUID, p_account UUID)
RETURNS NUMERIC LANGUAGE sql VOLATILE AS $$
    WITH root_keys AS (
        SELECT organization_id, project_id, id
        FROM api_keys
        WHERE spending_root_id = p_root
    )
    SELECT COALESCE((
        SELECT -SUM(e.amount_nanos)
        FROM customer_balance_entries e
        JOIN attempts a ON a.id = e.attempt_id
        LEFT JOIN inspected_guardrail_bindings b ON b.attempt_id = a.id
        JOIN root_keys k
          ON k.id = COALESCE(a.api_key_id, b.key_id)
         AND k.organization_id = a.organization_id
         AND k.project_id = a.project_id
        WHERE e.account_id = p_account
          AND e.kind = 'charge'
    ), 0)
    - COALESCE((
        SELECT SUM(r.amount_nanos)
        FROM customer_balance_entries r
        JOIN customer_balance_entries c ON c.id = r.reverses_entry_id
        JOIN attempts a ON a.id = c.attempt_id
        LEFT JOIN inspected_guardrail_bindings b ON b.attempt_id = a.id
        JOIN root_keys k
          ON k.id = COALESCE(a.api_key_id, b.key_id)
         AND k.organization_id = a.organization_id
         AND k.project_id = a.project_id
        WHERE r.account_id = p_account
          AND r.kind = 'refund'
          AND c.kind = 'charge'
    ), 0)
    + COALESCE((
        SELECT SUM(GREATEST(r.amount_nanos, COALESCE(m.amount_nanos, 0)))
        FROM customer_balance_reservations r
        LEFT JOIN customer_media_charges m ON m.attempt_id = r.attempt_id
        JOIN attempts a ON a.id = r.attempt_id
        LEFT JOIN inspected_guardrail_bindings b ON b.attempt_id = a.id
        JOIN root_keys k
          ON k.id = COALESCE(a.api_key_id, b.key_id)
         AND k.organization_id = a.organization_id
         AND k.project_id = a.project_id
        WHERE r.account_id = p_account
          AND r.released_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM customer_balance_entries e
              WHERE e.attempt_id = r.attempt_id AND e.kind = 'charge'
          )
    ), 0)
$$;

CREATE OR REPLACE FUNCTION enforce_customer_key_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root UUID; maximum BIGINT; workspace UUID; workspace_maximum BIGINT;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR NO KEY UPDATE;
    SELECT project_id INTO workspace FROM customer_attempt_balance_accounts
        WHERE attempt_id=NEW.attempt_id AND organization_id=NEW.organization_id
          AND account_id=NEW.account_id AND currency=NEW.currency;
    SELECT limit_nanos INTO workspace_maximum FROM customer_workspace_spending_limits
        WHERE organization_id=NEW.organization_id AND project_id=workspace
          AND account_id=NEW.account_id AND currency=NEW.currency;
    IF workspace_maximum IS NOT NULL AND
        niu_customer_workspace_committed(NEW.organization_id,workspace,NEW.account_id)+NEW.amount_nanos>workspace_maximum THEN
        RAISE EXCEPTION 'customer workspace spending limit exceeded' USING ERRCODE='23514';
    END IF;

    root := niu_customer_attempt_spending_root(NEW.attempt_id);
    IF workspace IS NULL THEN
        SELECT project_id INTO workspace FROM attempts WHERE id=NEW.attempt_id;
    END IF;
    IF root IS NULL AND EXISTS(SELECT 1 FROM customer_key_spending_limits
        WHERE organization_id=NEW.organization_id AND project_id=workspace
          AND account_id=NEW.account_id AND limit_nanos IS NOT NULL) THEN
        RAISE EXCEPTION 'key attribution required for bounded spending' USING ERRCODE='23514';
    END IF;
    SELECT limit_nanos INTO maximum FROM customer_key_spending_limits
        WHERE organization_id=NEW.organization_id AND spending_root_id=root AND account_id=NEW.account_id;
    IF maximum IS NOT NULL AND niu_customer_key_committed(root,NEW.account_id)+NEW.amount_nanos>maximum THEN
        RAISE EXCEPTION 'customer key spending limit exceeded' USING ERRCODE='23514';
    END IF;
    PERFORM set_config('niu.verified_workspace_reservation_attempt', NEW.attempt_id::text, true);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_customer_workspace_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE workspace UUID; maximum BIGINT;
BEGIN
    IF current_setting('niu.verified_workspace_reservation_attempt', true) = NEW.attempt_id::text THEN
        PERFORM set_config('niu.verified_workspace_reservation_attempt', '', true);
        RETURN NEW;
    END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR NO KEY UPDATE;
    SELECT project_id INTO workspace FROM customer_attempt_balance_accounts
        WHERE attempt_id=NEW.attempt_id AND organization_id=NEW.organization_id
          AND account_id=NEW.account_id AND currency=NEW.currency;
    SELECT limit_nanos INTO maximum FROM customer_workspace_spending_limits
        WHERE organization_id=NEW.organization_id AND project_id=workspace
          AND account_id=NEW.account_id AND currency=NEW.currency;
    IF maximum IS NOT NULL AND
        niu_customer_workspace_committed(NEW.organization_id,workspace,NEW.account_id)+NEW.amount_nanos>maximum THEN
        RAISE EXCEPTION 'customer workspace spending limit exceeded' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
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
    IF current_setting('niu.verified_credit_source_entry', true) = NEW.entry_id::text THEN
        PERFORM set_config('niu.verified_credit_source_entry', '', true);
        RETURN NEW;
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
    PERFORM set_config('niu.verified_credit_source_entry', NEW.id::text, true);
    INSERT INTO customer_credit_sources(entry_id,organization_id,account_id,currency,kind,nominal_nanos,
        nongift_nanos,cash_nanos,credit_nanos,source_coverage,source_charge_entry_id)
    VALUES(NEW.id,NEW.organization_id,NEW.account_id,NEW.currency,NEW.kind,allocation.nominal_nanos,
        split.nongift_nanos,split.cash_nanos,split.credit_nanos,split.source_coverage,NEW.reverses_entry_id);
    PERFORM set_config('niu.verified_credit_source_entry', '', true);
    RETURN NEW;
END;
$$;
