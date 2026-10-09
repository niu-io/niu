-- Only verified notification receipt, never paid state or unsigned payload.
CREATE TABLE customer_topup_notifications (
    order_id UUID PRIMARY KEY REFERENCES customer_topup_orders(id),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_customer_topup_notification BEFORE UPDATE OR DELETE ON customer_topup_notifications
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
