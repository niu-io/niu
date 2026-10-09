CREATE TABLE request_token_categories (
    attempt_id uuid PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
    cached_input_tokens bigint CHECK (cached_input_tokens >= 0),
    reasoning_output_tokens bigint CHECK (reasoning_output_tokens >= 0),
    CHECK (cached_input_tokens IS NOT NULL OR reasoning_output_tokens IS NOT NULL)
);
