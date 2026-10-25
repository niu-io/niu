-- Explicit Credits prices, never reinterpret a monetary price or a purchase
-- conversion as a consumption tariff. Publications share the installation CAS.
CREATE TABLE customer_unit_text_tariffs (
    revision BIGINT PRIMARY KEY CHECK (revision > 0),
    expected_revision BIGINT NOT NULL CHECK (expected_revision >= 0 AND revision=expected_revision+1),
    definition_revision BIGINT NOT NULL REFERENCES customer_unit_definitions(revision),
    model_alias TEXT NOT NULL CHECK (char_length(model_alias) BETWEEN 1 AND 200
        AND model_alias=btrim(model_alias) AND model_alias !~ '[[:cntrl:]]'),
    price JSONB NOT NULL CHECK (jsonb_typeof(price)='object'),
    idempotency_key UUID NOT NULL UNIQUE,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((actor_kind='operator')=(actor_operator_id IS NOT NULL))
);
CREATE INDEX customer_unit_text_tariff_current ON customer_unit_text_tariffs(model_alias,revision DESC);
CREATE TRIGGER immutable_customer_unit_text_tariff BEFORE UPDATE OR DELETE ON customer_unit_text_tariffs
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
