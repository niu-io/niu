-- Never-dispatched intent is durable proof of no upstream liability.
CREATE OR REPLACE FUNCTION protect_customer_balance_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
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
        AND (a.execution IN ('not_sent', 'confirmed_not_executed')
            OR EXISTS (SELECT 1 FROM customer_charges c WHERE c.attempt_id = a.id))
    ) THEN
        RAISE EXCEPTION 'uncertain customer liability cannot be released';
    END IF;
    RETURN NEW;
END;
$$;
