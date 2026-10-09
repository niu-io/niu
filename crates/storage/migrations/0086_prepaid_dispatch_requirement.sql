-- Defense in depth for every adapter, including batched unpriced admission.
CREATE FUNCTION require_customer_balance_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    END IF;
    -- Funding/account activation takes an organization update lock. Admission
    -- holds a shared lock until commit so activation cannot race this check.
    PERFORM id FROM organizations WHERE id=NEW.organization_id FOR SHARE;
    IF EXISTS (SELECT 1 FROM customer_balance_accounts WHERE organization_id=NEW.organization_id)
        AND NOT EXISTS (SELECT 1 FROM customer_balance_reservations
            WHERE attempt_id=NEW.id AND organization_id=NEW.organization_id AND released_at IS NULL)
        AND NOT EXISTS (
            SELECT 1 FROM customer_attempt_tariffs t
            JOIN customer_tariff_revisions r ON r.id=t.revision_id
            JOIN customer_attempt_balance_accounts b ON b.attempt_id=t.attempt_id AND b.currency=r.currency
            WHERE t.attempt_id=NEW.id AND b.organization_id=NEW.organization_id
                AND r.prompt_rate=0 AND r.completion_rate=0
        ) THEN
        RAISE EXCEPTION 'prepaid dispatch requires a funded retail reservation' USING ERRCODE='P0009';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_customer_balance_dispatch BEFORE INSERT OR UPDATE OF execution ON attempts
    FOR EACH ROW EXECUTE FUNCTION require_customer_balance_dispatch();
