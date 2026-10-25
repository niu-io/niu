-- Versioned branded-unit configuration only. This migration does not enable
-- Credits, convert balances, issue units or change a monetary tariff.
CREATE TABLE customer_unit_configuration (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO customer_unit_configuration(singleton) VALUES (TRUE);

CREATE TABLE customer_unit_definitions (
    revision BIGINT PRIMARY KEY CHECK (revision > 0),
    expected_revision BIGINT NOT NULL CHECK (expected_revision >= 0 AND revision = expected_revision + 1),
    idempotency_key UUID NOT NULL UNIQUE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80 AND name = btrim(name)
        AND name !~ '[[:cntrl:]]'),
    display_precision SMALLINT NOT NULL CHECK (display_precision BETWEEN 0 AND 9),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((actor_kind = 'operator') = (actor_operator_id IS NOT NULL))
);
CREATE TRIGGER immutable_customer_unit_definition
    BEFORE UPDATE OR DELETE ON customer_unit_definitions
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE TABLE customer_unit_purchase_rules (
    revision BIGINT PRIMARY KEY CHECK (revision > 0),
    expected_revision BIGINT NOT NULL CHECK (expected_revision >= 0 AND revision = expected_revision + 1),
    idempotency_key UUID NOT NULL UNIQUE,
    definition_revision BIGINT NOT NULL REFERENCES customer_unit_definitions(revision),
    payment_currency TEXT NOT NULL CHECK (payment_currency ~ '^[A-Z]{3}$'),
    numerator BIGINT NOT NULL CHECK (numerator > 0),
    denominator BIGINT NOT NULL CHECK (denominator > 0),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((actor_kind = 'operator') = (actor_operator_id IS NOT NULL))
);
CREATE INDEX customer_unit_rules_current
    ON customer_unit_purchase_rules(definition_revision, payment_currency, revision DESC);
CREATE TRIGGER immutable_customer_unit_purchase_rule
    BEFORE UPDATE OR DELETE ON customer_unit_purchase_rules
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
