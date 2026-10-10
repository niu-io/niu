-- Keep account serialization compatible with immutable foreign-key pins.
-- The application reservation lock and every account-guard trigger must use
-- the same non-key-changing mode; a later FOR UPDATE upgrade recreates the
-- admission deadlock even when the application already uses NO KEY UPDATE.
-- Financial predicates, revisions and error behavior are unchanged.


CREATE OR REPLACE FUNCTION protect_customer_workspace_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'spending limits cannot be deleted'; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR NO KEY UPDATE;
    IF TG_OP='UPDATE' AND (ROW(NEW.organization_id,NEW.project_id,NEW.account_id,NEW.currency)
        IS DISTINCT FROM ROW(OLD.organization_id,OLD.project_id,OLD.account_id,OLD.currency)
        OR NEW.revision<>OLD.revision+1) THEN
        RAISE EXCEPTION 'invalid spending limit revision' USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' AND NEW.revision<>1 THEN
        RAISE EXCEPTION 'invalid initial spending limit revision' USING ERRCODE='23514';
    END IF;
    IF niu_customer_workspace_committed(NEW.organization_id,NEW.project_id,NEW.account_id)>NEW.limit_nanos THEN
        RAISE EXCEPTION 'spending limit below committed customer liability' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_customer_workspace_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE workspace UUID; maximum BIGINT;
BEGIN
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

CREATE OR REPLACE FUNCTION protect_customer_key_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'key limits cannot be deleted'; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR NO KEY UPDATE;
    IF (TG_OP='INSERT' AND NEW.revision<>1) OR
       (TG_OP='UPDATE' AND (NEW.revision<>OLD.revision+1 OR
        ROW(NEW.organization_id,NEW.project_id,NEW.spending_root_id,NEW.account_id,NEW.currency)
        IS DISTINCT FROM ROW(OLD.organization_id,OLD.project_id,OLD.spending_root_id,OLD.account_id,OLD.currency))) THEN
        RAISE EXCEPTION 'invalid key limit revision' USING ERRCODE='23514';
    END IF;
    IF NEW.limit_nanos IS NOT NULL AND EXISTS (
        SELECT 1 FROM customer_balance_reservations r JOIN attempts a ON a.id=r.attempt_id
        WHERE r.account_id=NEW.account_id AND a.project_id=NEW.project_id
          AND r.released_at IS NULL AND niu_customer_attempt_spending_root(r.attempt_id) IS NULL
    ) THEN
        RAISE EXCEPTION 'unattributed liabilities require reconciliation before setting a key limit' USING ERRCODE='23514';
    END IF;
    IF NEW.limit_nanos IS NOT NULL AND niu_customer_key_committed(NEW.spending_root_id,NEW.account_id)>NEW.limit_nanos THEN
        RAISE EXCEPTION 'key limit below committed liability' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_customer_key_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root UUID; maximum BIGINT; workspace UUID;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR NO KEY UPDATE;
    root := niu_customer_attempt_spending_root(NEW.attempt_id);
    SELECT project_id INTO workspace FROM attempts WHERE id=NEW.attempt_id;
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
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_customer_media_debit_capacity() RETURNS TRIGGER AS $$
DECLARE funded BOOLEAN;
BEGIN
    IF NEW.kind<>'charge' OR NOT EXISTS (SELECT 1 FROM customer_media_charges WHERE attempt_id=NEW.attempt_id) THEN RETURN NEW; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR NO KEY UPDATE;
    SELECT COALESCE((SELECT SUM(amount_nanos) FROM customer_balance_entries WHERE account_id=a.id),0)
        +a.credit_limit_nanos-niu_customer_account_outstanding(a.id, NEW.attempt_id)
        >=-NEW.amount_nanos INTO funded FROM customer_balance_accounts a WHERE a.id=NEW.account_id;
    IF funded IS DISTINCT FROM true THEN RAISE EXCEPTION 'media debit exceeds available approved capacity' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
