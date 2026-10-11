-- Supplemental evidence preserves the original completion rather than rewriting history.
CREATE TABLE openrouter_usage_reconciliations (
    attempt_id UUID PRIMARY KEY REFERENCES openrouter_generation_references(attempt_id),
    prompt_tokens BIGINT NOT NULL CHECK (prompt_tokens >= 0),
    completion_tokens BIGINT NOT NULL CHECK (completion_tokens >= 0),
    cached_input_tokens BIGINT CHECK (cached_input_tokens BETWEEN 0 AND prompt_tokens),
    reasoning_output_tokens BIGINT CHECK (reasoning_output_tokens BETWEEN 0 AND completion_tokens),
    provider_model TEXT NOT NULL,
    original_state JSONB NOT NULL CHECK (jsonb_typeof(original_state) = 'object'),
    source_version TEXT NOT NULL DEFAULT 'openrouter-native-generation-v1'
        CHECK (source_version = 'openrouter-native-generation-v1'),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);
CREATE TRIGGER immutable_openrouter_usage_reconciliation
    BEFORE UPDATE OR DELETE ON openrouter_usage_reconciliations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
