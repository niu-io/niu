CREATE TABLE payment_gateway_configuration (
    gateway TEXT PRIMARY KEY CHECK (gateway = 'epay'),
    revision BIGINT NOT NULL CHECK (revision > 0),
    ciphertext BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payment_gateway_configuration_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gateway TEXT NOT NULL,
    revision BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_payment_gateway_configuration_events BEFORE UPDATE OR DELETE ON payment_gateway_configuration_events FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
