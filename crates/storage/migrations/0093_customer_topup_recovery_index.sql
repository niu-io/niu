CREATE INDEX customer_topup_orders_merchant_recovery
    ON customer_topup_orders(aggregator, merchant, id);
