ALTER TABLE customer_topup_checkout DROP CONSTRAINT customer_topup_checkout_checkout_url_check;
ALTER TABLE customer_topup_checkout ADD CONSTRAINT customer_topup_checkout_checkout_url_check
    CHECK (length(checkout_url) BETWEEN 1 AND 8192 AND checkout_url LIKE 'https://%');

CREATE FUNCTION require_adapter_checkout_url() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE adapter TEXT;
BEGIN
    SELECT aggregator INTO adapter FROM customer_topup_provider_orders WHERE order_id = NEW.order_id;
    IF adapter = 'stripe' THEN
        IF NEW.checkout_url !~ '^https://checkout[.]stripe[.]com/' THEN
            RAISE EXCEPTION 'Invalid checkout origin';
        END IF;
    ELSIF length(NEW.checkout_url) > 2048 OR position('#' IN NEW.checkout_url) > 0 THEN
        RAISE EXCEPTION 'Invalid checkout URL';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER adapter_checkout_url BEFORE INSERT ON customer_topup_checkout
    FOR EACH ROW EXECUTE FUNCTION require_adapter_checkout_url();
