CREATE FUNCTION enforce_customer_media_debit_capacity() RETURNS TRIGGER AS $$
DECLARE funded BOOLEAN;
BEGIN
    IF NEW.kind<>'charge' OR NOT EXISTS (SELECT 1 FROM customer_media_charges WHERE attempt_id=NEW.attempt_id) THEN RETURN NEW; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR UPDATE;
    SELECT COALESCE((SELECT SUM(amount_nanos) FROM customer_balance_entries WHERE account_id=a.id),0)
        +a.credit_limit_nanos-COALESCE((SELECT SUM(amount_nanos) FROM customer_balance_reservations
            WHERE account_id=a.id AND released_at IS NULL AND attempt_id<>NEW.attempt_id),0)
        >=-NEW.amount_nanos INTO funded FROM customer_balance_accounts a WHERE a.id=NEW.account_id;
    IF funded IS DISTINCT FROM true THEN RAISE EXCEPTION 'media debit exceeds available approved capacity' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER enforce_customer_media_debit_capacity BEFORE INSERT ON customer_balance_entries
    FOR EACH ROW EXECUTE FUNCTION enforce_customer_media_debit_capacity();

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
            OR EXISTS (SELECT 1 FROM customer_charges c WHERE c.attempt_id=a.id)
            OR EXISTS (SELECT 1 FROM customer_media_charges c WHERE c.attempt_id=a.id
                AND (c.amount_nanos=0 OR EXISTS (SELECT 1 FROM customer_balance_entries e
                    WHERE e.attempt_id=c.attempt_id AND e.kind='charge'))))) THEN
        RAISE EXCEPTION 'unposted customer liability cannot be released';
    END IF;
    RETURN NEW;
END;
$$;
