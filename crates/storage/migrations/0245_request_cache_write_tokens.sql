-- Native Messages reports cache creation separately from ordinary input.
ALTER TABLE request_token_categories ADD COLUMN cache_write_input_tokens BIGINT
    CHECK (cache_write_input_tokens >= 0);
ALTER TABLE request_token_categories DROP CONSTRAINT request_token_categories_check;
ALTER TABLE request_token_categories ADD CONSTRAINT request_token_categories_check
    CHECK (cached_input_tokens IS NOT NULL OR reasoning_output_tokens IS NOT NULL OR cache_write_input_tokens IS NOT NULL);
