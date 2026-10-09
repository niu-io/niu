-- Classic EPay supplies its provider reference only after checkout.
-- A checkout is an immutable merchant-order artifact, never payment evidence.
ALTER TABLE customer_topup_checkout DROP CONSTRAINT customer_topup_checkout_order_id_fkey;
ALTER TABLE customer_topup_checkout ADD CONSTRAINT customer_topup_checkout_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES customer_topup_orders(id);

CREATE FUNCTION require_checkout_payment_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM customer_topup_orders o WHERE o.id=NEW.order_id
        AND (o.aggregator='epay' OR EXISTS
            (SELECT 1 FROM customer_topup_provider_orders p WHERE p.order_id=o.id))) THEN
        RAISE EXCEPTION 'checkout requires a saved payment identity';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER require_checkout_payment_identity BEFORE INSERT ON customer_topup_checkout
    FOR EACH ROW EXECUTE FUNCTION require_checkout_payment_identity();
