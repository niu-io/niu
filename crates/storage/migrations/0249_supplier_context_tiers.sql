-- Keep Supplier schedules and selections attached to immutable financial records.
ALTER TABLE provider_offer_revisions ADD COLUMN context_tiers JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(context_tiers) = 'array' AND jsonb_array_length(context_tiers) <= 32);
ALTER TABLE provider_earnings ADD COLUMN context_minimum_input_tokens BIGINT
    CHECK (context_minimum_input_tokens > 0 AND context_minimum_input_tokens <= prompt_tokens);
