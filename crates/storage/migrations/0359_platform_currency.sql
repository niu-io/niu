-- One installation currency. Historical records are never converted or relabeled.
CREATE TABLE platform_currency (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    configured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE FUNCTION niu_platform_currency_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Platform currency is configured once' USING ERRCODE='23514', CONSTRAINT='platform_currency_guard'; END $$;
CREATE TRIGGER platform_currency_immutable BEFORE UPDATE OR DELETE ON platform_currency
FOR EACH ROW EXECUTE FUNCTION niu_platform_currency_immutable();
CREATE TRIGGER platform_currency_no_truncate BEFORE TRUNCATE ON platform_currency
FOR EACH STATEMENT EXECUTE FUNCTION niu_platform_currency_immutable();

-- Restrict new configuration, not historical settlement/refund records.
CREATE FUNCTION niu_require_platform_currency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE configured TEXT; supplied TEXT;
BEGIN
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('niu-platform-currency',0));
    SELECT currency INTO configured FROM platform_currency WHERE singleton;
    -- Existing installations may continue operating until an administrator completes setup.
    IF configured IS NULL THEN RETURN NEW; END IF;
    supplied := CASE WHEN TG_ARGV[0]='document' THEN to_jsonb(NEW)->'document'->'tariff'->>'currency' ELSE to_jsonb(NEW)->>'currency' END;
    IF supplied IS DISTINCT FROM configured THEN
        RAISE EXCEPTION 'Use the configured platform currency %', configured USING ERRCODE='23514', CONSTRAINT='platform_currency_guard';
    END IF;
    RETURN NEW;
END $$;
DO $$ DECLARE resource TEXT; BEGIN
    FOREACH resource IN ARRAY ARRAY['customer_balance_accounts','customer_topup_orders','customer_balance_grants','provider_offer_revisions','customer_tariff_revisions','platform_retail_price_heads','customer_workspace_spending_limits','customer_key_spending_limits'] LOOP
        EXECUTE format('CREATE TRIGGER platform_currency_guard BEFORE INSERT OR UPDATE OF currency ON %I FOR EACH ROW EXECUTE FUNCTION niu_require_platform_currency()',resource);
    END LOOP;
    FOREACH resource IN ARRAY ARRAY['customer_media_rate_cards','supplier_media_rate_cards'] LOOP
        EXECUTE format('CREATE TRIGGER platform_currency_guard BEFORE INSERT OR UPDATE OF document ON %I FOR EACH ROW EXECUTE FUNCTION niu_require_platform_currency(''document'')',resource);
    END LOOP;
END $$;
