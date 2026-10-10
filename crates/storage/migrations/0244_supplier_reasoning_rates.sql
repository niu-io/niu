-- Independent Supplier rates; reasoning remains a subset of total output.
ALTER TABLE provider_offer_revisions ADD COLUMN reasoning_completion_rate BIGINT
    CHECK (reasoning_completion_rate BETWEEN 0 AND 1000000000000000);
ALTER TABLE provider_earnings ADD COLUMN reasoning_completion_tokens BIGINT
    CHECK (reasoning_completion_tokens >= 0 AND reasoning_completion_tokens <= completion_tokens);
