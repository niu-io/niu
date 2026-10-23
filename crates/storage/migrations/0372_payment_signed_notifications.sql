-- Native ZhifuX acknowledges signed notification before its independent query
-- settles the order. Preserve that configuration-bound receipt in either order.
CREATE TABLE payment_signed_notifications (
    order_id uuid PRIMARY KEY REFERENCES payment_checkout_verification(order_id),
    received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_payment_signed_notifications BEFORE UPDATE OR DELETE
    ON payment_signed_notifications FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
