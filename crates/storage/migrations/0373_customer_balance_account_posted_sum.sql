-- Maintain an incremental O(1) posted balance counter on customer_balance_accounts
-- synchronized in the same transaction as append-only customer_balance_entries,
-- and attach explicit constraint identifiers to reservation spending-limit triggers.

ALTER TABLE customer_balance_accounts
    ADD COLUMN posted_balance_nanos NUMERIC NOT NULL DEFAULT 0;

-- Restrict platform_currency_guard on customer_balance_accounts to configuration
-- columns so ledger postings on historical currency accounts remain permitted.
DROP TRIGGER platform_currency_guard ON customer_balance_accounts;
CREATE TRIGGER platform_currency_guard
    BEFORE INSERT OR UPDATE OF organization_id, currency, credit_limit_nanos, warning_threshold_nanos, policy_revision
    ON customer_balance_accounts
    FOR EACH ROW EXECUTE FUNCTION niu_require_platform_currency();

UPDATE customer_balance_accounts a
SET posted_balance_nanos = COALESCE(
    (SELECT SUM(e.amount_nanos) FROM customer_balance_entries e WHERE e.account_id = a.id),
    0
);

CREATE OR REPLACE FUNCTION protect_customer_account_posted_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.posted_balance_nanos <> 0 THEN
        RAISE EXCEPTION 'posted_balance_nanos must start at zero'
            USING ERRCODE = '23514', CONSTRAINT = 'customer_account_posted_balance_guard';
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW.posted_balance_nanos IS DISTINCT FROM OLD.posted_balance_nanos
       AND current_setting('niu.updating_posted_balance_account', true) IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'posted_balance_nanos is maintained only by ledger entries'
            USING ERRCODE = '23514', CONSTRAINT = 'customer_account_posted_balance_guard';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER guard_customer_account_posted_balance
    BEFORE INSERT OR UPDATE OF posted_balance_nanos ON customer_balance_accounts
    FOR EACH ROW EXECUTE FUNCTION protect_customer_account_posted_balance();

CREATE OR REPLACE FUNCTION maintain_customer_account_posted_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    delta RECORD;
BEGIN
    FOR delta IN
        SELECT account_id, SUM(amount_nanos) AS amount_nanos
        FROM inserted_rows
        GROUP BY account_id
    LOOP
        PERFORM set_config('niu.updating_posted_balance_account', delta.account_id::text, true);
        UPDATE customer_balance_accounts
        SET posted_balance_nanos = posted_balance_nanos + delta.amount_nanos
        WHERE id = delta.account_id;
    END LOOP;
    PERFORM set_config('niu.updating_posted_balance_account', '', true);
    RETURN NULL;
END;
$$;

CREATE TRIGGER a00_maintain_customer_account_posted_balance_on_entry
    AFTER INSERT ON customer_balance_entries
    REFERENCING NEW TABLE AS inserted_rows
    FOR EACH STATEMENT EXECUTE FUNCTION maintain_customer_account_posted_balance();

CREATE OR REPLACE FUNCTION niu_verify_customer_account_posted_balance(p_account UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM customer_balance_accounts a
        WHERE a.id = p_account
          AND a.posted_balance_nanos = COALESCE(
              (SELECT SUM(e.amount_nanos) FROM customer_balance_entries e WHERE e.account_id = a.id),
              0
          )
    );
$$;

CREATE OR REPLACE FUNCTION enforce_customer_media_debit_capacity() RETURNS TRIGGER AS $$
DECLARE funded BOOLEAN;
BEGIN
    IF NEW.kind <> 'charge' OR NOT EXISTS (SELECT 1 FROM customer_media_charges WHERE attempt_id = NEW.attempt_id) THEN
        RETURN NEW;
    END IF;
    PERFORM id FROM customer_balance_accounts WHERE id = NEW.account_id FOR NO KEY UPDATE;
    SELECT a.posted_balance_nanos + a.credit_limit_nanos - niu_customer_account_outstanding(a.id, NEW.attempt_id)
        >= -NEW.amount_nanos
    INTO funded
    FROM customer_balance_accounts a
    WHERE a.id = NEW.account_id;
    IF funded IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'media debit exceeds available approved capacity'
            USING ERRCODE = '23514', CONSTRAINT = 'media_debit_exceeds_approved_capacity';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
        RAISE EXCEPTION 'customer workspace spending limit exceeded'
            USING ERRCODE='23514', CONSTRAINT='customer_workspace_spending_limit_exceeded';
    END IF;

    root := niu_customer_attempt_spending_root(NEW.attempt_id);
    IF workspace IS NULL THEN
        SELECT project_id INTO workspace FROM attempts WHERE id=NEW.attempt_id;
    END IF;
    IF root IS NULL AND EXISTS(SELECT 1 FROM customer_key_spending_limits
        WHERE organization_id=NEW.organization_id AND project_id=workspace
          AND account_id=NEW.account_id AND limit_nanos IS NOT NULL) THEN
        RAISE EXCEPTION 'key attribution required for bounded spending'
            USING ERRCODE='23514', CONSTRAINT='key_attribution_required_for_bounded_spending';
    END IF;
    SELECT limit_nanos INTO maximum FROM customer_key_spending_limits
        WHERE organization_id=NEW.organization_id AND spending_root_id=root AND account_id=NEW.account_id;
    IF maximum IS NOT NULL AND niu_customer_key_committed(root,NEW.account_id)+NEW.amount_nanos>maximum THEN
        RAISE EXCEPTION 'customer key spending limit exceeded'
            USING ERRCODE='23514', CONSTRAINT='customer_key_spending_limit_exceeded';
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
        RAISE EXCEPTION 'customer workspace spending limit exceeded'
            USING ERRCODE='23514', CONSTRAINT='customer_workspace_spending_limit_exceeded';
    END IF;
    RETURN NEW;
END;
$$;
