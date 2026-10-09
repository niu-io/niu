-- Closure requires independently verified provider identity. It is terminal,
-- immutable and mutually exclusive with funding, including concurrent writes.
ALTER TABLE customer_topup_provider_orders ADD CONSTRAINT customer_topup_bound_identity
    UNIQUE (order_id, platform_reference);
CREATE TABLE customer_topup_closures (
    order_id UUID PRIMARY KEY REFERENCES customer_topup_orders(id),
    platform_reference TEXT NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (order_id, platform_reference)
        REFERENCES customer_topup_provider_orders(order_id, platform_reference)
);
CREATE TRIGGER immutable_customer_topup_closure BEFORE UPDATE OR DELETE ON customer_topup_closures
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE FUNCTION guard_topup_terminal_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM id FROM customer_topup_orders WHERE id = NEW.order_id FOR UPDATE;
    IF TG_TABLE_NAME = 'customer_topup_closures' THEN
        IF EXISTS (SELECT 1 FROM customer_topup_settlements WHERE order_id = NEW.order_id) THEN
            RAISE EXCEPTION 'Payment already settled';
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM customer_topup_closures WHERE order_id = NEW.order_id) THEN
            RAISE EXCEPTION 'Payment already closed';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER guard_customer_topup_closure BEFORE INSERT ON customer_topup_closures
    FOR EACH ROW EXECUTE FUNCTION guard_topup_terminal_state();
CREATE TRIGGER guard_customer_topup_settlement BEFORE INSERT ON customer_topup_settlements
    FOR EACH ROW EXECUTE FUNCTION guard_topup_terminal_state();
