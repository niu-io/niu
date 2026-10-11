-- Caller-controlled reversal keys must not consume the namespace used by
-- automatic attempt debits. Preserve all historical entries and their keys.
ALTER TABLE customer_balance_entries
    DROP CONSTRAINT customer_balance_entries_account_id_idempotency_key_key;
CREATE UNIQUE INDEX customer_balance_noncharge_idempotency
    ON customer_balance_entries(account_id,idempotency_key) WHERE kind<>'charge';
-- customer_balance_charge_once already enforces one debit per attempt.

CREATE OR REPLACE FUNCTION protect_customer_balance_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'customer reservations cannot be deleted'; END IF;
    IF ROW(NEW.attempt_id,NEW.organization_id,NEW.account_id,NEW.currency,NEW.amount_nanos,NEW.created_at)
        IS DISTINCT FROM ROW(OLD.attempt_id,OLD.organization_id,OLD.account_id,OLD.currency,OLD.amount_nanos,OLD.created_at)
        OR OLD.released_at IS NOT NULL OR NEW.released_at IS NULL THEN
        RAISE EXCEPTION 'only a terminal reservation release is permitted';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM attempts a WHERE a.id=OLD.attempt_id
        AND (a.execution IN ('not_sent','confirmed_not_executed')
            OR EXISTS (
                SELECT 1 FROM (
                    SELECT organization_id,project_id,attempt_id,currency,amount_nanos FROM customer_charges
                    UNION ALL
                    SELECT organization_id,project_id,attempt_id,currency,amount_nanos FROM customer_media_charges
                ) c WHERE c.attempt_id=a.id AND c.organization_id=OLD.organization_id
                    AND c.project_id=a.project_id AND c.currency=OLD.currency
                    AND (c.amount_nanos=0 OR EXISTS (
                        SELECT 1 FROM customer_balance_entries e
                        WHERE e.attempt_id=c.attempt_id AND e.kind='charge'
                            AND e.organization_id=c.organization_id AND e.project_id=c.project_id
                            AND e.account_id=OLD.account_id AND e.currency=c.currency
                            AND e.amount_nanos=-c.amount_nanos
                    ))))) THEN
        RAISE EXCEPTION 'unposted customer liability cannot be released';
    END IF;
    RETURN NEW;
END;
$$;
