-- A saved quote does not issue units, settle a payment or enable Credits mode.
CREATE TABLE customer_unit_purchase_quotes (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    idempotency_key UUID NOT NULL,
    rule_revision BIGINT NOT NULL REFERENCES customer_unit_purchase_rules(revision),
    payment_currency TEXT NOT NULL CHECK (payment_currency ~ '^[A-Z]{3}$'),
    payment_nanos BIGINT NOT NULL CHECK (payment_nanos > 0),
    credit_atoms BIGINT NOT NULL CHECK (credit_atoms > 0),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (statement_timestamp() + INTERVAL '15 minutes'),
    UNIQUE (organization_id, idempotency_key),
    UNIQUE (organization_id, id),
    CHECK (expires_at > created_at),
    CHECK ((actor_kind = 'operator') = (actor_operator_id IS NOT NULL))
);
CREATE INDEX customer_unit_quote_expiration ON customer_unit_purchase_quotes(expires_at);

CREATE FUNCTION validate_customer_unit_quote() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM customer_unit_purchase_rules r
        WHERE r.revision = NEW.rule_revision AND r.payment_currency = NEW.payment_currency
            AND NEW.payment_nanos::numeric * r.numerator::numeric
                = NEW.credit_atoms::numeric * r.denominator::numeric
    ) THEN
        RAISE EXCEPTION 'Credits quote must match its exact immutable purchase rule'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_quote BEFORE INSERT ON customer_unit_purchase_quotes
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_quote();
CREATE TRIGGER immutable_customer_unit_quote BEFORE UPDATE OR DELETE ON customer_unit_purchase_quotes
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
