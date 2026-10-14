-- A known zero selling tariff has an exact zero customer liability. Preserve
-- account/attempt bindings, qualified usage bounds and dispatch guards without
-- inventing a positive monetary hold. No historical record is rewritten.
ALTER TABLE customer_balance_reservations
    DROP CONSTRAINT customer_balance_reservations_amount_nanos_check;
ALTER TABLE customer_balance_reservations
    ADD CONSTRAINT customer_balance_reservations_amount_nanos_check CHECK (amount_nanos >= 0);
ALTER TABLE customer_media_liability_bounds
    DROP CONSTRAINT customer_media_liability_bounds_maximum_nanos_check;
ALTER TABLE customer_media_liability_bounds
    ADD CONSTRAINT customer_media_liability_bounds_maximum_nanos_check CHECK (maximum_nanos >= 0);
