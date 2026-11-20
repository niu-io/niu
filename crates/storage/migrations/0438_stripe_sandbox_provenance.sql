-- Stripe binds test-mode Checkout Sessions to a cs_test_ reference.
CREATE FUNCTION niu_simulated_payment(channel text, reference text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
    SELECT channel = 'stripe:NiuMockPayments' OR
        (starts_with(channel, 'stripe:') AND starts_with(COALESCE(reference, ''), 'cs_test_'));
$$;

CREATE OR REPLACE FUNCTION validate_customer_unit_purchase_lot() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.order_id IS NULL THEN RETURN NEW; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM customer_unit_topups t
        JOIN customer_topup_orders o ON o.id=t.order_id
        JOIN customer_unit_purchase_quotes q ON q.id=t.quote_id
        JOIN customer_unit_purchase_rules r ON r.revision=q.rule_revision
        WHERE t.order_id=NEW.order_id AND t.organization_id=NEW.organization_id
            AND q.credit_atoms=NEW.credit_atoms AND r.definition_revision=NEW.definition_revision
            AND q.payment_currency=NEW.payment_currency AND q.payment_nanos=NEW.payment_nanos
            AND NEW.provenance=CASE WHEN niu_simulated_payment(o.aggregator || ':' || o.merchant,
                (SELECT platform_reference FROM customer_topup_provider_orders WHERE order_id=o.id))
                THEN 'simulated' ELSE 'purchased' END
    ) THEN
        RAISE EXCEPTION 'Credits lot must match its original quote and immutable payment provenance'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
