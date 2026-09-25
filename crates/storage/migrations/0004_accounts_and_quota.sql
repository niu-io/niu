CREATE TABLE supplier_accounts (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 100),
    plan TEXT NOT NULL CHECK (length(plan) BETWEEN 1 AND 200),
    authentication_mode TEXT NOT NULL CHECK (authentication_mode IN ('api_key', 'oauth_refresh')),
    billing_mode TEXT NOT NULL CHECK (billing_mode IN ('metered_api', 'subscription')),
    credential_reference TEXT NOT NULL,
    credential_revision BIGINT NOT NULL DEFAULT 1 CHECK (credential_revision > 0),
    refresh_owner UUID,
    health TEXT NOT NULL DEFAULT 'unverified' CHECK (health IN ('unverified', 'ready', 'cooldown', 'authentication_expired', 'disabled')),
    concurrency_limit INTEGER NOT NULL CHECK (concurrency_limit BETWEEN 1 AND 10000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    UNIQUE (organization_id, project_id, id)
);

CREATE TABLE account_assignments (
    attempt_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    account_id UUID NOT NULL,
    credential_revision BIGINT NOT NULL,
    state TEXT NOT NULL DEFAULT 'held' CHECK (state IN ('held', 'released')),
    FOREIGN KEY (organization_id, project_id, attempt_id) REFERENCES attempts(organization_id, project_id, id),
    FOREIGN KEY (organization_id, project_id, account_id) REFERENCES supplier_accounts(organization_id, project_id, id)
);
CREATE INDEX account_assignments_active ON account_assignments(account_id) WHERE state='held';

CREATE TABLE quota_observations (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    account_id UUID NOT NULL,
    window_key TEXT NOT NULL CHECK (length(window_key) BETWEEN 1 AND 200),
    unit TEXT NOT NULL CHECK (unit IN ('tokens', 'requests', 'millionths_of_window')),
    remaining BIGINT CHECK (remaining >= 0),
    maximum BIGINT CHECK (maximum >= 0),
    observed_at_ms BIGINT NOT NULL CHECK (observed_at_ms >= 0),
    valid_until_ms BIGINT NOT NULL CHECK (valid_until_ms > observed_at_ms),
    resets_at_ms BIGINT NOT NULL CHECK (resets_at_ms > observed_at_ms),
    source TEXT NOT NULL CHECK (length(source) BETWEEN 1 AND 200),
    FOREIGN KEY (organization_id, project_id, account_id) REFERENCES supplier_accounts(organization_id, project_id, id),
    CHECK (remaining IS NULL OR maximum IS NULL OR remaining <= maximum),
    CHECK (unit <> 'millionths_of_window' OR ((remaining IS NULL OR remaining <= 1000000) AND maximum IS NOT NULL AND maximum = 1000000)),
    UNIQUE (account_id, window_key, observed_at_ms)
);
CREATE INDEX quota_observations_latest ON quota_observations(account_id, window_key, observed_at_ms DESC);
CREATE TRIGGER immutable_quota BEFORE UPDATE OR DELETE ON quota_observations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
