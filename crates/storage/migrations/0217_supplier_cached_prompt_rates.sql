-- Supplier payout rates are independent from customer tariffs and route budgets.
ALTER TABLE provider_offer_revisions ADD COLUMN cached_prompt_rate BIGINT
    CHECK (cached_prompt_rate BETWEEN 0 AND 1000000000000000);
ALTER TABLE provider_offer_revisions ADD CONSTRAINT supplier_cached_rate_text_only
    CHECK (cached_prompt_rate IS NULL OR rate_kind = 'text');
ALTER TABLE provider_earnings ADD COLUMN cached_prompt_tokens BIGINT
    CHECK (cached_prompt_tokens >= 0 AND cached_prompt_tokens <= prompt_tokens
        AND billing_meter = 'text_tokens');
