-- Conservative first correction contract: no previous or pending paid requests.
-- A released legacy hold alone does not establish that later settlement is impossible.
CREATE OR REPLACE FUNCTION validate_unused_customer_gift_correction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original customer_balance_grants%ROWTYPE;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT * INTO original FROM customer_balance_grants WHERE id=NEW.grant_id AND organization_id=NEW.organization_id AND account_id=NEW.account_id AND currency=NEW.currency;
    IF original.id IS NULL OR original.amount_nanos<>NEW.amount_nanos
       OR EXISTS(SELECT 1 FROM customer_grant_credit_applications WHERE grant_id=original.id)
       OR EXISTS(SELECT 1 FROM customer_balance_entries WHERE account_id=NEW.account_id AND kind IN ('charge','refund'))
       OR EXISTS(SELECT 1 FROM customer_balance_reservations WHERE account_id=NEW.account_id AND released_at IS NULL)
       OR EXISTS(SELECT 1 FROM customer_attempt_balance_accounts WHERE account_id=NEW.account_id)
       OR NOT niu_customer_credit_account_covered(NEW.account_id,NEW.entry_id)
       OR niu_customer_explicit_gift_pool(NEW.account_id)<NEW.amount_nanos
       OR NOT EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.id=NEW.entry_id
            AND e.organization_id=NEW.organization_id AND e.account_id=NEW.account_id AND e.currency=NEW.currency
            AND e.kind='adjustment' AND e.amount_nanos::numeric=-NEW.amount_nanos::numeric
            AND e.idempotency_key=NEW.idempotency_key AND e.reverses_entry_id IS NULL
            AND e.project_id IS NULL AND e.attempt_id IS NULL) THEN
        RAISE EXCEPTION 'Correction requires an exact wholly unused gift with known sources and no open liabilities' USING ERRCODE='P0040';
    END IF;
    RETURN NEW;
END;
$$;
