ALTER TABLE customer_attempt_balance_accounts
    ADD UNIQUE (attempt_id, organization_id, account_id, currency);
ALTER TABLE customer_balance_reservations
    ADD FOREIGN KEY (attempt_id, organization_id, account_id, currency)
        REFERENCES customer_attempt_balance_accounts(attempt_id, organization_id, account_id, currency);

CREATE FUNCTION protect_customer_balance_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'customer reservations cannot be deleted';
    END IF;
    IF ROW(NEW.attempt_id, NEW.organization_id, NEW.account_id, NEW.currency, NEW.amount_nanos, NEW.created_at)
        IS DISTINCT FROM ROW(OLD.attempt_id, OLD.organization_id, OLD.account_id, OLD.currency, OLD.amount_nanos, OLD.created_at)
        OR OLD.released_at IS NOT NULL OR NEW.released_at IS NULL THEN
        RAISE EXCEPTION 'only a terminal reservation release is permitted';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM attempts a WHERE a.id = OLD.attempt_id
        AND (a.execution = 'confirmed_not_executed'
            OR EXISTS (SELECT 1 FROM customer_charges c WHERE c.attempt_id = a.id))
    ) THEN
        RAISE EXCEPTION 'uncertain customer liability cannot be released';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_customer_balance_reservation BEFORE UPDATE OR DELETE ON customer_balance_reservations
    FOR EACH ROW EXECUTE FUNCTION protect_customer_balance_reservation();
