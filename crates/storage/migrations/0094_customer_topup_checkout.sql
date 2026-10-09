-- A validated checkout response survives browser/device changes and restarts.
-- It grants no funds and cannot replace an earlier checkout identity.
CREATE TABLE customer_topup_checkout (
    order_id UUID PRIMARY KEY REFERENCES customer_topup_provider_orders(order_id),
    checkout_url TEXT NOT NULL CHECK (length(checkout_url) BETWEEN 1 AND 2048 AND checkout_url LIKE 'https://%'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_customer_topup_checkout BEFORE UPDATE OR DELETE ON customer_topup_checkout
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
