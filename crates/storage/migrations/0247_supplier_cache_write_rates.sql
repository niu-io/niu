ALTER TABLE provider_offer_revisions ADD COLUMN cache_write_prompt_rate BIGINT
    CHECK (cache_write_prompt_rate BETWEEN 0 AND 1000000000000000);
ALTER TABLE provider_earnings ADD COLUMN cache_write_prompt_tokens BIGINT
    CHECK (cache_write_prompt_tokens >= 0 AND cache_write_prompt_tokens <= prompt_tokens - COALESCE(cached_prompt_tokens,0));
