CREATE TABLE codex_usage_imports (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    source_format TEXT NOT NULL CHECK (source_format = 'codex-rollout-jsonl-token_usage_record-v1'),
    collector_version TEXT NOT NULL CHECK (char_length(collector_version) BETWEEN 1 AND 40),
    codex_versions TEXT[] NOT NULL DEFAULT '{}',
    selected_file_count SMALLINT NOT NULL CHECK (selected_file_count BETWEEN 1 AND 20),
    state TEXT NOT NULL DEFAULT 'receiving' CHECK (state IN ('receiving', 'complete', 'partial')),
    scanned_line_count BIGINT CHECK (scanned_line_count IS NULL OR scanned_line_count >= 0),
    malformed_line_count BIGINT CHECK (malformed_line_count IS NULL OR malformed_line_count >= 0),
    skipped_usage_count BIGINT CHECK (skipped_usage_count IS NULL OR skipped_usage_count >= 0),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    UNIQUE (organization_id, project_id, id)
);

CREATE TABLE codex_usage_responses (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    import_id UUID NOT NULL,
    response_key BYTEA NOT NULL CHECK (octet_length(response_key) = 32),
    occurred_at TIMESTAMPTZ NOT NULL,
    model_provider TEXT CHECK (model_provider IS NULL OR char_length(model_provider) BETWEEN 1 AND 100),
    model TEXT CHECK (model IS NULL OR char_length(model) BETWEEN 1 AND 200),
    input_tokens BIGINT NOT NULL CHECK (input_tokens >= 0),
    cached_input_tokens BIGINT NOT NULL CHECK (cached_input_tokens >= 0 AND cached_input_tokens <= input_tokens),
    cache_write_input_tokens BIGINT CHECK (cache_write_input_tokens IS NULL OR cache_write_input_tokens >= 0),
    output_tokens BIGINT NOT NULL CHECK (output_tokens >= 0),
    reasoning_output_tokens BIGINT CHECK (reasoning_output_tokens IS NULL OR reasoning_output_tokens >= 0),
    api_equivalent_usd_nanos BIGINT CHECK (api_equivalent_usd_nanos IS NULL OR api_equivalent_usd_nanos >= 0),
    rate_snapshot JSONB CHECK (rate_snapshot IS NULL OR jsonb_typeof(rate_snapshot) = 'object'),
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, project_id, response_key),
    FOREIGN KEY (organization_id, project_id, import_id)
        REFERENCES codex_usage_imports(organization_id, project_id, id) ON DELETE CASCADE,
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    CHECK (cache_write_input_tokens IS NULL OR cache_write_input_tokens <= input_tokens - cached_input_tokens),
    CHECK (reasoning_output_tokens IS NULL OR reasoning_output_tokens <= output_tokens)
);

CREATE INDEX codex_usage_responses_by_period
    ON codex_usage_responses(organization_id, project_id, occurred_at);

CREATE TABLE codex_usage_fee_settings (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    period_from_ms BIGINT NOT NULL CHECK (period_from_ms >= 0),
    period_to_ms BIGINT NOT NULL CHECK (period_to_ms > period_from_ms),
    subscription_fee_usd_cents BIGINT NOT NULL CHECK (subscription_fee_usd_cents >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, project_id),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id)
);
