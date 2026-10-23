-- Capture effective configuration before checkout creation. Existing orders are
-- deliberately not backfilled: their original configuration cannot be proven.
CREATE TABLE payment_checkout_verification (
    order_id uuid PRIMARY KEY REFERENCES customer_topup_orders(id),
    gateway text NOT NULL CHECK (gateway IN ('stripe', 'epay', 'zhifux')),
    configuration_digest bytea NOT NULL CHECK (octet_length(configuration_digest) = 32),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_payment_checkout_verification BEFORE UPDATE OR DELETE
    ON payment_checkout_verification FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE INDEX payment_checkout_verification_configuration
    ON payment_checkout_verification(gateway, configuration_digest, order_id);

-- A signed callback qualifies only an independently settled, configuration-bound
-- checkout. Replaying it cannot refresh its original receipt time.
CREATE TABLE payment_callback_verification (
    order_id uuid PRIMARY KEY REFERENCES payment_checkout_verification(order_id),
    FOREIGN KEY (order_id) REFERENCES customer_topup_settlements(order_id),
    verified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_payment_callback_verification BEFORE UPDATE OR DELETE
    ON payment_callback_verification FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
