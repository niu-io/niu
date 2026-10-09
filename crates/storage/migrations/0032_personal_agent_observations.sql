-- Personal agent observations never inherit a workspace's membership or API key.
CREATE TABLE agent_observation_sources (
    owner_id UUID NOT NULL REFERENCES admin_operators(id),
    source TEXT NOT NULL CHECK (source IN ('codex')),
    client_version TEXT NOT NULL CHECK (char_length(client_version) BETWEEN 1 AND 64),
    consent_version TEXT NOT NULL CHECK (consent_version = 'agent-token-observation-v1'),
    consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    paused BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (owner_id, source)
);
CREATE TABLE agent_observations (
    owner_id UUID NOT NULL,
    source TEXT NOT NULL,
    response_key BYTEA NOT NULL CHECK (octet_length(response_key) = 32),
    occurred_at TIMESTAMPTZ NOT NULL,
    model_provider TEXT,
    model TEXT,
    billing_mode TEXT NOT NULL CHECK (billing_mode IN ('subscription', 'api', 'unknown')),
    input_tokens BIGINT NOT NULL CHECK (input_tokens >= 0),
    cached_input_tokens BIGINT NOT NULL CHECK (cached_input_tokens BETWEEN 0 AND input_tokens),
    cache_write_input_tokens BIGINT CHECK (cache_write_input_tokens BETWEEN 0 AND input_tokens - cached_input_tokens),
    output_tokens BIGINT NOT NULL CHECK (output_tokens >= 0),
    reasoning_output_tokens BIGINT CHECK (reasoning_output_tokens BETWEEN 0 AND output_tokens),
    api_equivalent_usd_nanos BIGINT CHECK (api_equivalent_usd_nanos >= 0),
    rate_snapshot JSONB CHECK (jsonb_typeof(rate_snapshot) = 'object'),
    client_version TEXT NOT NULL,
    consent_version TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (owner_id, source, response_key),
    FOREIGN KEY (owner_id, source) REFERENCES agent_observation_sources(owner_id, source) ON DELETE CASCADE
);
CREATE INDEX agent_observations_period ON agent_observations(owner_id, occurred_at);
