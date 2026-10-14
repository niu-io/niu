-- Platform selling configuration, independent of confidential Supplier quotes.
-- Existing workspace prices, operation bindings and financial entries are untouched.
CREATE TABLE platform_retail_price_heads (
    id UUID PRIMARY KEY,
    model_alias TEXT NOT NULL CHECK (length(model_alias) BETWEEN 1 AND 200 AND model_alias=trim(model_alias)),
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    rate_kind TEXT NOT NULL CHECK (rate_kind IN ('text','media')),
    dimensions JSONB NOT NULL CHECK (jsonb_typeof(dimensions)='object'),
    meter TEXT NOT NULL,
    version BIGINT NOT NULL DEFAULT 0 CHECK (version>=0),
    current_revision UUID,
    UNIQUE(model_alias,currency,rate_kind,dimensions,meter),
    CHECK ((rate_kind='text' AND dimensions='{}'::jsonb AND meter='')
        OR (rate_kind='media' AND dimensions->>'model' IS NOT DISTINCT FROM model_alias AND length(meter) BETWEEN 1 AND 256))
);
CREATE TABLE platform_retail_price_changes (
    id UUID PRIMARY KEY,
    head_id UUID NOT NULL REFERENCES platform_retail_price_heads(id),
    version BIGINT NOT NULL CHECK (version>0),
    action TEXT NOT NULL CHECK (action IN ('standard_published','promotion_published','promotion_retired')),
    idempotency_key UUID NOT NULL UNIQUE,
    intent JSONB NOT NULL CHECK (jsonb_typeof(intent)='object'),
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500 AND reason=trim(reason) AND reason !~ '[[:cntrl:]]'),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(head_id,version),
    UNIQUE(head_id,id),
    CHECK ((actor_kind='installation' AND actor_operator_id IS NULL)
        OR (actor_kind='operator' AND actor_operator_id IS NOT NULL))
);
CREATE TABLE platform_retail_standard_revisions (
    id UUID PRIMARY KEY,
    head_id UUID NOT NULL,
    schedule JSONB NOT NULL CHECK (jsonb_typeof(schedule)='object'),
    FOREIGN KEY(head_id,id) REFERENCES platform_retail_price_changes(head_id,id),
    UNIQUE(head_id,id)
);
ALTER TABLE platform_retail_price_heads ADD FOREIGN KEY(id,current_revision)
    REFERENCES platform_retail_standard_revisions(head_id,id);
CREATE TABLE platform_retail_promotions (
    id UUID PRIMARY KEY,
    head_id UUID NOT NULL,
    baseline_revision UUID NOT NULL,
    customer_organization_id UUID REFERENCES organizations(id),
    effective_from BIGINT NOT NULL CHECK (effective_from BETWEEN 0 AND 253402300799),
    effective_until BIGINT NOT NULL CHECK (effective_until BETWEEN 1 AND 253402300799 AND effective_until>effective_from),
    schedule JSONB NOT NULL CHECK (jsonb_typeof(schedule)='object'),
    FOREIGN KEY(head_id,id) REFERENCES platform_retail_price_changes(head_id,id),
    FOREIGN KEY(head_id,baseline_revision) REFERENCES platform_retail_standard_revisions(head_id,id),
    UNIQUE(head_id,id)
);
CREATE INDEX platform_retail_promotion_selection ON platform_retail_promotions
    (head_id,customer_organization_id,effective_from,effective_until);
CREATE TABLE platform_retail_promotion_retirements (
    id UUID PRIMARY KEY,
    head_id UUID NOT NULL,
    promotion_id UUID NOT NULL UNIQUE,
    effective_until BIGINT NOT NULL CHECK (effective_until BETWEEN 0 AND 253402300799),
    FOREIGN KEY(head_id,id) REFERENCES platform_retail_price_changes(head_id,id),
    FOREIGN KEY(head_id,promotion_id) REFERENCES platform_retail_promotions(head_id,id)
);
-- One publication serialization lock per price identity; retirement never extends
-- published terms, nor changes already materialized request prices.
CREATE FUNCTION protect_platform_retail_price_head() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' OR ROW(NEW.id,NEW.model_alias,NEW.currency,NEW.rate_kind,NEW.dimensions,NEW.meter)
        IS DISTINCT FROM ROW(OLD.id,OLD.model_alias,OLD.currency,OLD.rate_kind,OLD.dimensions,OLD.meter)
        OR NEW.version<>OLD.version+1 THEN
        RAISE EXCEPTION 'Retail identity is immutable; configuration requires a new version' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_platform_retail_price_head BEFORE UPDATE OR DELETE ON platform_retail_price_heads
    FOR EACH ROW EXECUTE FUNCTION protect_platform_retail_price_head();

