CREATE TABLE customer_media_charges (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos>=0),
    bound_exceeded BOOLEAN NOT NULL,
    explanation JSONB NOT NULL CHECK (jsonb_typeof(explanation)='object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id,project_id,attempt_id)
        REFERENCES customer_media_attempt_pricing(organization_id,project_id,attempt_id),
    FOREIGN KEY (attempt_id) REFERENCES customer_media_liability_bounds(attempt_id),
    UNIQUE (organization_id,project_id,attempt_id)
);
CREATE TRIGGER immutable_customer_media_charge BEFORE UPDATE OR DELETE ON customer_media_charges
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- Preserve the shared ledger's charge kind and tenant scope; validate the exact
-- source charge instead of requiring every model to have text-token billing.
DO $$
DECLARE old_constraint TEXT;
BEGIN
    SELECT conname INTO STRICT old_constraint FROM pg_constraint
        WHERE conrelid='customer_balance_entries'::regclass
        AND confrelid='customer_charges'::regclass AND contype='f';
    EXECUTE format('ALTER TABLE customer_balance_entries DROP CONSTRAINT %I',old_constraint);
END;
$$;
ALTER TABLE customer_balance_entries ADD FOREIGN KEY (organization_id,project_id,attempt_id)
    REFERENCES attempts(organization_id,project_id,id);
CREATE FUNCTION validate_customer_charge_ledger_source() RETURNS TRIGGER AS $$
DECLARE sources BIGINT;
BEGIN
    IF NEW.kind <> 'charge' THEN RETURN NEW; END IF;
    SELECT count(*) INTO sources FROM (
        SELECT organization_id,project_id,attempt_id,currency,amount_nanos FROM customer_charges
        UNION ALL
        SELECT organization_id,project_id,attempt_id,currency,amount_nanos FROM customer_media_charges
    ) c WHERE c.organization_id=NEW.organization_id AND c.project_id=NEW.project_id
        AND c.attempt_id=NEW.attempt_id AND c.currency=NEW.currency
        AND c.amount_nanos>0 AND NEW.amount_nanos=-c.amount_nanos;
    IF sources <> 1 THEN RAISE EXCEPTION 'customer debit requires one exact charge' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER validate_customer_charge_ledger_source BEFORE INSERT ON customer_balance_entries
    FOR EACH ROW EXECUTE FUNCTION validate_customer_charge_ledger_source();

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
            OR EXISTS (SELECT 1 FROM customer_media_charges c WHERE c.attempt_id=a.id))) THEN
        RAISE EXCEPTION 'uncertain customer liability cannot be released';
    END IF;
    RETURN NEW;
END;
$$;

ALTER TABLE customer_balance_reservations ADD UNIQUE (attempt_id,amount_nanos);
ALTER TABLE customer_media_liability_bounds ADD FOREIGN KEY (attempt_id,maximum_nanos)
    REFERENCES customer_balance_reservations(attempt_id,amount_nanos);
