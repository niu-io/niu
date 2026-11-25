-- Permit underscore-separated payment method identifiers such as Stripe's
-- wechat_pay alongside existing alphanumeric, dot, and hyphen identifiers.

ALTER TABLE customer_topup_orders
    DROP CONSTRAINT customer_topup_orders_payment_method_check;
ALTER TABLE customer_topup_orders
    ADD CONSTRAINT customer_topup_orders_payment_method_check
    CHECK (payment_method ~ '^[A-Za-z0-9._-]{1,64}$');