-- Compare canonical schedules; no floating-point ratios or changed usage meaning.
CREATE FUNCTION niu_retail_discount_valid(original JSONB,result JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE field TEXT; old_tier JSONB; new_tier JSONB; idx INTEGER;
BEGIN
    IF original->>'kind'='media' THEN
        RETURN (result-'amount_units')=(original-'amount_units')
            AND result->>'amount_units' ~ '^[0-9]+$'
            AND (result->>'amount_units')::numeric <= (original->>'amount_units')::numeric;
    END IF;
    IF original->>'kind' IS DISTINCT FROM 'text' OR result->>'kind' IS DISTINCT FROM 'text'
        OR (result-ARRAY['prompt_rate','completion_rate','cached_prompt_rate','cache_write_prompt_rate',
            'reasoning_completion_rate','minimum_charge_nanos','request_fee_nanos','context_tiers'])
            IS DISTINCT FROM (original-ARRAY['prompt_rate','completion_rate','cached_prompt_rate','cache_write_prompt_rate',
            'reasoning_completion_rate','minimum_charge_nanos','request_fee_nanos','context_tiers'])
        OR jsonb_typeof(result->'context_tiers') IS DISTINCT FROM 'array'
        OR jsonb_array_length(result->'context_tiers')<>jsonb_array_length(original->'context_tiers') THEN
        RETURN FALSE;
    END IF;
    FOREACH field IN ARRAY ARRAY['prompt_rate','completion_rate','cached_prompt_rate','cache_write_prompt_rate',
        'reasoning_completion_rate','minimum_charge_nanos','request_fee_nanos'] LOOP
        IF NOT result ? field OR jsonb_typeof(result->field) IS DISTINCT FROM jsonb_typeof(original->field)
            OR ((result->>field) IS NOT NULL AND ((result->>field) !~ '^[0-9]+$'
                OR (result->>field)::numeric>(original->>field)::numeric)) THEN RETURN FALSE; END IF;
    END LOOP;
    FOR idx IN 0..jsonb_array_length(original->'context_tiers')-1 LOOP
        old_tier:=original->'context_tiers'->idx; new_tier:=result->'context_tiers'->idx;
        IF (new_tier-ARRAY['prompt_rate','completion_rate','cached_prompt_rate','cache_write_prompt_rate','reasoning_completion_rate'])
            IS DISTINCT FROM (old_tier-ARRAY['prompt_rate','completion_rate','cached_prompt_rate','cache_write_prompt_rate','reasoning_completion_rate']) THEN RETURN FALSE; END IF;
        FOREACH field IN ARRAY ARRAY['prompt_rate','completion_rate','cached_prompt_rate','cache_write_prompt_rate','reasoning_completion_rate'] LOOP
            IF NOT new_tier ? field OR jsonb_typeof(new_tier->field) IS DISTINCT FROM jsonb_typeof(old_tier->field)
                OR ((new_tier->>field) IS NOT NULL AND ((new_tier->>field) !~ '^[0-9]+$'
                    OR (new_tier->>field)::numeric>(old_tier->>field)::numeric)) THEN RETURN FALSE; END IF;
        END LOOP;
    END LOOP;
    RETURN TRUE;
END;
$$;
CREATE FUNCTION validate_platform_retail_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE identity platform_retail_price_heads%ROWTYPE; event TEXT; baseline JSONB; cutoff BIGINT;
BEGIN
    SELECT * INTO STRICT identity FROM platform_retail_price_heads WHERE id=NEW.head_id FOR NO KEY UPDATE;
    SELECT action INTO STRICT event FROM platform_retail_price_changes WHERE id=NEW.id AND head_id=NEW.head_id;
    IF TG_TABLE_NAME='platform_retail_promotion_retirements' THEN
        SELECT effective_until INTO STRICT cutoff FROM platform_retail_promotions WHERE id=NEW.promotion_id AND head_id=NEW.head_id;
        IF event<>'promotion_retired' OR NEW.effective_until>cutoff THEN
            RAISE EXCEPTION 'Retail retirement must shorten an existing promotion' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.schedule->>'kind' IS DISTINCT FROM identity.rate_kind
        OR (identity.rate_kind='media' AND (NEW.schedule->'dimensions' IS DISTINCT FROM identity.dimensions
            OR NEW.schedule->>'meter' IS DISTINCT FROM identity.meter)) THEN
        RAISE EXCEPTION 'Retail schedule identity conflicts' USING ERRCODE='23514';
    END IF;
    IF TG_TABLE_NAME='platform_retail_standard_revisions' THEN
        IF event<>'standard_published' THEN RAISE EXCEPTION 'Expected standard publication' USING ERRCODE='23514'; END IF;
    ELSE
        SELECT schedule INTO STRICT baseline FROM platform_retail_standard_revisions WHERE id=NEW.baseline_revision AND head_id=NEW.head_id;
        IF event<>'promotion_published' OR NOT COALESCE(niu_retail_discount_valid(baseline,NEW.schedule),FALSE)
            OR EXISTS(SELECT 1 FROM platform_retail_promotions prior
                LEFT JOIN platform_retail_promotion_retirements retired ON retired.promotion_id=prior.id
                WHERE prior.head_id=NEW.head_id AND prior.customer_organization_id IS NOT DISTINCT FROM NEW.customer_organization_id
                    AND prior.effective_from<LEAST(prior.effective_until,COALESCE(retired.effective_until,prior.effective_until))
                    AND NEW.effective_from<LEAST(prior.effective_until,COALESCE(retired.effective_until,prior.effective_until))
                    AND prior.effective_from<NEW.effective_until) THEN
            RAISE EXCEPTION 'Retail discount or effective period conflicts' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_platform_retail_standard BEFORE INSERT ON platform_retail_standard_revisions
    FOR EACH ROW EXECUTE FUNCTION validate_platform_retail_revision();
CREATE TRIGGER validate_platform_retail_promotion BEFORE INSERT ON platform_retail_promotions
    FOR EACH ROW EXECUTE FUNCTION validate_platform_retail_revision();
CREATE TRIGGER validate_platform_retail_retirement BEFORE INSERT ON platform_retail_promotion_retirements
    FOR EACH ROW EXECUTE FUNCTION validate_platform_retail_revision();
CREATE TRIGGER immutable_platform_retail_change BEFORE UPDATE OR DELETE ON platform_retail_price_changes
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_platform_retail_standard BEFORE UPDATE OR DELETE ON platform_retail_standard_revisions
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_platform_retail_promotion BEFORE UPDATE OR DELETE ON platform_retail_promotions
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_platform_retail_retirement BEFORE UPDATE OR DELETE ON platform_retail_promotion_retirements
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
