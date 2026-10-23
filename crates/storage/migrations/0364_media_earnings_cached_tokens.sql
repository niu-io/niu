-- Cached text tokens are optional. A NULL count on a media earning must not
-- evaluate to FALSE merely because its meter is not text_tokens.
-- Non-NULL cached counts still require text usage and remain a prompt subset.
ALTER TABLE provider_earnings DROP CONSTRAINT provider_earnings_check;
ALTER TABLE provider_earnings ADD CONSTRAINT provider_cached_prompt_tokens_shape
    CHECK (cached_prompt_tokens IS NULL OR (
        billing_meter = 'text_tokens'
        AND cached_prompt_tokens >= 0
        AND cached_prompt_tokens <= prompt_tokens
    ));
