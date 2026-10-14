-- Explicit retail discounts are new revisions. Existing prices and operation
-- bindings are unchanged; the referenced original revision remains immutable.
ALTER TABLE customer_tariff_revisions ADD COLUMN discount_baseline_revision UUID
    REFERENCES customer_tariff_revisions(id);

-- Shared publication and database-boundary validation. Category and context
-- shapes stay identical, so a discount cannot change usage interpretation or
-- become a price increase for a previously supported token category.
CREATE FUNCTION niu_customer_discount_valid(baseline UUID, model TEXT, currency_code TEXT, rates JSONB)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
SELECT COALESCE((
    SELECT r.discount_baseline_revision IS NULL
       AND t.model_alias=model AND r.currency=currency_code
       AND NOT EXISTS (
           SELECT 1 FROM unnest(ARRAY['prompt_rate','completion_rate','cached_prompt_rate',
               'cache_write_prompt_rate','reasoning_completion_rate',
               'minimum_charge_nanos','request_fee_nanos']) field
           WHERE ((rates->>field) IS NULL) <> ((to_jsonb(r)->>field) IS NULL)
              OR (rates->>field)::numeric > (to_jsonb(r)->>field)::numeric
       )
       AND jsonb_array_length(r.context_tiers)=jsonb_array_length(rates->'context_tiers')
       AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(r.context_tiers) WITH ORDINALITY original(value,idx)
           FULL JOIN jsonb_array_elements(rates->'context_tiers') WITH ORDINALITY discounted(value,idx)
               USING(idx)
           WHERE original.value->>'minimum_input_tokens' IS DISTINCT FROM discounted.value->>'minimum_input_tokens'
              OR EXISTS (
                  SELECT 1 FROM unnest(ARRAY['prompt_rate','completion_rate','cached_prompt_rate',
                      'cache_write_prompt_rate','reasoning_completion_rate']) field
                  WHERE ((original.value->>field) IS NULL) <> ((discounted.value->>field) IS NULL)
                     OR (discounted.value->>field)::numeric > (original.value->>field)::numeric
              )
       )
    FROM customer_tariff_revisions r JOIN customer_tariffs t ON t.id=r.tariff_id
    WHERE r.id=baseline
), FALSE);
$$;

CREATE FUNCTION protect_customer_discount_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE alias TEXT;
BEGIN
    IF NEW.discount_baseline_revision IS NOT NULL THEN
        SELECT model_alias INTO STRICT alias FROM customer_tariffs WHERE id=NEW.tariff_id;
        IF NOT niu_customer_discount_valid(NEW.discount_baseline_revision,alias,NEW.currency,to_jsonb(NEW)) THEN
            RAISE EXCEPTION 'Discount baseline or resulting rates conflict' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_discount_revision BEFORE INSERT ON customer_tariff_revisions
    FOR EACH ROW EXECUTE FUNCTION protect_customer_discount_revision();
