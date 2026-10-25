-- @niu-legacy-migration 0001_tenants_and_attempts.sql 2592
CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id)
);

CREATE TABLE operations (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    model_alias TEXT NOT NULL CHECK (length(model_alias) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    UNIQUE (organization_id, project_id, id)
);

-- Intent must commit before upstream dispatch. A dispatched attempt is uncertain
-- after a crash; recovery must not infer that it was free or safe to replay.
CREATE TABLE attempts (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    operation_id UUID NOT NULL,
    resource_id TEXT NOT NULL CHECK (length(resource_id) BETWEEN 1 AND 200),
    offer_revision TEXT NOT NULL CHECK (length(offer_revision) BETWEEN 1 AND 200),
    execution TEXT NOT NULL DEFAULT 'not_sent'
        CHECK (execution IN ('not_sent', 'may_have_executed', 'confirmed_completed', 'confirmed_not_executed')),
    usage_confidence TEXT NOT NULL DEFAULT 'unknown'
        CHECK (usage_confidence IN ('unknown', 'provider_reported')),
    prompt_tokens BIGINT CHECK (prompt_tokens >= 0),
    completion_tokens BIGINT CHECK (completion_tokens >= 0),
    settlement TEXT NOT NULL DEFAULT 'unresolved'
        CHECK (settlement IN ('unresolved', 'reconciliation_required')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    dispatched_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    FOREIGN KEY (organization_id, project_id, operation_id)
        REFERENCES operations(organization_id, project_id, id),
    CHECK ((usage_confidence = 'unknown' AND prompt_tokens IS NULL AND completion_tokens IS NULL)
        OR (usage_confidence = 'provider_reported' AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL)),
    CHECK ((execution = 'not_sent' AND dispatched_at IS NULL)
        OR (execution <> 'not_sent' AND dispatched_at IS NOT NULL))
);
CREATE INDEX attempts_operation ON attempts (organization_id, project_id, operation_id);
CREATE INDEX attempts_unresolved ON attempts (dispatched_at)
    WHERE execution = 'may_have_executed';

-- @niu-legacy-migration 0002_api_keys.sql 807
CREATE TABLE api_keys (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    allowed_models TEXT[] NOT NULL CHECK (cardinality(allowed_models) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    UNIQUE (organization_id, project_id, id)
);
ALTER TABLE attempts ADD COLUMN api_key_id UUID;
ALTER TABLE attempts ADD CONSTRAINT attempts_key_scope
    FOREIGN KEY (organization_id, project_id, api_key_id)
    REFERENCES api_keys(organization_id, project_id, id);

-- @niu-legacy-migration 0003_cost_control.sql 3755
ALTER TABLE attempts ADD UNIQUE (organization_id, project_id, id);
ALTER TABLE attempts DROP CONSTRAINT attempts_settlement_check;
ALTER TABLE attempts ADD CHECK (settlement IN ('unresolved', 'reconciliation_required', 'settled'));

CREATE TABLE price_revisions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    resource_id TEXT NOT NULL,
    offer_revision TEXT NOT NULL,
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    api_prompt_rate BIGINT NOT NULL CHECK (api_prompt_rate >= 0),
    api_completion_rate BIGINT NOT NULL CHECK (api_completion_rate >= 0),
    cash_prompt_rate BIGINT NOT NULL CHECK (cash_prompt_rate >= 0),
    cash_completion_rate BIGINT NOT NULL CHECK (cash_completion_rate >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    UNIQUE (organization_id, project_id, id)
);

-- Monetary amounts are integer billionths of the specified currency. Rates
-- use those same units per million tokens. No implicit currency conversion.
CREATE TABLE project_budgets (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    limit_nanos BIGINT NOT NULL CHECK (limit_nanos >= 0),
    reserved_nanos BIGINT NOT NULL DEFAULT 0 CHECK (reserved_nanos >= 0),
    spent_nanos BIGINT NOT NULL DEFAULT 0 CHECK (spent_nanos >= 0),
    PRIMARY KEY (organization_id, project_id),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id)
);

CREATE TABLE cost_reservations (
    attempt_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    price_revision_id UUID NOT NULL,
    reserved_nanos BIGINT NOT NULL CHECK (reserved_nanos >= 0),
    prompt_bound BIGINT NOT NULL CHECK (prompt_bound >= 0),
    completion_bound BIGINT NOT NULL CHECK (completion_bound >= 0),
    state TEXT NOT NULL DEFAULT 'held' CHECK (state IN ('held', 'settled', 'released')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, project_id, attempt_id) REFERENCES attempts(organization_id, project_id, id),
    FOREIGN KEY (organization_id, project_id, price_revision_id) REFERENCES price_revisions(organization_id, project_id, id),
    FOREIGN KEY (organization_id, project_id) REFERENCES project_budgets(organization_id, project_id)
);

CREATE TABLE cost_entries (
    attempt_id UUID PRIMARY KEY REFERENCES cost_reservations(attempt_id),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    price_revision_id UUID NOT NULL,
    currency TEXT NOT NULL,
    api_equivalent_nanos BIGINT NOT NULL CHECK (api_equivalent_nanos >= 0),
    cash_nanos BIGINT NOT NULL CHECK (cash_nanos >= 0),
    usage_prompt_tokens BIGINT NOT NULL CHECK (usage_prompt_tokens >= 0),
    usage_completion_tokens BIGINT NOT NULL CHECK (usage_completion_tokens >= 0),
    bound_exceeded BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, project_id, attempt_id) REFERENCES attempts(organization_id, project_id, id),
    FOREIGN KEY (organization_id, project_id, price_revision_id) REFERENCES price_revisions(organization_id, project_id, id)
);

CREATE FUNCTION reject_accounting_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'accounting records are immutable; append a new revision or correction';
END;
$$;
CREATE TRIGGER immutable_price BEFORE UPDATE OR DELETE ON price_revisions
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_cost BEFORE UPDATE OR DELETE ON cost_entries
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0004_accounts_and_quota.sql 2935
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

-- @niu-legacy-migration 0005_key_audit.sql 830
CREATE TABLE key_audit_events (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('issued', 'revoked', 'rotated')),
    replacement_key_id UUID,
    actor TEXT NOT NULL DEFAULT 'bootstrap_administrator',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, project_id, key_id) REFERENCES api_keys(organization_id, project_id, id),
    FOREIGN KEY (organization_id, project_id, replacement_key_id) REFERENCES api_keys(organization_id, project_id, id)
);
CREATE INDEX key_audit_project ON key_audit_events(organization_id, project_id, created_at);
CREATE TRIGGER immutable_key_audit BEFORE UPDATE OR DELETE ON key_audit_events
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0006_execution_imports.sql 598
CREATE TABLE execution_imports (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    source TEXT NOT NULL,
    record_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    schema_version SMALLINT NOT NULL CHECK (schema_version = 1),
    payload JSONB NOT NULL,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    UNIQUE (organization_id, project_id, source, record_id)
);
CREATE INDEX execution_imports_task ON execution_imports (organization_id, project_id, task_id);

-- @niu-legacy-migration 0007_default_workspace.sql 336
-- Explicit, idempotent quick setup. Never infer ownership from an existing name.
CREATE TABLE default_workspace (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id)
);

-- @niu-legacy-migration 0008_collector_keys.sql 464
CREATE TABLE collector_keys (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
    token_hash BYTEA NOT NULL UNIQUE CHECK(octet_length(token_hash)=32),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);

-- @niu-legacy-migration 0009_quota_window_retention.sql 325
-- Imported quota snapshots remain immutable except for an authorized
-- window-scoped retention deletion through the management API.
DROP TRIGGER immutable_quota ON quota_observations;
CREATE TRIGGER immutable_quota_updates BEFORE UPDATE ON quota_observations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0010_operator_sessions.sql 730
CREATE TABLE admin_operators (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

CREATE TABLE admin_sessions (
    id UUID PRIMARY KEY,
    operator_id UUID NOT NULL REFERENCES admin_operators(id),
    token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    expires_at_unix BIGINT NOT NULL CHECK (expires_at_unix > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX admin_sessions_active ON admin_sessions (operator_id, expires_at_unix)
    WHERE revoked_at IS NULL;

-- @niu-legacy-migration 0011_operator_scopes.sql 1125
-- Existing operators have no tenant ownership information. Revoke both the
-- sessions and operators before introducing scoped authentication so those
-- credentials cannot retain installation-wide access after the upgrade.
UPDATE admin_sessions
SET revoked_at = COALESCE(revoked_at, now())
WHERE revoked_at IS NULL;

UPDATE admin_operators
SET revoked_at = COALESCE(revoked_at, now())
WHERE revoked_at IS NULL;

ALTER TABLE admin_operators
    ADD COLUMN organization_id UUID,
    ADD COLUMN project_id UUID,
    ADD CONSTRAINT admin_operators_organization_fk
        FOREIGN KEY (organization_id) REFERENCES organizations(id),
    ADD CONSTRAINT admin_operators_project_fk
        FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    ADD CONSTRAINT admin_operators_project_requires_organization
        CHECK (project_id IS NULL OR organization_id IS NOT NULL),
    ADD CONSTRAINT admin_operators_active_scope
        CHECK (revoked_at IS NOT NULL OR organization_id IS NOT NULL);

CREATE INDEX admin_operators_scope
    ON admin_operators (organization_id, project_id, created_at, id);

-- @niu-legacy-migration 0012_operator_audit.sql 1536
CREATE TABLE operator_audit_events (
    id UUID PRIMARY KEY,
    action TEXT NOT NULL CHECK (action IN (
        'operator_created',
        'session_created',
        'session_revoked',
        'operator_revoked'
    )),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    target_operator_id UUID NOT NULL REFERENCES admin_operators(id),
    target_session_id UUID REFERENCES admin_sessions(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    project_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK (
        (actor_kind = 'installation' AND actor_operator_id IS NULL)
        OR (actor_kind = 'operator' AND actor_operator_id IS NOT NULL)
    ),
    CHECK (
        (action IN ('session_created', 'session_revoked') AND target_session_id IS NOT NULL)
        OR (action IN ('operator_created', 'operator_revoked') AND target_session_id IS NULL)
    ),
    FOREIGN KEY (organization_id, project_id)
        REFERENCES projects(organization_id, id)
);

CREATE INDEX operator_audit_target_cursor
    ON operator_audit_events (target_operator_id, created_at DESC, id DESC);

CREATE INDEX operator_audit_actor_cursor
    ON operator_audit_events (actor_operator_id, created_at DESC, id DESC)
    WHERE actor_operator_id IS NOT NULL;

CREATE TRIGGER immutable_operator_audit
    BEFORE UPDATE OR DELETE ON operator_audit_events
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0013_vendor_registry.sql 2263
CREATE TABLE vendors (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 100),
    bootstrap_name TEXT UNIQUE CHECK (bootstrap_name IS NULL OR char_length(bootstrap_name) BETWEEN 1 AND 100),
    adapter TEXT NOT NULL CHECK (adapter IN ('openrouter', 'openai')),
    api_base TEXT NOT NULL CHECK (char_length(api_base) BETWEEN 1 AND 2048),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    credential_ciphertext BYTEA NOT NULL CHECK (octet_length(credential_ciphertext) BETWEEN 30 AND 16384),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vendor_models (
    alias TEXT PRIMARY KEY CHECK (char_length(alias) BETWEEN 1 AND 200),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    upstream_model TEXT NOT NULL CHECK (char_length(upstream_model) BETWEEN 1 AND 200),
    public_catalog BOOLEAN NOT NULL DEFAULT FALSE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    capabilities JSONB NOT NULL CHECK (jsonb_typeof(capabilities) = 'object'),
    pricing JSONB CHECK (pricing IS NULL OR jsonb_typeof(pricing) = 'object'),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX vendor_models_by_vendor ON vendor_models(vendor_id, alias);

-- This table deliberately stores metadata only: no endpoint credentials,
-- request payloads, or customer data are accepted by its write paths.
CREATE TABLE vendor_audit_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    model_alias TEXT,
    action TEXT NOT NULL CHECK (action IN (
        'vendor_created', 'vendor_updated', 'vendor_seeded',
        'vendor_model_created', 'vendor_model_updated', 'vendor_model_seeded'
    )),
    revision BIGINT NOT NULL CHECK (revision > 0),
    actor_kind TEXT NOT NULL DEFAULT 'installation' CHECK (actor_kind = 'installation'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX vendor_audit_by_vendor ON vendor_audit_events(vendor_id, created_at DESC, id DESC);

-- @niu-legacy-migration 0014_collector_purpose.sql 119
ALTER TABLE collector_keys ADD COLUMN purpose TEXT NOT NULL DEFAULT 'quota' CHECK (purpose IN ('quota', 'execution'));

-- @niu-legacy-migration 0015_gateway_task_attribution.sql 409
-- Gateway requests are retained at ingestion. This optional caller-supplied
-- identifier lets agent integrations group their model calls into one task.
ALTER TABLE operations
    ADD COLUMN task_id TEXT
    CHECK (task_id IS NULL OR length(task_id) BETWEEN 1 AND 200);

CREATE INDEX operations_task_id
    ON operations (organization_id, project_id, task_id, created_at DESC)
    WHERE task_id IS NOT NULL;

-- @niu-legacy-migration 0016_provider_reported_model.sql 136
ALTER TABLE attempts
    ADD COLUMN provider_model TEXT
    CHECK (provider_model IS NULL OR length(provider_model) BETWEEN 1 AND 200);

-- @niu-legacy-migration 0017_provider_business.sql 4899
-- Supplier business identity is independent of upstream credentials and customer tenants.
CREATE TABLE provider_businesses (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE provider_memberships (
    provider_id UUID NOT NULL REFERENCES provider_businesses(id),
    operator_id UUID NOT NULL REFERENCES admin_operators(id),
    role TEXT NOT NULL CHECK (role IN ('manager', 'viewer')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (provider_id, operator_id)
);
CREATE TABLE provider_offers (
    id UUID PRIMARY KEY,
    provider_id UUID NOT NULL REFERENCES provider_businesses(id),
    model_alias TEXT NOT NULL UNIQUE REFERENCES vendor_models(alias),
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    current_revision UUID,
    UNIQUE (provider_id, id)
);
CREATE TABLE provider_offer_revisions (
    id UUID PRIMARY KEY,
    offer_id UUID NOT NULL REFERENCES provider_offers(id),
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    prompt_rate BIGINT NOT NULL CHECK (prompt_rate BETWEEN 0 AND 1000000000000000),
    completion_rate BIGINT NOT NULL CHECK (completion_rate BETWEEN 0 AND 1000000000000000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (offer_id, id)
);
ALTER TABLE provider_offers ADD FOREIGN KEY (id, current_revision) REFERENCES provider_offer_revisions(offer_id, id);
CREATE TABLE provider_attempt_offers (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    provider_id UUID NOT NULL,
    offer_id UUID NOT NULL,
    revision_id UUID NOT NULL,
    FOREIGN KEY (provider_id, offer_id) REFERENCES provider_offers(provider_id, id),
    FOREIGN KEY (offer_id, revision_id) REFERENCES provider_offer_revisions(offer_id, id)
);
CREATE TABLE provider_earnings (
    attempt_id UUID PRIMARY KEY REFERENCES provider_attempt_offers(attempt_id),
    provider_id UUID NOT NULL REFERENCES provider_businesses(id),
    revision_id UUID NOT NULL REFERENCES provider_offer_revisions(id),
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos >= 0),
    prompt_tokens BIGINT NOT NULL CHECK (prompt_tokens >= 0),
    completion_tokens BIGINT NOT NULL CHECK (completion_tokens >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider_id, attempt_id)
);
-- A settlement records a confirmed external payment; it never initiates a transfer.
CREATE TABLE provider_settlements (
    id UUID PRIMARY KEY,
    provider_id UUID NOT NULL REFERENCES provider_businesses(id),
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos > 0),
    payment_reference TEXT NOT NULL CHECK (length(trim(payment_reference)) BETWEEN 1 AND 200),
    idempotency_key UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider_id, idempotency_key),
    UNIQUE (provider_id, payment_reference),
    UNIQUE (provider_id, id)
);
CREATE TABLE provider_settlement_entries (
    provider_id UUID NOT NULL,
    settlement_id UUID NOT NULL,
    attempt_id UUID NOT NULL UNIQUE,
    PRIMARY KEY (settlement_id, attempt_id),
    FOREIGN KEY (provider_id, settlement_id) REFERENCES provider_settlements(provider_id, id),
    FOREIGN KEY (provider_id, attempt_id) REFERENCES provider_earnings(provider_id, attempt_id)
);
CREATE TABLE provider_audit_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_id UUID NOT NULL REFERENCES provider_businesses(id),
    actor_operator_id UUID REFERENCES admin_operators(id),
    action TEXT NOT NULL,
    resource_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX provider_earnings_history ON provider_earnings(provider_id, created_at DESC, attempt_id);
CREATE INDEX provider_attempts_by_provider ON provider_attempt_offers(provider_id, attempt_id);
CREATE TRIGGER immutable_provider_rate BEFORE UPDATE OR DELETE ON provider_offer_revisions FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_provider_binding BEFORE UPDATE OR DELETE ON provider_attempt_offers FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_provider_earning BEFORE UPDATE OR DELETE ON provider_earnings FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_provider_settlement BEFORE UPDATE OR DELETE ON provider_settlements FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_provider_settlement_entry BEFORE UPDATE OR DELETE ON provider_settlement_entries FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_provider_audit BEFORE UPDATE OR DELETE ON provider_audit_events FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0018_customer_billing.sql 4756
-- Customer retail charges are distinct from cost_entries (upstream expenditure).
CREATE TABLE customer_tariffs (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    model_alias TEXT NOT NULL CHECK (length(model_alias) BETWEEN 1 AND 200),
    current_revision UUID,
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id,id),
    UNIQUE (organization_id,project_id,model_alias)
);
CREATE TABLE customer_tariff_revisions (
    id UUID PRIMARY KEY,
    tariff_id UUID NOT NULL REFERENCES customer_tariffs(id),
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    prompt_rate BIGINT NOT NULL CHECK (prompt_rate BETWEEN 0 AND 1000000000000000),
    completion_rate BIGINT NOT NULL CHECK (completion_rate BETWEEN 0 AND 1000000000000000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tariff_id,id)
);
ALTER TABLE customer_tariffs ADD FOREIGN KEY (id,current_revision) REFERENCES customer_tariff_revisions(tariff_id,id);
CREATE TABLE customer_attempt_tariffs (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    revision_id UUID NOT NULL REFERENCES customer_tariff_revisions(id)
);
CREATE TABLE customer_charges (
    attempt_id UUID PRIMARY KEY REFERENCES customer_attempt_tariffs(attempt_id),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    revision_id UUID NOT NULL REFERENCES customer_tariff_revisions(id),
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos >= 0),
    prompt_tokens BIGINT NOT NULL CHECK (prompt_tokens >= 0),
    completion_tokens BIGINT NOT NULL CHECK (completion_tokens >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id,project_id,attempt_id) REFERENCES attempts(organization_id,project_id,id),
    UNIQUE (organization_id,project_id,attempt_id)
);
CREATE TABLE customer_invoices (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    from_ms BIGINT NOT NULL CHECK (from_ms >= 0),
    to_ms BIGINT NOT NULL CHECK (to_ms > from_ms),
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos >= 0),
    idempotency_key UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
    UNIQUE (organization_id,project_id,idempotency_key),
    UNIQUE (organization_id,project_id,id)
);
CREATE TABLE customer_invoice_entries (
    invoice_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL UNIQUE,
    PRIMARY KEY (invoice_id,attempt_id),
    FOREIGN KEY (organization_id,project_id,invoice_id) REFERENCES customer_invoices(organization_id,project_id,id),
    FOREIGN KEY (organization_id,project_id,attempt_id) REFERENCES customer_charges(organization_id,project_id,attempt_id)
);
CREATE TABLE customer_invoice_payments (
    invoice_id UUID PRIMARY KEY REFERENCES customer_invoices(id),
    payment_reference TEXT NOT NULL UNIQUE CHECK (length(trim(payment_reference)) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE customer_billing_audit (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    action TEXT NOT NULL,
    resource_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE INDEX customer_charges_by_project ON customer_charges(organization_id,project_id,created_at);
CREATE TRIGGER immutable_customer_tariff BEFORE UPDATE OR DELETE ON customer_tariff_revisions FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_binding BEFORE UPDATE OR DELETE ON customer_attempt_tariffs FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_charge BEFORE UPDATE OR DELETE ON customer_charges FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_invoice BEFORE UPDATE OR DELETE ON customer_invoices FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_invoice_entry BEFORE UPDATE OR DELETE ON customer_invoice_entries FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_payment BEFORE UPDATE OR DELETE ON customer_invoice_payments FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_audit BEFORE UPDATE OR DELETE ON customer_billing_audit FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0019_attempts_project_recent.sql 187
-- Keep recent workspace activity and its cursor pages bounded by the index.
CREATE INDEX attempts_project_recent
    ON attempts (organization_id, project_id, created_at DESC, id DESC);

-- @niu-legacy-migration 0020_batched_gateway_admission.sql 7207
-- Batch unpriced gateway admissions so concurrent requests share one network
-- round trip and commit while preserving intent durability before dispatch.
CREATE FUNCTION niu_admit_unpriced_gateway_batch(
    operation_ids UUID[],
    attempt_ids UUID[],
    organization_ids UUID[],
    project_ids UUID[],
    key_ids UUID[],
    model_aliases TEXT[],
    task_ids TEXT[],
    revisions TEXT[]
)
RETURNS TABLE (attempt_id UUID, status TEXT)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    request_count INTEGER;
    changed BIGINT;
BEGIN
    request_count := cardinality(operation_ids);
    IF request_count IS NULL OR request_count < 1 OR request_count > 64
        OR cardinality(attempt_ids) IS DISTINCT FROM request_count
        OR cardinality(organization_ids) IS DISTINCT FROM request_count
        OR cardinality(project_ids) IS DISTINCT FROM request_count
        OR cardinality(key_ids) IS DISTINCT FROM request_count
        OR cardinality(model_aliases) IS DISTINCT FROM request_count
        OR cardinality(task_ids) IS DISTINCT FROM request_count
        OR cardinality(revisions) IS DISTINCT FROM request_count THEN
        RAISE EXCEPTION 'invalid gateway admission batch' USING ERRCODE = '22023';
    END IF;

    WITH input AS MATERIALIZED (
        SELECT request.operation_id, request.attempt_id,
               request.organization_id, request.project_id, request.key_id,
               request.model_alias, request.task_id, request.revision
          FROM unnest(operation_ids, attempt_ids, organization_ids, project_ids,
                      key_ids, model_aliases, task_ids, revisions)
               AS request(operation_id, attempt_id, organization_id, project_id,
                          key_id, model_alias, task_id, revision)
    ), inserted_operations AS (
        INSERT INTO operations (id, organization_id, project_id, model_alias, task_id)
        SELECT i.operation_id, i.organization_id, i.project_id, i.model_alias, i.task_id
          FROM input i
        RETURNING id
    ), inserted_attempts AS (
        INSERT INTO attempts
            (id, organization_id, project_id, operation_id, resource_id, offer_revision)
        SELECT i.attempt_id, i.organization_id, i.project_id, i.operation_id,
               i.model_alias, i.revision
          FROM input i
          JOIN inserted_operations o ON o.id = i.operation_id
        RETURNING id
    )
    SELECT count(*) INTO changed FROM inserted_attempts;
    IF changed <> request_count THEN
        RAISE EXCEPTION 'gateway admission insert count mismatch' USING ERRCODE = '22023';
    END IF;

    -- Lock the key and project rows together before the dispatch update. Key
    -- revocation and project budget creation therefore serialize with admission.
    PERFORM k.id
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids)
           AS input(attempt_id, organization_id, project_id, key_id)
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
      JOIN projects p
        ON p.organization_id = k.organization_id
       AND p.id = k.project_id
     WHERE k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
     FOR SHARE OF k, p;

    -- Assigned supplier accounts are not selected by today's unpriced route,
    -- but preserve the readiness lock used by the ordinary dispatch path.
    PERFORM a.id
      FROM unnest(attempt_ids, organization_ids, project_ids)
           AS input(attempt_id, organization_id, project_id)
      JOIN account_assignments s
        ON s.organization_id = input.organization_id
       AND s.project_id = input.project_id
       AND s.attempt_id = input.attempt_id
      JOIN supplier_accounts a
        ON a.organization_id = s.organization_id
       AND a.project_id = s.project_id
       AND a.id = s.account_id
     FOR SHARE OF a;

    RETURN QUERY
    WITH input AS MATERIALIZED (
        SELECT request.attempt_id, request.organization_id,
               request.project_id, request.key_id, request.model_alias,
               request.position
          FROM unnest(attempt_ids, organization_ids, project_ids,
                      key_ids, model_aliases)
               WITH ORDINALITY AS request(attempt_id, organization_id,
                   project_id, key_id, model_alias, position)
    ), dispatched AS (
        UPDATE attempts a
           SET execution = 'may_have_executed',
               dispatched_at = clock_timestamp(),
               api_key_id = i.key_id
          FROM input i, operations o, api_keys k
         WHERE a.organization_id = i.organization_id
           AND a.project_id = i.project_id
           AND a.id = i.attempt_id
           AND a.execution = 'not_sent'
           AND o.id = a.operation_id
           AND o.model_alias = i.model_alias
           AND k.id = i.key_id
           AND k.organization_id = i.organization_id
           AND k.project_id = i.project_id
           AND o.model_alias = ANY(k.allowed_models)
           AND k.expires_at > clock_timestamp()
           AND k.revoked_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM account_assignments s
                WHERE s.organization_id = i.organization_id
                  AND s.project_id = i.project_id
                  AND s.attempt_id = a.id
                  AND s.state <> 'held'
           )
           AND (
               NOT EXISTS (
                   SELECT 1 FROM project_budgets b
                    WHERE b.organization_id = i.organization_id
                      AND b.project_id = i.project_id
               )
               OR EXISTS (
                   SELECT 1 FROM cost_reservations r
                    WHERE r.attempt_id = a.id AND r.state = 'held'
               )
           )
        RETURNING a.id AS attempt_id
    )
    SELECT i.attempt_id,
           CASE
               WHEN d.attempt_id IS NOT NULL THEN 'admitted'
               WHEN NOT EXISTS (
                   SELECT 1 FROM api_keys k
                    WHERE k.id = i.key_id
                      AND k.organization_id = i.organization_id
                      AND k.project_id = i.project_id
                      AND k.revoked_at IS NULL
                      AND k.expires_at > clock_timestamp()
               ) THEN 'unauthorized'
               WHEN EXISTS (
                   SELECT 1
                     FROM account_assignments s
                     JOIN supplier_accounts a
                       ON a.organization_id = s.organization_id
                      AND a.project_id = s.project_id
                      AND a.id = s.account_id
                    WHERE s.organization_id = i.organization_id
                      AND s.project_id = i.project_id
                      AND s.attempt_id = i.attempt_id
                      AND NOT (a.health = 'ready'
                           AND a.refresh_owner IS NULL
                           AND a.credential_revision = s.credential_revision)
               ) THEN 'account_unavailable'
               ELSE 'conflict'
           END::TEXT AS status
      FROM input i
      LEFT JOIN dispatched d ON d.attempt_id = i.attempt_id
     ORDER BY i.position;
END;
$$;

-- @niu-legacy-migration 0021_atomic_priced_gateway_admission.sql 7251
-- Keep the trusted budget reservation and dispatch transition in one database
-- call so network latency does not extend the project-budget row lock.
CREATE FUNCTION niu_reserve_and_dispatch_gateway(
    p_organization_id UUID,
    p_project_id UUID,
    p_key_id UUID,
    p_attempt_id UUID,
    p_price_revision_id UUID,
    p_resource_id TEXT,
    p_offer_revision TEXT,
    p_prompt_bound BIGINT,
    p_completion_bound BIGINT
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    account_eligible BOOLEAN;
    attempt_row RECORD;
    price_row RECORD;
    computed_amount NUMERIC;
    changed BIGINT;
BEGIN
    IF p_prompt_bound < 0 OR p_completion_bound < 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0009', MESSAGE = 'invalid token bound';
    END IF;

    -- Revocation, expiry, model permission and project budget creation all
    -- synchronize with this admission before it allocates funds.
    PERFORM k.id
      FROM api_keys k
      JOIN projects p ON p.organization_id=k.organization_id AND p.id=k.project_id
     WHERE k.id=p_key_id
       AND k.organization_id=p_organization_id
       AND k.project_id=p_project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND p_resource_id=ANY(k.allowed_models)
     FOR SHARE OF k, p;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
    END IF;

    SELECT a.health='ready'
           AND a.refresh_owner IS NULL
           AND a.credential_revision=s.credential_revision
      INTO account_eligible
      FROM account_assignments s
      JOIN supplier_accounts a
        ON a.organization_id=s.organization_id
       AND a.project_id=s.project_id
       AND a.id=s.account_id
     WHERE s.organization_id=p_organization_id
       AND s.project_id=p_project_id
       AND s.attempt_id=p_attempt_id
     FOR SHARE OF s, a;
    IF FOUND AND account_eligible IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION USING ERRCODE = 'P0007', MESSAGE = 'supplier account is unavailable';
    END IF;

    SELECT a.execution, a.resource_id, a.offer_revision, o.model_alias
      INTO attempt_row
      FROM attempts a
      JOIN operations o
        ON o.organization_id=a.organization_id
       AND o.project_id=a.project_id
       AND o.id=a.operation_id
     WHERE a.organization_id=p_organization_id
       AND a.project_id=p_project_id
       AND a.id=p_attempt_id
       AND o.model_alias=p_resource_id
     FOR UPDATE OF a;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt does not exist';
    END IF;
    IF attempt_row.execution <> 'not_sent'
       OR attempt_row.resource_id <> p_resource_id
       OR attempt_row.offer_revision <> p_offer_revision THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt conflicts with admission';
    END IF;

    SELECT currency, cash_prompt_rate, cash_completion_rate
      INTO price_row
      FROM price_revisions
     WHERE organization_id=p_organization_id
       AND project_id=p_project_id
       AND id=p_price_revision_id
       AND resource_id=p_resource_id
       AND offer_revision=p_offer_revision;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'price revision does not match route';
    END IF;

    IF EXISTS (SELECT 1 FROM cost_reservations WHERE attempt_id=p_attempt_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt already has a reservation';
    END IF;

    computed_amount := ceil((
        price_row.cash_prompt_rate::NUMERIC * p_prompt_bound::NUMERIC
        + price_row.cash_completion_rate::NUMERIC * p_completion_bound::NUMERIC
    ) / 1000000);
    IF computed_amount > 9223372036854775807::NUMERIC THEN
        RAISE EXCEPTION USING ERRCODE = 'P0009', MESSAGE = 'reservation exceeds supported amount';
    END IF;

    UPDATE project_budgets
       SET reserved_nanos=reserved_nanos + computed_amount::BIGINT
     WHERE organization_id=p_organization_id
       AND project_id=p_project_id
       AND currency=price_row.currency
       AND limit_nanos::NUMERIC - spent_nanos::NUMERIC - reserved_nanos::NUMERIC >= computed_amount
       AND EXISTS (
           SELECT 1 FROM api_keys k
            WHERE k.id=p_key_id
              AND k.organization_id=p_organization_id
              AND k.project_id=p_project_id
              AND k.revoked_at IS NULL
              AND k.expires_at > clock_timestamp()
              AND p_resource_id=ANY(k.allowed_models)
       );
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
        IF NOT EXISTS (
            SELECT 1 FROM api_keys k
             WHERE k.id=p_key_id
               AND k.organization_id=p_organization_id
               AND k.project_id=p_project_id
               AND k.revoked_at IS NULL
               AND k.expires_at > clock_timestamp()
               AND p_resource_id=ANY(k.allowed_models)
        ) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
        END IF;
        RAISE EXCEPTION USING ERRCODE = 'P0008', MESSAGE = 'project budget is unavailable';
    END IF;

    INSERT INTO cost_reservations
        (attempt_id, organization_id, project_id, price_revision_id,
         reserved_nanos, prompt_bound, completion_bound)
    VALUES
        (p_attempt_id, p_organization_id, p_project_id, p_price_revision_id,
         computed_amount::BIGINT, p_prompt_bound, p_completion_bound);

    UPDATE attempts a
       SET execution='may_have_executed',
           dispatched_at=clock_timestamp(),
           api_key_id=p_key_id
     WHERE a.organization_id=p_organization_id
       AND a.project_id=p_project_id
       AND a.id=p_attempt_id
       AND a.execution='not_sent'
       AND EXISTS (
           SELECT 1 FROM api_keys k
            WHERE k.id=p_key_id
              AND k.organization_id=p_organization_id
              AND k.project_id=p_project_id
              AND a.resource_id=ANY(k.allowed_models)
              AND k.revoked_at IS NULL
              AND k.expires_at > clock_timestamp()
       )
       AND NOT EXISTS (
           SELECT 1 FROM account_assignments s
            WHERE s.organization_id=p_organization_id
              AND s.project_id=p_project_id
              AND s.attempt_id=a.id
              AND s.state <> 'held'
       )
       AND EXISTS (
           SELECT 1 FROM cost_reservations r
            WHERE r.organization_id=p_organization_id
              AND r.project_id=p_project_id
              AND r.attempt_id=a.id
              AND r.state='held'
       );
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
        IF NOT EXISTS (
            SELECT 1 FROM api_keys k
             WHERE k.id=p_key_id
               AND k.organization_id=p_organization_id
               AND k.project_id=p_project_id
               AND k.revoked_at IS NULL
               AND k.expires_at > clock_timestamp()
               AND p_resource_id=ANY(k.allowed_models)
        ) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
        END IF;
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt changed during admission';
    END IF;
END;
$$;

-- @niu-legacy-migration 0022_batched_gateway_route_snapshots.sql 13513
-- Keep route and accounting attribution in the same durable admission call.
-- Provider and tariff snapshots must exist before the attempt is dispatched.
CREATE FUNCTION niu_admit_unpriced_gateway_batch_with_route(
    operation_ids UUID[],
    attempt_ids UUID[],
    organization_ids UUID[],
    project_ids UUID[],
    key_ids UUID[],
    model_aliases TEXT[],
    task_ids TEXT[],
    revisions TEXT[],
    upstream_models TEXT[],
    api_bases TEXT[]
)
RETURNS TABLE (attempt_id UUID, status TEXT)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    request_count INTEGER;
    changed BIGINT;
BEGIN
    request_count := cardinality(operation_ids);
    IF request_count IS NULL OR request_count < 1 OR request_count > 64
        OR cardinality(attempt_ids) IS DISTINCT FROM request_count
        OR cardinality(organization_ids) IS DISTINCT FROM request_count
        OR cardinality(project_ids) IS DISTINCT FROM request_count
        OR cardinality(key_ids) IS DISTINCT FROM request_count
        OR cardinality(model_aliases) IS DISTINCT FROM request_count
        OR cardinality(task_ids) IS DISTINCT FROM request_count
        OR cardinality(revisions) IS DISTINCT FROM request_count
        OR cardinality(upstream_models) IS DISTINCT FROM request_count
        OR cardinality(api_bases) IS DISTINCT FROM request_count THEN
        RAISE EXCEPTION 'invalid gateway admission batch' USING ERRCODE = '22023';
    END IF;

    WITH input AS MATERIALIZED (
        SELECT request.operation_id, request.attempt_id,
               request.organization_id, request.project_id, request.key_id,
               request.model_alias, request.task_id, request.revision,
               request.upstream_model, request.api_base
          FROM unnest(operation_ids, attempt_ids, organization_ids, project_ids,
                      key_ids, model_aliases, task_ids, revisions,
                      upstream_models, api_bases)
               AS request(operation_id, attempt_id, organization_id, project_id,
                          key_id, model_alias, task_id, revision,
                          upstream_model, api_base)
    ), inserted_operations AS (
        INSERT INTO operations (id, organization_id, project_id, model_alias, task_id)
        SELECT i.operation_id, i.organization_id, i.project_id, i.model_alias, i.task_id
          FROM input i
        RETURNING id
    ), inserted_attempts AS (
        INSERT INTO attempts
            (id, organization_id, project_id, operation_id, resource_id, offer_revision)
        SELECT i.attempt_id, i.organization_id, i.project_id, i.operation_id,
               i.model_alias, i.revision
          FROM input i
          JOIN inserted_operations o ON o.id = i.operation_id
        RETURNING id
    )
    SELECT count(*) INTO changed FROM inserted_attempts;
    IF changed <> request_count THEN
        RAISE EXCEPTION 'gateway admission insert count mismatch' USING ERRCODE = '22023';
    END IF;

    PERFORM k.id
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids)
           AS input(attempt_id, organization_id, project_id, key_id)
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
      JOIN projects p
        ON p.organization_id = k.organization_id
       AND p.id = k.project_id
     WHERE k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
     FOR SHARE OF k, p;

    PERFORM a.id
      FROM unnest(attempt_ids, organization_ids, project_ids)
           AS input(attempt_id, organization_id, project_id)
      JOIN account_assignments s
        ON s.organization_id = input.organization_id
       AND s.project_id = input.project_id
       AND s.attempt_id = input.attempt_id
      JOIN supplier_accounts a
        ON a.organization_id = s.organization_id
       AND a.project_id = s.project_id
       AND a.id = s.account_id
     FOR SHARE OF a;

    PERFORM o.id
      FROM unnest(model_aliases, upstream_models, api_bases)
           AS input(model_alias, upstream_model, api_base)
      JOIN provider_offers o ON o.model_alias = input.model_alias
      JOIN vendor_models m ON m.alias = input.model_alias
      JOIN vendors v ON v.id = m.vendor_id
     FOR SHARE OF o, m, v;

    -- A published customer tariff is bound only when this key is eligible to
    -- use the model. Its immutable revision records the actual rate in effect.
    INSERT INTO customer_attempt_tariffs (attempt_id, revision_id)
    SELECT input.attempt_id, tariff.current_revision
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids, model_aliases)
           AS input(attempt_id, organization_id, project_id, key_id, model_alias)
      JOIN customer_tariffs tariff
        ON tariff.organization_id = input.organization_id
       AND tariff.project_id = input.project_id
       AND tariff.model_alias = input.model_alias
       AND tariff.current_revision IS NOT NULL
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND input.model_alias = ANY(k.allowed_models)
     WHERE NOT EXISTS (
           SELECT 1 FROM account_assignments s
           JOIN supplier_accounts a
             ON a.organization_id = s.organization_id
            AND a.project_id = s.project_id
            AND a.id = s.account_id
           WHERE s.organization_id = input.organization_id
             AND s.project_id = input.project_id
             AND s.attempt_id = input.attempt_id
             AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                      AND a.credential_revision = s.credential_revision)
       )
       AND NOT EXISTS (
           SELECT 1 FROM project_budgets b
            WHERE b.organization_id = input.organization_id
              AND b.project_id = input.project_id
              AND NOT EXISTS (
                  SELECT 1 FROM cost_reservations r
                   WHERE r.attempt_id = input.attempt_id AND r.state = 'held'
              )
       )
    ON CONFLICT (attempt_id) DO NOTHING;

    -- Supplier attribution is captured atomically. A known offer that no
    -- longer matches the live route is rejected below before any dispatch.
    INSERT INTO provider_attempt_offers (attempt_id, provider_id, offer_id, revision_id)
    SELECT input.attempt_id, offer.provider_id, offer.id, offer.current_revision
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids,
                  model_aliases, upstream_models, api_bases)
           AS input(attempt_id, organization_id, project_id, key_id,
                    model_alias, upstream_model, api_base)
      JOIN provider_offers offer
        ON offer.model_alias = input.model_alias
       AND offer.active
       AND offer.current_revision IS NOT NULL
      JOIN vendor_models model
        ON model.alias = input.model_alias
       AND model.vendor_id = offer.vendor_id
       AND model.upstream_model = input.upstream_model
      JOIN vendors vendor
        ON vendor.id = model.vendor_id
       AND vendor.api_base IS NOT DISTINCT FROM input.api_base
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND input.model_alias = ANY(k.allowed_models)
     WHERE NOT EXISTS (
           SELECT 1 FROM account_assignments s
           JOIN supplier_accounts a
             ON a.organization_id = s.organization_id
            AND a.project_id = s.project_id
            AND a.id = s.account_id
           WHERE s.organization_id = input.organization_id
             AND s.project_id = input.project_id
             AND s.attempt_id = input.attempt_id
             AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                      AND a.credential_revision = s.credential_revision)
       )
       AND NOT EXISTS (
           SELECT 1 FROM project_budgets b
            WHERE b.organization_id = input.organization_id
              AND b.project_id = input.project_id
              AND NOT EXISTS (
                  SELECT 1 FROM cost_reservations r
                   WHERE r.attempt_id = input.attempt_id AND r.state = 'held'
              )
       )
    ON CONFLICT (attempt_id) DO NOTHING;

    RETURN QUERY
    WITH input AS MATERIALIZED (
        SELECT request.attempt_id, request.organization_id,
               request.project_id, request.key_id, request.model_alias,
               request.upstream_model, request.api_base, request.position
          FROM unnest(attempt_ids, organization_ids, project_ids, key_ids,
                      model_aliases, upstream_models, api_bases)
               WITH ORDINALITY AS request(attempt_id, organization_id,
                   project_id, key_id, model_alias, upstream_model, api_base, position)
    ), dispatched AS (
        UPDATE attempts a
           SET execution = 'may_have_executed',
               dispatched_at = clock_timestamp(),
               api_key_id = i.key_id
          FROM input i, operations o, api_keys k
         WHERE a.organization_id = i.organization_id
           AND a.project_id = i.project_id
           AND a.id = i.attempt_id
           AND a.execution = 'not_sent'
           AND o.organization_id = a.organization_id
           AND o.project_id = a.project_id
           AND o.id = a.operation_id
           AND o.model_alias = i.model_alias
           AND k.id = i.key_id
           AND k.organization_id = i.organization_id
           AND k.project_id = i.project_id
           AND o.model_alias = ANY(k.allowed_models)
           AND k.expires_at > clock_timestamp()
           AND k.revoked_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM provider_offers offer
               WHERE offer.model_alias = i.model_alias
                 AND NOT EXISTS (
                     SELECT 1 FROM provider_offers current_offer
                     JOIN vendor_models m
                       ON m.alias = current_offer.model_alias
                      AND m.vendor_id = current_offer.vendor_id
                      AND m.upstream_model = i.upstream_model
                     JOIN vendors v
                       ON v.id = m.vendor_id
                      AND v.api_base IS NOT DISTINCT FROM i.api_base
                     WHERE current_offer.id = offer.id
                       AND current_offer.active
                       AND current_offer.current_revision IS NOT NULL
                 )
           )
           AND NOT EXISTS (
               SELECT 1 FROM account_assignments s
                WHERE s.organization_id = i.organization_id
                  AND s.project_id = i.project_id
                  AND s.attempt_id = a.id
                  AND s.state <> 'held'
           )
           AND (
               NOT EXISTS (
                   SELECT 1 FROM project_budgets b
                    WHERE b.organization_id = i.organization_id
                      AND b.project_id = i.project_id
               )
               OR EXISTS (
                   SELECT 1 FROM cost_reservations r
                    WHERE r.attempt_id = a.id AND r.state = 'held'
               )
           )
        RETURNING a.id AS attempt_id
    )
    SELECT i.attempt_id,
           CASE
               WHEN NOT EXISTS (
                   SELECT 1 FROM api_keys k
                    WHERE k.id = i.key_id
                      AND k.organization_id = i.organization_id
                      AND k.project_id = i.project_id
                      AND k.revoked_at IS NULL
                      AND k.expires_at > clock_timestamp()
                      AND i.model_alias = ANY(k.allowed_models)
               ) THEN 'unauthorized'
               WHEN EXISTS (
                   SELECT 1 FROM account_assignments s
                   JOIN supplier_accounts a
                     ON a.organization_id = s.organization_id
                    AND a.project_id = s.project_id
                    AND a.id = s.account_id
                   WHERE s.organization_id = i.organization_id
                     AND s.project_id = i.project_id
                     AND s.attempt_id = i.attempt_id
                     AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                              AND a.credential_revision = s.credential_revision)
               ) THEN 'account_unavailable'
               WHEN EXISTS (
                   SELECT 1 FROM provider_offers offer
                   WHERE offer.model_alias = i.model_alias
                     AND NOT EXISTS (
                         SELECT 1 FROM vendor_models m
                         JOIN vendors v ON v.id = m.vendor_id
                         WHERE m.alias = i.model_alias
                           AND m.vendor_id = offer.vendor_id
                           AND m.upstream_model = i.upstream_model
                           AND v.api_base IS NOT DISTINCT FROM i.api_base
                           AND offer.active
                           AND offer.current_revision IS NOT NULL
                     )
               ) THEN 'account_unavailable'
               WHEN d.attempt_id IS NOT NULL THEN 'admitted'
               ELSE 'conflict'
           END::TEXT AS status
      FROM input i
      LEFT JOIN dispatched d ON d.attempt_id = i.attempt_id
     ORDER BY i.position;
END;
$$;

-- @niu-legacy-migration 0023_fix_gateway_admission_conflict_targets.sql 13781
-- The OUT parameter attempt_id conflicts with column inference in ON CONFLICT (attempt_id).
-- Name the existing primary-key constraints explicitly so PL/pgSQL resolves the target unambiguously.
-- Keep route and accounting attribution in the same durable admission call.
-- Provider and tariff snapshots must exist before the attempt is dispatched.
CREATE OR REPLACE FUNCTION niu_admit_unpriced_gateway_batch_with_route(
    operation_ids UUID[],
    attempt_ids UUID[],
    organization_ids UUID[],
    project_ids UUID[],
    key_ids UUID[],
    model_aliases TEXT[],
    task_ids TEXT[],
    revisions TEXT[],
    upstream_models TEXT[],
    api_bases TEXT[]
)
RETURNS TABLE (attempt_id UUID, status TEXT)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    request_count INTEGER;
    changed BIGINT;
BEGIN
    request_count := cardinality(operation_ids);
    IF request_count IS NULL OR request_count < 1 OR request_count > 64
        OR cardinality(attempt_ids) IS DISTINCT FROM request_count
        OR cardinality(organization_ids) IS DISTINCT FROM request_count
        OR cardinality(project_ids) IS DISTINCT FROM request_count
        OR cardinality(key_ids) IS DISTINCT FROM request_count
        OR cardinality(model_aliases) IS DISTINCT FROM request_count
        OR cardinality(task_ids) IS DISTINCT FROM request_count
        OR cardinality(revisions) IS DISTINCT FROM request_count
        OR cardinality(upstream_models) IS DISTINCT FROM request_count
        OR cardinality(api_bases) IS DISTINCT FROM request_count THEN
        RAISE EXCEPTION 'invalid gateway admission batch' USING ERRCODE = '22023';
    END IF;

    WITH input AS MATERIALIZED (
        SELECT request.operation_id, request.attempt_id,
               request.organization_id, request.project_id, request.key_id,
               request.model_alias, request.task_id, request.revision,
               request.upstream_model, request.api_base
          FROM unnest(operation_ids, attempt_ids, organization_ids, project_ids,
                      key_ids, model_aliases, task_ids, revisions,
                      upstream_models, api_bases)
               AS request(operation_id, attempt_id, organization_id, project_id,
                          key_id, model_alias, task_id, revision,
                          upstream_model, api_base)
    ), inserted_operations AS (
        INSERT INTO operations (id, organization_id, project_id, model_alias, task_id)
        SELECT i.operation_id, i.organization_id, i.project_id, i.model_alias, i.task_id
          FROM input i
        RETURNING id
    ), inserted_attempts AS (
        INSERT INTO attempts
            (id, organization_id, project_id, operation_id, resource_id, offer_revision)
        SELECT i.attempt_id, i.organization_id, i.project_id, i.operation_id,
               i.model_alias, i.revision
          FROM input i
          JOIN inserted_operations o ON o.id = i.operation_id
        RETURNING id
    )
    SELECT count(*) INTO changed FROM inserted_attempts;
    IF changed <> request_count THEN
        RAISE EXCEPTION 'gateway admission insert count mismatch' USING ERRCODE = '22023';
    END IF;

    PERFORM k.id
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids)
           AS input(attempt_id, organization_id, project_id, key_id)
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
      JOIN projects p
        ON p.organization_id = k.organization_id
       AND p.id = k.project_id
     WHERE k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
     FOR SHARE OF k, p;

    PERFORM a.id
      FROM unnest(attempt_ids, organization_ids, project_ids)
           AS input(attempt_id, organization_id, project_id)
      JOIN account_assignments s
        ON s.organization_id = input.organization_id
       AND s.project_id = input.project_id
       AND s.attempt_id = input.attempt_id
      JOIN supplier_accounts a
        ON a.organization_id = s.organization_id
       AND a.project_id = s.project_id
       AND a.id = s.account_id
     FOR SHARE OF a;

    PERFORM o.id
      FROM unnest(model_aliases, upstream_models, api_bases)
           AS input(model_alias, upstream_model, api_base)
      JOIN provider_offers o ON o.model_alias = input.model_alias
      JOIN vendor_models m ON m.alias = input.model_alias
      JOIN vendors v ON v.id = m.vendor_id
     FOR SHARE OF o, m, v;

    -- A published customer tariff is bound only when this key is eligible to
    -- use the model. Its immutable revision records the actual rate in effect.
    INSERT INTO customer_attempt_tariffs (attempt_id, revision_id)
    SELECT input.attempt_id, tariff.current_revision
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids, model_aliases)
           AS input(attempt_id, organization_id, project_id, key_id, model_alias)
      JOIN customer_tariffs tariff
        ON tariff.organization_id = input.organization_id
       AND tariff.project_id = input.project_id
       AND tariff.model_alias = input.model_alias
       AND tariff.current_revision IS NOT NULL
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND input.model_alias = ANY(k.allowed_models)
     WHERE NOT EXISTS (
           SELECT 1 FROM account_assignments s
           JOIN supplier_accounts a
             ON a.organization_id = s.organization_id
            AND a.project_id = s.project_id
            AND a.id = s.account_id
           WHERE s.organization_id = input.organization_id
             AND s.project_id = input.project_id
             AND s.attempt_id = input.attempt_id
             AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                      AND a.credential_revision = s.credential_revision)
       )
       AND NOT EXISTS (
           SELECT 1 FROM project_budgets b
            WHERE b.organization_id = input.organization_id
              AND b.project_id = input.project_id
              AND NOT EXISTS (
                  SELECT 1 FROM cost_reservations r
                   WHERE r.attempt_id = input.attempt_id AND r.state = 'held'
              )
       )
    ON CONFLICT ON CONSTRAINT customer_attempt_tariffs_pkey DO NOTHING;

    -- Supplier attribution is captured atomically. A known offer that no
    -- longer matches the live route is rejected below before any dispatch.
    INSERT INTO provider_attempt_offers (attempt_id, provider_id, offer_id, revision_id)
    SELECT input.attempt_id, offer.provider_id, offer.id, offer.current_revision
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids,
                  model_aliases, upstream_models, api_bases)
           AS input(attempt_id, organization_id, project_id, key_id,
                    model_alias, upstream_model, api_base)
      JOIN provider_offers offer
        ON offer.model_alias = input.model_alias
       AND offer.active
       AND offer.current_revision IS NOT NULL
      JOIN vendor_models model
        ON model.alias = input.model_alias
       AND model.vendor_id = offer.vendor_id
       AND model.upstream_model = input.upstream_model
      JOIN vendors vendor
        ON vendor.id = model.vendor_id
       AND vendor.api_base IS NOT DISTINCT FROM input.api_base
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND input.model_alias = ANY(k.allowed_models)
     WHERE NOT EXISTS (
           SELECT 1 FROM account_assignments s
           JOIN supplier_accounts a
             ON a.organization_id = s.organization_id
            AND a.project_id = s.project_id
            AND a.id = s.account_id
           WHERE s.organization_id = input.organization_id
             AND s.project_id = input.project_id
             AND s.attempt_id = input.attempt_id
             AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                      AND a.credential_revision = s.credential_revision)
       )
       AND NOT EXISTS (
           SELECT 1 FROM project_budgets b
            WHERE b.organization_id = input.organization_id
              AND b.project_id = input.project_id
              AND NOT EXISTS (
                  SELECT 1 FROM cost_reservations r
                   WHERE r.attempt_id = input.attempt_id AND r.state = 'held'
              )
       )
    ON CONFLICT ON CONSTRAINT provider_attempt_offers_pkey DO NOTHING;

    RETURN QUERY
    WITH input AS MATERIALIZED (
        SELECT request.attempt_id, request.organization_id,
               request.project_id, request.key_id, request.model_alias,
               request.upstream_model, request.api_base, request.position
          FROM unnest(attempt_ids, organization_ids, project_ids, key_ids,
                      model_aliases, upstream_models, api_bases)
               WITH ORDINALITY AS request(attempt_id, organization_id,
                   project_id, key_id, model_alias, upstream_model, api_base, position)
    ), dispatched AS (
        UPDATE attempts a
           SET execution = 'may_have_executed',
               dispatched_at = clock_timestamp(),
               api_key_id = i.key_id
          FROM input i, operations o, api_keys k
         WHERE a.organization_id = i.organization_id
           AND a.project_id = i.project_id
           AND a.id = i.attempt_id
           AND a.execution = 'not_sent'
           AND o.organization_id = a.organization_id
           AND o.project_id = a.project_id
           AND o.id = a.operation_id
           AND o.model_alias = i.model_alias
           AND k.id = i.key_id
           AND k.organization_id = i.organization_id
           AND k.project_id = i.project_id
           AND o.model_alias = ANY(k.allowed_models)
           AND k.expires_at > clock_timestamp()
           AND k.revoked_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM provider_offers offer
               WHERE offer.model_alias = i.model_alias
                 AND NOT EXISTS (
                     SELECT 1 FROM provider_offers current_offer
                     JOIN vendor_models m
                       ON m.alias = current_offer.model_alias
                      AND m.vendor_id = current_offer.vendor_id
                      AND m.upstream_model = i.upstream_model
                     JOIN vendors v
                       ON v.id = m.vendor_id
                      AND v.api_base IS NOT DISTINCT FROM i.api_base
                     WHERE current_offer.id = offer.id
                       AND current_offer.active
                       AND current_offer.current_revision IS NOT NULL
                 )
           )
           AND NOT EXISTS (
               SELECT 1 FROM account_assignments s
                WHERE s.organization_id = i.organization_id
                  AND s.project_id = i.project_id
                  AND s.attempt_id = a.id
                  AND s.state <> 'held'
           )
           AND (
               NOT EXISTS (
                   SELECT 1 FROM project_budgets b
                    WHERE b.organization_id = i.organization_id
                      AND b.project_id = i.project_id
               )
               OR EXISTS (
                   SELECT 1 FROM cost_reservations r
                    WHERE r.attempt_id = a.id AND r.state = 'held'
               )
           )
        RETURNING a.id AS attempt_id
    )
    SELECT i.attempt_id,
           CASE
               WHEN NOT EXISTS (
                   SELECT 1 FROM api_keys k
                    WHERE k.id = i.key_id
                      AND k.organization_id = i.organization_id
                      AND k.project_id = i.project_id
                      AND k.revoked_at IS NULL
                      AND k.expires_at > clock_timestamp()
                      AND i.model_alias = ANY(k.allowed_models)
               ) THEN 'unauthorized'
               WHEN EXISTS (
                   SELECT 1 FROM account_assignments s
                   JOIN supplier_accounts a
                     ON a.organization_id = s.organization_id
                    AND a.project_id = s.project_id
                    AND a.id = s.account_id
                   WHERE s.organization_id = i.organization_id
                     AND s.project_id = i.project_id
                     AND s.attempt_id = i.attempt_id
                     AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                              AND a.credential_revision = s.credential_revision)
               ) THEN 'account_unavailable'
               WHEN EXISTS (
                   SELECT 1 FROM provider_offers offer
                   WHERE offer.model_alias = i.model_alias
                     AND NOT EXISTS (
                         SELECT 1 FROM vendor_models m
                         JOIN vendors v ON v.id = m.vendor_id
                         WHERE m.alias = i.model_alias
                           AND m.vendor_id = offer.vendor_id
                           AND m.upstream_model = i.upstream_model
                           AND v.api_base IS NOT DISTINCT FROM i.api_base
                           AND offer.active
                           AND offer.current_revision IS NOT NULL
                     )
               ) THEN 'account_unavailable'
               WHEN d.attempt_id IS NOT NULL THEN 'admitted'
               ELSE 'conflict'
           END::TEXT AS status
      FROM input i
      LEFT JOIN dispatched d ON d.attempt_id = i.attempt_id
     ORDER BY i.position;
END;
$$;

-- @niu-legacy-migration 0024_wildcard_gateway_admission.sql 13641
-- Preserve all-model API key grants in batched admission and dispatch checks.
CREATE OR REPLACE FUNCTION niu_admit_unpriced_gateway_batch_with_route(
    operation_ids UUID[],
    attempt_ids UUID[],
    organization_ids UUID[],
    project_ids UUID[],
    key_ids UUID[],
    model_aliases TEXT[],
    task_ids TEXT[],
    revisions TEXT[],
    upstream_models TEXT[],
    api_bases TEXT[]
)
RETURNS TABLE (attempt_id UUID, status TEXT)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    request_count INTEGER;
    changed BIGINT;
BEGIN
    request_count := cardinality(operation_ids);
    IF request_count IS NULL OR request_count < 1 OR request_count > 64
        OR cardinality(attempt_ids) IS DISTINCT FROM request_count
        OR cardinality(organization_ids) IS DISTINCT FROM request_count
        OR cardinality(project_ids) IS DISTINCT FROM request_count
        OR cardinality(key_ids) IS DISTINCT FROM request_count
        OR cardinality(model_aliases) IS DISTINCT FROM request_count
        OR cardinality(task_ids) IS DISTINCT FROM request_count
        OR cardinality(revisions) IS DISTINCT FROM request_count
        OR cardinality(upstream_models) IS DISTINCT FROM request_count
        OR cardinality(api_bases) IS DISTINCT FROM request_count THEN
        RAISE EXCEPTION 'invalid gateway admission batch' USING ERRCODE = '22023';
    END IF;

    WITH input AS MATERIALIZED (
        SELECT request.operation_id, request.attempt_id,
               request.organization_id, request.project_id, request.key_id,
               request.model_alias, request.task_id, request.revision,
               request.upstream_model, request.api_base
          FROM unnest(operation_ids, attempt_ids, organization_ids, project_ids,
                      key_ids, model_aliases, task_ids, revisions,
                      upstream_models, api_bases)
               AS request(operation_id, attempt_id, organization_id, project_id,
                          key_id, model_alias, task_id, revision,
                          upstream_model, api_base)
    ), inserted_operations AS (
        INSERT INTO operations (id, organization_id, project_id, model_alias, task_id)
        SELECT i.operation_id, i.organization_id, i.project_id, i.model_alias, i.task_id
          FROM input i
        RETURNING id
    ), inserted_attempts AS (
        INSERT INTO attempts
            (id, organization_id, project_id, operation_id, resource_id, offer_revision)
        SELECT i.attempt_id, i.organization_id, i.project_id, i.operation_id,
               i.model_alias, i.revision
          FROM input i
          JOIN inserted_operations o ON o.id = i.operation_id
        RETURNING id
    )
    SELECT count(*) INTO changed FROM inserted_attempts;
    IF changed <> request_count THEN
        RAISE EXCEPTION 'gateway admission insert count mismatch' USING ERRCODE = '22023';
    END IF;

    PERFORM k.id
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids)
           AS input(attempt_id, organization_id, project_id, key_id)
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
      JOIN projects p
        ON p.organization_id = k.organization_id
       AND p.id = k.project_id
     WHERE k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
     FOR SHARE OF k, p;

    PERFORM a.id
      FROM unnest(attempt_ids, organization_ids, project_ids)
           AS input(attempt_id, organization_id, project_id)
      JOIN account_assignments s
        ON s.organization_id = input.organization_id
       AND s.project_id = input.project_id
       AND s.attempt_id = input.attempt_id
      JOIN supplier_accounts a
        ON a.organization_id = s.organization_id
       AND a.project_id = s.project_id
       AND a.id = s.account_id
     FOR SHARE OF a;

    PERFORM o.id
      FROM unnest(model_aliases, upstream_models, api_bases)
           AS input(model_alias, upstream_model, api_base)
      JOIN provider_offers o ON o.model_alias = input.model_alias
      JOIN vendor_models m ON m.alias = input.model_alias
      JOIN vendors v ON v.id = m.vendor_id
     FOR SHARE OF o, m, v;

    -- A published customer tariff is bound only when this key is eligible to
    -- use the model. Its immutable revision records the actual rate in effect.
    INSERT INTO customer_attempt_tariffs (attempt_id, revision_id)
    SELECT input.attempt_id, tariff.current_revision
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids, model_aliases)
           AS input(attempt_id, organization_id, project_id, key_id, model_alias)
      JOIN customer_tariffs tariff
        ON tariff.organization_id = input.organization_id
       AND tariff.project_id = input.project_id
       AND tariff.model_alias = input.model_alias
       AND tariff.current_revision IS NOT NULL
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND (input.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
     WHERE NOT EXISTS (
           SELECT 1 FROM account_assignments s
           JOIN supplier_accounts a
             ON a.organization_id = s.organization_id
            AND a.project_id = s.project_id
            AND a.id = s.account_id
           WHERE s.organization_id = input.organization_id
             AND s.project_id = input.project_id
             AND s.attempt_id = input.attempt_id
             AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                      AND a.credential_revision = s.credential_revision)
       )
       AND NOT EXISTS (
           SELECT 1 FROM project_budgets b
            WHERE b.organization_id = input.organization_id
              AND b.project_id = input.project_id
              AND NOT EXISTS (
                  SELECT 1 FROM cost_reservations r
                   WHERE r.attempt_id = input.attempt_id AND r.state = 'held'
              )
       )
    ON CONFLICT ON CONSTRAINT customer_attempt_tariffs_pkey DO NOTHING;

    -- Supplier attribution is captured atomically. A known offer that no
    -- longer matches the live route is rejected below before any dispatch.
    INSERT INTO provider_attempt_offers (attempt_id, provider_id, offer_id, revision_id)
    SELECT input.attempt_id, offer.provider_id, offer.id, offer.current_revision
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids,
                  model_aliases, upstream_models, api_bases)
           AS input(attempt_id, organization_id, project_id, key_id,
                    model_alias, upstream_model, api_base)
      JOIN provider_offers offer
        ON offer.model_alias = input.model_alias
       AND offer.active
       AND offer.current_revision IS NOT NULL
      JOIN vendor_models model
        ON model.alias = input.model_alias
       AND model.vendor_id = offer.vendor_id
       AND model.upstream_model = input.upstream_model
      JOIN vendors vendor
        ON vendor.id = model.vendor_id
       AND vendor.api_base IS NOT DISTINCT FROM input.api_base
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND (input.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
     WHERE NOT EXISTS (
           SELECT 1 FROM account_assignments s
           JOIN supplier_accounts a
             ON a.organization_id = s.organization_id
            AND a.project_id = s.project_id
            AND a.id = s.account_id
           WHERE s.organization_id = input.organization_id
             AND s.project_id = input.project_id
             AND s.attempt_id = input.attempt_id
             AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                      AND a.credential_revision = s.credential_revision)
       )
       AND NOT EXISTS (
           SELECT 1 FROM project_budgets b
            WHERE b.organization_id = input.organization_id
              AND b.project_id = input.project_id
              AND NOT EXISTS (
                  SELECT 1 FROM cost_reservations r
                   WHERE r.attempt_id = input.attempt_id AND r.state = 'held'
              )
       )
    ON CONFLICT ON CONSTRAINT provider_attempt_offers_pkey DO NOTHING;

    RETURN QUERY
    WITH input AS MATERIALIZED (
        SELECT request.attempt_id, request.organization_id,
               request.project_id, request.key_id, request.model_alias,
               request.upstream_model, request.api_base, request.position
          FROM unnest(attempt_ids, organization_ids, project_ids, key_ids,
                      model_aliases, upstream_models, api_bases)
               WITH ORDINALITY AS request(attempt_id, organization_id,
                   project_id, key_id, model_alias, upstream_model, api_base, position)
    ), dispatched AS (
        UPDATE attempts a
           SET execution = 'may_have_executed',
               dispatched_at = clock_timestamp(),
               api_key_id = i.key_id
          FROM input i, operations o, api_keys k
         WHERE a.organization_id = i.organization_id
           AND a.project_id = i.project_id
           AND a.id = i.attempt_id
           AND a.execution = 'not_sent'
           AND o.organization_id = a.organization_id
           AND o.project_id = a.project_id
           AND o.id = a.operation_id
           AND o.model_alias = i.model_alias
           AND k.id = i.key_id
           AND k.organization_id = i.organization_id
           AND k.project_id = i.project_id
           AND (o.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
           AND k.expires_at > clock_timestamp()
           AND k.revoked_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM provider_offers offer
               WHERE offer.model_alias = i.model_alias
                 AND NOT EXISTS (
                     SELECT 1 FROM provider_offers current_offer
                     JOIN vendor_models m
                       ON m.alias = current_offer.model_alias
                      AND m.vendor_id = current_offer.vendor_id
                      AND m.upstream_model = i.upstream_model
                     JOIN vendors v
                       ON v.id = m.vendor_id
                      AND v.api_base IS NOT DISTINCT FROM i.api_base
                     WHERE current_offer.id = offer.id
                       AND current_offer.active
                       AND current_offer.current_revision IS NOT NULL
                 )
           )
           AND NOT EXISTS (
               SELECT 1 FROM account_assignments s
                WHERE s.organization_id = i.organization_id
                  AND s.project_id = i.project_id
                  AND s.attempt_id = a.id
                  AND s.state <> 'held'
           )
           AND (
               NOT EXISTS (
                   SELECT 1 FROM project_budgets b
                    WHERE b.organization_id = i.organization_id
                      AND b.project_id = i.project_id
               )
               OR EXISTS (
                   SELECT 1 FROM cost_reservations r
                    WHERE r.attempt_id = a.id AND r.state = 'held'
               )
           )
        RETURNING a.id AS attempt_id
    )
    SELECT i.attempt_id,
           CASE
               WHEN NOT EXISTS (
                   SELECT 1 FROM api_keys k
                    WHERE k.id = i.key_id
                      AND k.organization_id = i.organization_id
                      AND k.project_id = i.project_id
                      AND k.revoked_at IS NULL
                      AND k.expires_at > clock_timestamp()
                      AND (i.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
               ) THEN 'unauthorized'
               WHEN EXISTS (
                   SELECT 1 FROM account_assignments s
                   JOIN supplier_accounts a
                     ON a.organization_id = s.organization_id
                    AND a.project_id = s.project_id
                    AND a.id = s.account_id
                   WHERE s.organization_id = i.organization_id
                     AND s.project_id = i.project_id
                     AND s.attempt_id = i.attempt_id
                     AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                              AND a.credential_revision = s.credential_revision)
               ) THEN 'account_unavailable'
               WHEN EXISTS (
                   SELECT 1 FROM provider_offers offer
                   WHERE offer.model_alias = i.model_alias
                     AND NOT EXISTS (
                         SELECT 1 FROM vendor_models m
                         JOIN vendors v ON v.id = m.vendor_id
                         WHERE m.alias = i.model_alias
                           AND m.vendor_id = offer.vendor_id
                           AND m.upstream_model = i.upstream_model
                           AND v.api_base IS NOT DISTINCT FROM i.api_base
                           AND offer.active
                           AND offer.current_revision IS NOT NULL
                     )
               ) THEN 'account_unavailable'
               WHEN d.attempt_id IS NOT NULL THEN 'admitted'
               ELSE 'conflict'
           END::TEXT AS status
      FROM input i
      LEFT JOIN dispatched d ON d.attempt_id = i.attempt_id
     ORDER BY i.position;
END;
$$;

-- @niu-legacy-migration 0025_chat_sessions.sql 630
-- Chat content is separate from the accounting/attempt ledger.
CREATE TABLE chat_sessions (
    id UUID NOT NULL,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    owner TEXT NOT NULL,
    payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, project_id, owner, id),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id)
);
CREATE INDEX chat_sessions_recent ON chat_sessions (organization_id, project_id, owner, updated_at DESC);

-- @niu-legacy-migration 0026_codex_usage_report.sql 3337
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

-- @niu-legacy-migration 0027_codex_usage_import_confirmation.sql 149
ALTER TABLE codex_usage_imports
    ADD COLUMN unconfirmed_response_count BIGINT NOT NULL DEFAULT 0
        CHECK (unconfirmed_response_count >= 0);

-- @niu-legacy-migration 0028_codex_paid_overflow.sql 183
ALTER TABLE codex_usage_fee_settings
    ADD COLUMN paid_overflow_usd_cents BIGINT
        CHECK (paid_overflow_usd_cents IS NULL OR paid_overflow_usd_cents BETWEEN 0 AND 100000000);

-- @niu-legacy-migration 0029_supplier_qualification.sql 5543
-- Offers are not eligible for dispatch until both the Supplier and the exact
-- model/rate revision have current, installation-reviewed evidence.
ALTER TABLE provider_offers ALTER COLUMN active SET DEFAULT FALSE;
UPDATE provider_offers SET active = FALSE;

CREATE TABLE provider_qualification_reviews (
    id UUID PRIMARY KEY,
    provider_id UUID NOT NULL REFERENCES provider_businesses(id),
    supply_rights_sha256 TEXT NOT NULL CHECK (supply_rights_sha256 ~ '^[0-9a-f]{64}$'),
    supply_capability_sha256 TEXT NOT NULL CHECK (supply_capability_sha256 ~ '^[0-9a-f]{64}$'),
    data_handling_sha256 TEXT NOT NULL CHECK (data_handling_sha256 ~ '^[0-9a-f]{64}$'),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    reviewer_operator_id UUID REFERENCES admin_operators(id),
    UNIQUE (provider_id, id),
    CHECK (valid_until > reviewed_at),
    CHECK (revoked_at IS NULL OR revoked_at >= reviewed_at)
);

CREATE TABLE provider_offer_qualification_reviews (
    id UUID PRIMARY KEY,
    provider_id UUID NOT NULL,
    offer_id UUID NOT NULL,
    rate_revision UUID NOT NULL,
    model_identity_sha256 TEXT NOT NULL CHECK (model_identity_sha256 ~ '^[0-9a-f]{64}$'),
    protocol_matrix_sha256 TEXT NOT NULL CHECK (protocol_matrix_sha256 ~ '^[0-9a-f]{64}$'),
    protocol_matrix_version TEXT NOT NULL CHECK (length(trim(protocol_matrix_version)) BETWEEN 1 AND 100),
    data_handling_sha256 TEXT NOT NULL CHECK (data_handling_sha256 ~ '^[0-9a-f]{64}$'),
    availability_sha256 TEXT NOT NULL CHECK (availability_sha256 ~ '^[0-9a-f]{64}$'),
    agreed_rates_sha256 TEXT NOT NULL CHECK (agreed_rates_sha256 ~ '^[0-9a-f]{64}$'),
    reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_until TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    reviewer_operator_id UUID REFERENCES admin_operators(id),
    FOREIGN KEY (provider_id, offer_id) REFERENCES provider_offers(provider_id, id),
    FOREIGN KEY (offer_id, rate_revision) REFERENCES provider_offer_revisions(offer_id, id),
    CHECK (valid_until > reviewed_at),
    CHECK (revoked_at IS NULL OR revoked_at >= reviewed_at)
);

CREATE INDEX provider_qualification_current
    ON provider_qualification_reviews(provider_id, valid_until DESC)
    WHERE revoked_at IS NULL;
CREATE INDEX provider_offer_qualification_current
    ON provider_offer_qualification_reviews(offer_id, rate_revision, valid_until DESC)
    WHERE revoked_at IS NULL;

CREATE FUNCTION niu_supplier_qualification_current(p_provider UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM provider_qualification_reviews q
         WHERE q.provider_id = p_provider
           AND q.revoked_at IS NULL
           AND q.valid_until > now()
    )
$$;

CREATE FUNCTION niu_offer_qualification_current(
    p_provider UUID, p_offer UUID, p_revision UUID
)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT niu_supplier_qualification_current(p_provider)
       AND EXISTS (
        SELECT 1 FROM provider_offer_qualification_reviews q
         WHERE q.provider_id = p_provider
           AND q.offer_id = p_offer
           AND q.rate_revision = p_revision
           AND q.revoked_at IS NULL
           AND q.valid_until > now()
    )
$$;

CREATE FUNCTION niu_guard_provider_offer_activation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.active AND NOT niu_offer_qualification_current(
        NEW.provider_id, NEW.id, NEW.current_revision
    ) THEN
        RAISE EXCEPTION 'supplier offer lacks current qualification evidence'
            USING ERRCODE = 'P0007';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER provider_offer_activation_requires_qualification
    BEFORE INSERT OR UPDATE OF active, current_revision
    ON provider_offers FOR EACH ROW
    EXECUTE FUNCTION niu_guard_provider_offer_activation();

CREATE FUNCTION niu_guard_provider_offer_binding() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT niu_offer_qualification_current(
        NEW.provider_id, NEW.offer_id, NEW.revision_id
    ) THEN
        RAISE EXCEPTION 'supplier offer lacks current qualification evidence'
            USING ERRCODE = 'P0007';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER provider_offer_binding_requires_qualification
    BEFORE INSERT ON provider_attempt_offers FOR EACH ROW
    EXECUTE FUNCTION niu_guard_provider_offer_binding();

CREATE FUNCTION niu_guard_qualified_supplier_dispatch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.execution = 'not_sent'
       AND NEW.execution = 'may_have_executed'
       AND EXISTS (
           SELECT 1 FROM provider_attempt_offers b
            WHERE b.attempt_id = NEW.id
              AND NOT niu_offer_qualification_current(
                  b.provider_id, b.offer_id, b.revision_id
              )
       ) THEN
        RAISE EXCEPTION 'supplier offer qualification expired before dispatch'
            USING ERRCODE = 'P0007';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER attempts_require_current_supplier_qualification
    BEFORE UPDATE OF execution ON attempts FOR EACH ROW
    EXECUTE FUNCTION niu_guard_qualified_supplier_dispatch();

CREATE TRIGGER immutable_provider_qualification_review
    BEFORE UPDATE OR DELETE ON provider_qualification_reviews
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_provider_offer_qualification_review
    BEFORE UPDATE OR DELETE ON provider_offer_qualification_reviews
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0030_supplier_qualification_revocation.sql 4363
ALTER TABLE provider_offer_qualification_reviews
    ADD CONSTRAINT provider_offer_qualification_identity
    UNIQUE (provider_id, offer_id, id);

ALTER TABLE provider_businesses ADD COLUMN current_qualification_review UUID;
ALTER TABLE provider_businesses
    ADD CONSTRAINT provider_business_current_qualification
    FOREIGN KEY (id, current_qualification_review)
    REFERENCES provider_qualification_reviews(provider_id, id);

ALTER TABLE provider_offers ADD COLUMN current_qualification_review UUID;
ALTER TABLE provider_offers
    ADD CONSTRAINT provider_offer_current_qualification
    FOREIGN KEY (provider_id, id, current_qualification_review)
    REFERENCES provider_offer_qualification_reviews(provider_id, offer_id, id);

CREATE TABLE provider_qualification_revocations (
    id UUID PRIMARY KEY,
    provider_id UUID NOT NULL REFERENCES provider_businesses(id),
    supplier_review_id UUID,
    offer_id UUID,
    offer_review_id UUID,
    reason_sha256 TEXT NOT NULL CHECK (reason_sha256 ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewer_operator_id UUID REFERENCES admin_operators(id),
    CHECK (
        (supplier_review_id IS NOT NULL AND offer_id IS NULL AND offer_review_id IS NULL)
        OR
        (supplier_review_id IS NULL AND offer_id IS NOT NULL AND offer_review_id IS NOT NULL)
    ),
    FOREIGN KEY (provider_id, supplier_review_id)
        REFERENCES provider_qualification_reviews(provider_id, id),
    FOREIGN KEY (provider_id, offer_id, offer_review_id)
        REFERENCES provider_offer_qualification_reviews(provider_id, offer_id, id),
    UNIQUE (supplier_review_id),
    UNIQUE (offer_review_id)
);

CREATE INDEX provider_qualification_revocations_by_supplier
    ON provider_qualification_revocations(provider_id, created_at DESC);

CREATE OR REPLACE FUNCTION niu_supplier_qualification_current(p_provider UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM provider_businesses p
        JOIN provider_qualification_reviews q
          ON q.provider_id = p.id
         AND q.id = p.current_qualification_review
         WHERE p.id = p_provider
           AND q.revoked_at IS NULL
           AND q.valid_until > now()
           AND NOT EXISTS (
               SELECT 1 FROM provider_qualification_revocations r
                WHERE r.supplier_review_id = q.id
           )
    )
$$;

CREATE OR REPLACE FUNCTION niu_offer_qualification_current(
    p_provider UUID, p_offer UUID, p_revision UUID
)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT niu_supplier_qualification_current(p_provider)
       AND EXISTS (
        SELECT 1 FROM provider_offers o
        JOIN provider_offer_qualification_reviews q
          ON q.provider_id = o.provider_id
         AND q.offer_id = o.id
         AND q.id = o.current_qualification_review
         WHERE o.provider_id = p_provider
           AND o.id = p_offer
           AND o.current_revision = p_revision
           AND q.rate_revision = p_revision
           AND q.revoked_at IS NULL
           AND q.valid_until > now()
           AND NOT EXISTS (
               SELECT 1 FROM provider_qualification_revocations r
                WHERE r.offer_review_id = q.id
           )
    )
$$;

CREATE OR REPLACE FUNCTION niu_guard_qualified_supplier_dispatch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.execution = 'not_sent'
       AND NEW.execution = 'may_have_executed'
       AND EXISTS (
           SELECT 1
             FROM provider_attempt_offers b
             LEFT JOIN provider_offers o
               ON o.provider_id = b.provider_id
              AND o.id = b.offer_id
            WHERE b.attempt_id = NEW.id
              AND (
                  o.id IS NULL
                  OR NOT o.active
                  OR o.current_revision IS DISTINCT FROM b.revision_id
                  OR NOT niu_offer_qualification_current(
                      b.provider_id, b.offer_id, b.revision_id
                  )
              )
       ) THEN
        RAISE EXCEPTION 'supplier offer qualification changed before dispatch'
            USING ERRCODE = 'P0007';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER immutable_provider_qualification_revocation
    BEFORE UPDATE OR DELETE ON provider_qualification_revocations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0031_codex_usage_consent.sql 373
ALTER TABLE codex_usage_imports
    ADD COLUMN consent_version TEXT,
    ADD COLUMN consented_at TIMESTAMPTZ,
    ADD CONSTRAINT codex_usage_imports_consent_version
        CHECK (consent_version IS NULL OR consent_version = 'codex-rollout-import-v1'),
    ADD CONSTRAINT codex_usage_imports_consent_pair
        CHECK ((consent_version IS NULL) = (consented_at IS NULL));

-- @niu-legacy-migration 0032_personal_agent_observations.sql 1825
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

-- @niu-legacy-migration 0033_agent_observation_fingerprints.sql 647
-- Preserve migration 32 and reject conflicting retries rather than silently
-- treating different usage under the same response key as a duplicate.
ALTER TABLE agent_observations ADD COLUMN response_fingerprint BYTEA;
-- Existing observations lack a canonical payload fingerprint. Retain them;
-- retries cannot overwrite them and require explicit reconciliation.
UPDATE agent_observations SET response_fingerprint = response_key;
ALTER TABLE agent_observations ALTER COLUMN response_fingerprint SET NOT NULL;
ALTER TABLE agent_observations ADD CONSTRAINT agent_observation_fingerprint_length
    CHECK (octet_length(response_fingerprint) = 32);

-- @niu-legacy-migration 0034_personal_agent_fee_settings.sql 536
CREATE TABLE agent_observation_fee_settings (
    owner_id UUID PRIMARY KEY REFERENCES admin_operators(id),
    period_from_ms BIGINT NOT NULL CHECK (period_from_ms >= 0),
    period_to_ms BIGINT NOT NULL CHECK (period_to_ms > period_from_ms AND period_to_ms - period_from_ms <= 31622400000),
    subscription_fee_usd_cents BIGINT CHECK (subscription_fee_usd_cents BETWEEN 0 AND 100000000),
    paid_overflow_usd_cents BIGINT CHECK (paid_overflow_usd_cents BETWEEN 0 AND 100000000),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- @niu-legacy-migration 0035_request_payloads.sql 627
-- Explicit per-request payload capture is separate from the metadata ledger.
CREATE TABLE request_payloads (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
    request_body JSONB NOT NULL,
    response_body TEXT NOT NULL,
    response_content_type TEXT NOT NULL,
    response_complete BOOLEAN NOT NULL,
    response_truncated BOOLEAN NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
    CHECK (octet_length(request_body::text) <= 2097152),
    CHECK (octet_length(response_body) <= 1048576)
);
CREATE INDEX request_payloads_expiry ON request_payloads(expires_at);

-- @niu-legacy-migration 0036_local_dev_sessions.sql 393
-- Loopback development login sessions survive gateway rebuilds/restarts.
CREATE TABLE local_dev_sessions (
    token_hash BYTEA PRIMARY KEY CHECK(octet_length(token_hash)=32),
    credential_hash BYTEA NOT NULL CHECK(octet_length(credential_hash)=32),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);
CREATE INDEX local_dev_session_expiry ON local_dev_sessions(expires_at);

-- @niu-legacy-migration 0037_request_timings.sql 575
CREATE TABLE request_timings (
    attempt_id uuid PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
    dispatch_ms bigint CHECK (dispatch_ms >= 0),
    headers_ms bigint NOT NULL CHECK (headers_ms >= 0),
    first_output_ms bigint CHECK (first_output_ms >= headers_ms),
    total_ms bigint NOT NULL CHECK (total_ms >= headers_ms),
    complete boolean NOT NULL,
    http_status integer NOT NULL CHECK (http_status BETWEEN 100 AND 599),
    CHECK (dispatch_ms IS NULL OR dispatch_ms <= headers_ms),
    CHECK (first_output_ms IS NULL OR first_output_ms <= total_ms)
);

-- @niu-legacy-migration 0038_interrupted_request_timings.sql 216
-- Cancellation may precede upstream response headers. Unknown values stay null.
ALTER TABLE request_timings ALTER COLUMN headers_ms DROP NOT NULL;
ALTER TABLE request_timings ALTER COLUMN http_status DROP NOT NULL;

-- @niu-legacy-migration 0039_supplier_configuration_ownership.sql 383
-- Explicit ownership; never infer a Supplier business from an adapter/name.
CREATE TABLE vendor_supplier_ownership (
    vendor_id UUID PRIMARY KEY REFERENCES vendors(id),
    provider_id UUID NOT NULL REFERENCES provider_businesses(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX vendor_supplier_ownership_provider ON vendor_supplier_ownership(provider_id);

-- @niu-legacy-migration 0040_supplier_association_audit.sql 343
ALTER TABLE vendor_audit_events DROP CONSTRAINT vendor_audit_events_action_check;
ALTER TABLE vendor_audit_events ADD CONSTRAINT vendor_audit_events_action_check CHECK (action IN (
    'vendor_created', 'vendor_updated', 'vendor_seeded',
    'vendor_model_created', 'vendor_model_updated', 'vendor_model_seeded',
    'supplier_associated'
));

-- @niu-legacy-migration 0041_personal_agent_traces.sql 1565
-- Metadata-only personal traces and least-privilege write credentials.
CREATE TABLE personal_agent_connections (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL REFERENCES admin_operators(id),
    name TEXT NOT NULL,
    source TEXT NOT NULL,
    client_version TEXT NOT NULL,
    consent_version TEXT NOT NULL CHECK (consent_version = 'agent-trace-metadata-v1'),
    token_hash BYTEA NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_received_at TIMESTAMPTZ,
    paused BOOLEAN NOT NULL DEFAULT FALSE,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(owner_id, id)
);
CREATE TABLE personal_agent_traces (
    id UUID PRIMARY KEY,
    owner_id UUID NOT NULL,
    connection_id UUID NOT NULL,
    source TEXT NOT NULL,
    record_id TEXT NOT NULL,
    name TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    time_basis TEXT NOT NULL CHECK (time_basis IN ('observed', 'received')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL,
    coverage TEXT NOT NULL,
    duration_ms BIGINT,
    span_count BIGINT NOT NULL,
    error_count BIGINT NOT NULL,
    model_calls BIGINT NOT NULL,
    tool_calls BIGINT NOT NULL,
    record JSONB NOT NULL,
    span_names JSONB NOT NULL,
    FOREIGN KEY(owner_id, connection_id) REFERENCES personal_agent_connections(owner_id, id),
    UNIQUE(owner_id, connection_id, record_id)
);
CREATE INDEX personal_agent_traces_range ON personal_agent_traces(owner_id, occurred_at DESC, id DESC);

-- @niu-legacy-migration 0042_workspace_guardrails.sql 771
CREATE TABLE workspace_guardrail_heads (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
    PRIMARY KEY (organization_id, project_id),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id)
);

CREATE TABLE workspace_guardrail_revisions (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    revision BIGINT NOT NULL CHECK (revision > 0),
    policy JSONB NOT NULL CHECK (jsonb_typeof(policy) = 'object'),
    activated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id, project_id, revision),
    FOREIGN KEY (organization_id, project_id) REFERENCES workspace_guardrail_heads(organization_id, project_id)
);

-- @niu-legacy-migration 0043_guardrail_activation_attribution.sql 434
ALTER TABLE workspace_guardrail_revisions
    ADD COLUMN activated_by TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN restored_from_revision BIGINT;
ALTER TABLE workspace_guardrail_revisions
    ADD CONSTRAINT guardrail_actor_bounded CHECK (length(activated_by) BETWEEN 1 AND 200),
    ADD CONSTRAINT guardrail_restore_prior CHECK (restored_from_revision IS NULL OR (restored_from_revision > 0 AND restored_from_revision < revision));

-- @niu-legacy-migration 0044_key_guardrail_assignments.sql 664
ALTER TABLE api_keys ADD CONSTRAINT api_keys_guardrail_scope UNIQUE (organization_id, project_id, id);
CREATE TABLE key_guardrail_assignments (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    policy_revision BIGINT NOT NULL,
    assignment_revision BIGINT NOT NULL DEFAULT 1 CHECK (assignment_revision > 0),
    PRIMARY KEY (organization_id, project_id, key_id),
    FOREIGN KEY (organization_id, project_id, key_id) REFERENCES api_keys(organization_id, project_id, id),
    FOREIGN KEY (organization_id, project_id, policy_revision) REFERENCES workspace_guardrail_revisions(organization_id, project_id, revision)
);

-- @niu-legacy-migration 0045_supplier_route_qualification.sql 2118
-- Qualification applies to the reviewed route, not only its model alias and rates.
-- Keep immutable evidence for audit, but require a new review after material changes.
CREATE FUNCTION niu_invalidate_supplier_route_qualification() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    affected RECORD;
BEGIN
    FOR affected IN
        UPDATE provider_offers
           SET active = FALSE, current_qualification_review = NULL
         WHERE vendor_id = OLD.id
           AND current_qualification_review IS NOT NULL
        RETURNING provider_id, id
    LOOP
        INSERT INTO provider_audit_events(provider_id, action, resource_id)
        VALUES (affected.provider_id, 'route_qualification_invalidated', affected.id);
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER supplier_configuration_requires_new_review
AFTER UPDATE OF api_base, adapter, credential_ciphertext ON vendors
FOR EACH ROW WHEN (
    OLD.api_base IS DISTINCT FROM NEW.api_base
    OR OLD.adapter IS DISTINCT FROM NEW.adapter
    OR OLD.credential_ciphertext IS DISTINCT FROM NEW.credential_ciphertext
)
EXECUTE FUNCTION niu_invalidate_supplier_route_qualification();

CREATE FUNCTION niu_invalidate_supplier_model_qualification() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    affected RECORD;
BEGIN
    FOR affected IN
        UPDATE provider_offers
           SET active = FALSE, current_qualification_review = NULL
         WHERE model_alias = OLD.alias
           AND current_qualification_review IS NOT NULL
        RETURNING provider_id, id
    LOOP
        INSERT INTO provider_audit_events(provider_id, action, resource_id)
        VALUES (affected.provider_id, 'model_qualification_invalidated', affected.id);
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER supplier_model_requires_new_review
AFTER UPDATE OF upstream_model, vendor_id, capabilities ON vendor_models
FOR EACH ROW WHEN (
    OLD.upstream_model IS DISTINCT FROM NEW.upstream_model
    OR OLD.vendor_id IS DISTINCT FROM NEW.vendor_id
    OR OLD.capabilities IS DISTINCT FROM NEW.capabilities
)
EXECUTE FUNCTION niu_invalidate_supplier_model_qualification();

-- @niu-legacy-migration 0046_supplier_dispatch_review.sql 2045
-- Pending attempts must use the exact review under which their route was prepared.
-- Historical rows stay unchanged; pending legacy rows without a pinned review fail closed.
ALTER TABLE provider_attempt_offers ADD COLUMN qualification_review_id UUID;
ALTER TABLE provider_attempt_offers ADD CONSTRAINT provider_attempt_review_identity
    FOREIGN KEY (provider_id, offer_id, qualification_review_id)
    REFERENCES provider_offer_qualification_reviews(provider_id, offer_id, id);

CREATE FUNCTION niu_pin_supplier_attempt_review() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    SELECT current_qualification_review INTO NEW.qualification_review_id
      FROM provider_offers
     WHERE provider_id = NEW.provider_id AND id = NEW.offer_id
     FOR SHARE;
    IF NEW.qualification_review_id IS NULL THEN
        RAISE EXCEPTION 'supplier attempt lacks a current qualification review'
            USING ERRCODE = 'P0007';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER pin_supplier_attempt_review
BEFORE INSERT ON provider_attempt_offers
FOR EACH ROW EXECUTE FUNCTION niu_pin_supplier_attempt_review();

CREATE OR REPLACE FUNCTION niu_guard_qualified_supplier_dispatch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.execution = 'not_sent'
       AND NEW.execution = 'may_have_executed'
       AND EXISTS (
           SELECT 1 FROM provider_attempt_offers b
           LEFT JOIN provider_offers o ON o.provider_id = b.provider_id AND o.id = b.offer_id
           WHERE b.attempt_id = NEW.id AND (
               o.id IS NULL OR NOT o.active
               OR o.current_revision IS DISTINCT FROM b.revision_id
               OR b.qualification_review_id IS NULL
               OR o.current_qualification_review IS DISTINCT FROM b.qualification_review_id
               OR NOT niu_offer_qualification_current(b.provider_id, b.offer_id, b.revision_id)
           )
       ) THEN
        RAISE EXCEPTION 'supplier offer qualification changed before dispatch'
            USING ERRCODE = 'P0007';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0047_supplier_dispatch_availability.sql 1284
-- Recheck Supplier and model route switches immediately before dispatch.
CREATE OR REPLACE FUNCTION niu_guard_qualified_supplier_dispatch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.execution = 'not_sent'
       AND NEW.execution = 'may_have_executed'
       AND EXISTS (
           SELECT 1 FROM provider_attempt_offers b
           LEFT JOIN provider_offers o ON o.provider_id = b.provider_id AND o.id = b.offer_id
           LEFT JOIN vendor_models m ON m.alias = o.model_alias
           LEFT JOIN vendors v ON v.id = m.vendor_id
           WHERE b.attempt_id = NEW.id AND (
               o.id IS NULL OR NOT o.active
               OR m.alias IS NULL OR v.id IS NULL
               OR NOT m.enabled OR NOT v.enabled
               OR m.vendor_id IS DISTINCT FROM o.vendor_id
               OR o.current_revision IS DISTINCT FROM b.revision_id
               OR b.qualification_review_id IS NULL
               OR o.current_qualification_review IS DISTINCT FROM b.qualification_review_id
               OR NOT niu_offer_qualification_current(b.provider_id, b.offer_id, b.revision_id)
           )
       ) THEN
        RAISE EXCEPTION 'supplier offer qualification changed before dispatch'
            USING ERRCODE = 'P0007';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0048_supplier_model_availability.sql 772
-- Keep catalog eligibility consistent with binding and dispatch checks.
-- Legacy routes without explicit offers retain their existing compatibility behavior.
CREATE FUNCTION niu_supplier_model_route_available(p_alias TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM provider_offers o
        LEFT JOIN vendor_models m ON m.alias = o.model_alias
        LEFT JOIN vendors v ON v.id = m.vendor_id
        WHERE o.model_alias = p_alias AND (
            NOT o.active
            OR NOT niu_offer_qualification_current(o.provider_id, o.id, o.current_revision)
            OR m.alias IS NULL OR v.id IS NULL
            OR NOT m.enabled OR NOT v.enabled
            OR m.vendor_id IS DISTINCT FROM o.vendor_id
        )
    )
$$;

-- @niu-legacy-migration 0049_key_guardrail_audit.sql 897
CREATE TABLE key_guardrail_assignment_events (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    assignment_revision BIGINT NOT NULL CHECK (assignment_revision > 0),
    policy_revision BIGINT NOT NULL,
    actor TEXT NOT NULL CHECK (length(actor) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id, project_id, key_id, assignment_revision),
    FOREIGN KEY (organization_id, project_id, key_id)
        REFERENCES api_keys(organization_id, project_id, id),
    FOREIGN KEY (organization_id, project_id, policy_revision)
        REFERENCES workspace_guardrail_revisions(organization_id, project_id, revision)
);
CREATE TRIGGER immutable_key_guardrail_assignment_event
BEFORE UPDATE OR DELETE ON key_guardrail_assignment_events
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0050_key_guardrail_removal.sql 256
-- Retain assignment revisions after removal so stale writers cannot recreate policy.
ALTER TABLE key_guardrail_assignments ALTER COLUMN policy_revision DROP NOT NULL;
ALTER TABLE key_guardrail_assignment_events ALTER COLUMN policy_revision DROP NOT NULL;

-- @niu-legacy-migration 0051_dispatch_model_guardrails.sql 2327
CREATE FUNCTION niu_model_rule_permits(rule JSONB, model TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF jsonb_typeof(rule) IS DISTINCT FROM 'object' THEN RETURN FALSE; END IF;
    CASE rule->>'mode'
        WHEN 'inherit' THEN RETURN TRUE;
        WHEN 'allow_all' THEN RETURN TRUE;
        WHEN 'deny_all' THEN RETURN FALSE;
        WHEN 'allow_list' THEN
            IF jsonb_typeof(rule->'values') IS DISTINCT FROM 'array' THEN RETURN FALSE; END IF;
            RETURN (rule->'values') ? model;
        ELSE RETURN FALSE;
    END CASE;
END;
$$;

CREATE FUNCTION niu_check_dispatch_model_guardrails() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    requested_model TEXT;
    policy JSONB;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    -- Activation takes this same transaction lock before changing the workspace head.
    PERFORM pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||NEW.organization_id::text||':'||NEW.project_id::text,0));
    -- Key assignment/revocation takes the key row lock before changing restrictions.
    PERFORM id FROM api_keys WHERE id=NEW.api_key_id FOR SHARE;
    SELECT model_alias INTO requested_model FROM operations WHERE id=NEW.operation_id;
    FOR policy IN
        SELECT r.policy FROM workspace_guardrail_heads h
        JOIN workspace_guardrail_revisions r USING(organization_id,project_id,revision)
        WHERE h.organization_id=NEW.organization_id AND h.project_id=NEW.project_id
        UNION ALL
        SELECT r.policy FROM key_guardrail_assignments a
        JOIN workspace_guardrail_revisions r ON r.organization_id=a.organization_id
            AND r.project_id=a.project_id AND r.revision=a.policy_revision
        WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id
    LOOP
        IF policy->>'schema_version' IS DISTINCT FROM '1'
           OR NOT niu_model_rule_permits(policy->'models',requested_model) THEN
            RAISE EXCEPTION 'model guardrail changed before dispatch' USING ERRCODE='P0006';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER dispatch_requires_current_model_guardrails
BEFORE UPDATE OF execution ON attempts
FOR EACH ROW EXECUTE FUNCTION niu_check_dispatch_model_guardrails();

-- @niu-legacy-migration 0052_dispatch_provider_guardrails.sql 16336
-- Preserve the legacy ten-argument batch function; new callers record Provider identity.
ALTER TABLE attempts ADD COLUMN dispatch_provider TEXT CHECK (length(dispatch_provider) BETWEEN 1 AND 200);
-- Preserve all-model API key grants in batched admission and dispatch checks.
CREATE OR REPLACE FUNCTION niu_admit_unpriced_gateway_batch_with_route(
    operation_ids UUID[],
    attempt_ids UUID[],
    organization_ids UUID[],
    project_ids UUID[],
    key_ids UUID[],
    model_aliases TEXT[],
    task_ids TEXT[],
    revisions TEXT[],
    upstream_models TEXT[],
    api_bases TEXT[],
    dispatch_providers TEXT[]
)
RETURNS TABLE (attempt_id UUID, status TEXT)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    request_count INTEGER;
    changed BIGINT;
BEGIN
    request_count := cardinality(operation_ids);
    IF request_count IS NULL OR request_count < 1 OR request_count > 64
        OR cardinality(attempt_ids) IS DISTINCT FROM request_count
        OR cardinality(organization_ids) IS DISTINCT FROM request_count
        OR cardinality(project_ids) IS DISTINCT FROM request_count
        OR cardinality(key_ids) IS DISTINCT FROM request_count
        OR cardinality(model_aliases) IS DISTINCT FROM request_count
        OR cardinality(task_ids) IS DISTINCT FROM request_count
        OR cardinality(revisions) IS DISTINCT FROM request_count
        OR cardinality(upstream_models) IS DISTINCT FROM request_count
        OR cardinality(api_bases) IS DISTINCT FROM request_count
        OR cardinality(dispatch_providers) IS DISTINCT FROM request_count THEN
        RAISE EXCEPTION 'invalid gateway admission batch' USING ERRCODE = '22023';
    END IF;

    WITH input AS MATERIALIZED (
        SELECT request.operation_id, request.attempt_id,
               request.organization_id, request.project_id, request.key_id,
               request.model_alias, request.task_id, request.revision,
               request.upstream_model, request.api_base, request.dispatch_provider
          FROM unnest(operation_ids, attempt_ids, organization_ids, project_ids,
                      key_ids, model_aliases, task_ids, revisions,
                      upstream_models, api_bases, dispatch_providers)
               AS request(operation_id, attempt_id, organization_id, project_id,
                          key_id, model_alias, task_id, revision,
                          upstream_model, api_base, dispatch_provider)
    ), inserted_operations AS (
        INSERT INTO operations (id, organization_id, project_id, model_alias, task_id)
        SELECT i.operation_id, i.organization_id, i.project_id, i.model_alias, i.task_id
          FROM input i
        RETURNING id
    ), inserted_attempts AS (
        INSERT INTO attempts
            (id, organization_id, project_id, operation_id, resource_id, offer_revision, dispatch_provider)
        SELECT i.attempt_id, i.organization_id, i.project_id, i.operation_id,
               i.model_alias, i.revision, i.dispatch_provider
          FROM input i
          JOIN inserted_operations o ON o.id = i.operation_id
        RETURNING id
    )
    SELECT count(*) INTO changed FROM inserted_attempts;
    IF changed <> request_count THEN
        RAISE EXCEPTION 'gateway admission insert count mismatch' USING ERRCODE = '22023';
    END IF;

    PERFORM k.id
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids)
           AS input(attempt_id, organization_id, project_id, key_id)
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
      JOIN projects p
        ON p.organization_id = k.organization_id
       AND p.id = k.project_id
     WHERE k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
     FOR SHARE OF k, p;

    PERFORM a.id
      FROM unnest(attempt_ids, organization_ids, project_ids)
           AS input(attempt_id, organization_id, project_id)
      JOIN account_assignments s
        ON s.organization_id = input.organization_id
       AND s.project_id = input.project_id
       AND s.attempt_id = input.attempt_id
      JOIN supplier_accounts a
        ON a.organization_id = s.organization_id
       AND a.project_id = s.project_id
       AND a.id = s.account_id
     FOR SHARE OF a;

    PERFORM o.id
      FROM unnest(model_aliases, upstream_models, api_bases)
           AS input(model_alias, upstream_model, api_base)
      JOIN provider_offers o ON o.model_alias = input.model_alias
      JOIN vendor_models m ON m.alias = input.model_alias
      JOIN vendors v ON v.id = m.vendor_id
     FOR SHARE OF o, m, v;

    -- A published customer tariff is bound only when this key is eligible to
    -- use the model. Its immutable revision records the actual rate in effect.
    INSERT INTO customer_attempt_tariffs (attempt_id, revision_id)
    SELECT input.attempt_id, tariff.current_revision
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids, model_aliases)
           AS input(attempt_id, organization_id, project_id, key_id, model_alias)
      JOIN customer_tariffs tariff
        ON tariff.organization_id = input.organization_id
       AND tariff.project_id = input.project_id
       AND tariff.model_alias = input.model_alias
       AND tariff.current_revision IS NOT NULL
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND (input.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
     WHERE NOT EXISTS (
           SELECT 1 FROM account_assignments s
           JOIN supplier_accounts a
             ON a.organization_id = s.organization_id
            AND a.project_id = s.project_id
            AND a.id = s.account_id
           WHERE s.organization_id = input.organization_id
             AND s.project_id = input.project_id
             AND s.attempt_id = input.attempt_id
             AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                      AND a.credential_revision = s.credential_revision)
       )
       AND NOT EXISTS (
           SELECT 1 FROM project_budgets b
            WHERE b.organization_id = input.organization_id
              AND b.project_id = input.project_id
              AND NOT EXISTS (
                  SELECT 1 FROM cost_reservations r
                   WHERE r.attempt_id = input.attempt_id AND r.state = 'held'
              )
       )
    ON CONFLICT ON CONSTRAINT customer_attempt_tariffs_pkey DO NOTHING;

    -- Supplier attribution is captured atomically. A known offer that no
    -- longer matches the live route is rejected below before any dispatch.
    INSERT INTO provider_attempt_offers (attempt_id, provider_id, offer_id, revision_id)
    SELECT input.attempt_id, offer.provider_id, offer.id, offer.current_revision
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids,
                  model_aliases, upstream_models, api_bases)
           AS input(attempt_id, organization_id, project_id, key_id,
                    model_alias, upstream_model, api_base)
      JOIN provider_offers offer
        ON offer.model_alias = input.model_alias
       AND offer.active
       AND offer.current_revision IS NOT NULL
      JOIN vendor_models model
        ON model.alias = input.model_alias
       AND model.vendor_id = offer.vendor_id
       AND model.upstream_model = input.upstream_model
      JOIN vendors vendor
        ON vendor.id = model.vendor_id
       AND vendor.api_base IS NOT DISTINCT FROM input.api_base
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND (input.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
     WHERE NOT EXISTS (
           SELECT 1 FROM account_assignments s
           JOIN supplier_accounts a
             ON a.organization_id = s.organization_id
            AND a.project_id = s.project_id
            AND a.id = s.account_id
           WHERE s.organization_id = input.organization_id
             AND s.project_id = input.project_id
             AND s.attempt_id = input.attempt_id
             AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                      AND a.credential_revision = s.credential_revision)
       )
       AND NOT EXISTS (
           SELECT 1 FROM project_budgets b
            WHERE b.organization_id = input.organization_id
              AND b.project_id = input.project_id
              AND NOT EXISTS (
                  SELECT 1 FROM cost_reservations r
                   WHERE r.attempt_id = input.attempt_id AND r.state = 'held'
              )
       )
    ON CONFLICT ON CONSTRAINT provider_attempt_offers_pkey DO NOTHING;

    RETURN QUERY
    WITH input AS MATERIALIZED (
        SELECT request.attempt_id, request.organization_id,
               request.project_id, request.key_id, request.model_alias,
               request.upstream_model, request.api_base, request.position
          FROM unnest(attempt_ids, organization_ids, project_ids, key_ids,
                      model_aliases, upstream_models, api_bases)
               WITH ORDINALITY AS request(attempt_id, organization_id,
                   project_id, key_id, model_alias, upstream_model, api_base, position)
    ), dispatched AS (
        UPDATE attempts a
           SET execution = 'may_have_executed',
               dispatched_at = clock_timestamp(),
               api_key_id = i.key_id
          FROM input i, operations o, api_keys k
         WHERE a.organization_id = i.organization_id
           AND a.project_id = i.project_id
           AND a.id = i.attempt_id
           AND a.execution = 'not_sent'
           AND o.organization_id = a.organization_id
           AND o.project_id = a.project_id
           AND o.id = a.operation_id
           AND o.model_alias = i.model_alias
           AND k.id = i.key_id
           AND k.organization_id = i.organization_id
           AND k.project_id = i.project_id
           AND (o.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
           AND k.expires_at > clock_timestamp()
           AND k.revoked_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM provider_offers offer
               WHERE offer.model_alias = i.model_alias
                 AND NOT EXISTS (
                     SELECT 1 FROM provider_offers current_offer
                     JOIN vendor_models m
                       ON m.alias = current_offer.model_alias
                      AND m.vendor_id = current_offer.vendor_id
                      AND m.upstream_model = i.upstream_model
                     JOIN vendors v
                       ON v.id = m.vendor_id
                      AND v.api_base IS NOT DISTINCT FROM i.api_base
                     WHERE current_offer.id = offer.id
                       AND current_offer.active
                       AND current_offer.current_revision IS NOT NULL
                 )
           )
           AND NOT EXISTS (
               SELECT 1 FROM account_assignments s
                WHERE s.organization_id = i.organization_id
                  AND s.project_id = i.project_id
                  AND s.attempt_id = a.id
                  AND s.state <> 'held'
           )
           AND (
               NOT EXISTS (
                   SELECT 1 FROM project_budgets b
                    WHERE b.organization_id = i.organization_id
                      AND b.project_id = i.project_id
               )
               OR EXISTS (
                   SELECT 1 FROM cost_reservations r
                    WHERE r.attempt_id = a.id AND r.state = 'held'
               )
           )
        RETURNING a.id AS attempt_id
    )
    SELECT i.attempt_id,
           CASE
               WHEN NOT EXISTS (
                   SELECT 1 FROM api_keys k
                    WHERE k.id = i.key_id
                      AND k.organization_id = i.organization_id
                      AND k.project_id = i.project_id
                      AND k.revoked_at IS NULL
                      AND k.expires_at > clock_timestamp()
                      AND (i.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
               ) THEN 'unauthorized'
               WHEN EXISTS (
                   SELECT 1 FROM account_assignments s
                   JOIN supplier_accounts a
                     ON a.organization_id = s.organization_id
                    AND a.project_id = s.project_id
                    AND a.id = s.account_id
                   WHERE s.organization_id = i.organization_id
                     AND s.project_id = i.project_id
                     AND s.attempt_id = i.attempt_id
                     AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                              AND a.credential_revision = s.credential_revision)
               ) THEN 'account_unavailable'
               WHEN EXISTS (
                   SELECT 1 FROM provider_offers offer
                   WHERE offer.model_alias = i.model_alias
                     AND NOT EXISTS (
                         SELECT 1 FROM vendor_models m
                         JOIN vendors v ON v.id = m.vendor_id
                         WHERE m.alias = i.model_alias
                           AND m.vendor_id = offer.vendor_id
                           AND m.upstream_model = i.upstream_model
                           AND v.api_base IS NOT DISTINCT FROM i.api_base
                           AND offer.active
                           AND offer.current_revision IS NOT NULL
                     )
               ) THEN 'account_unavailable'
               WHEN d.attempt_id IS NOT NULL THEN 'admitted'
               ELSE 'conflict'
           END::TEXT AS status
      FROM input i
      LEFT JOIN dispatched d ON d.attempt_id = i.attempt_id
     ORDER BY i.position;
END;
$$;

CREATE OR REPLACE FUNCTION niu_model_rule_permits(rule JSONB, model TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF jsonb_typeof(rule) IS DISTINCT FROM 'object' THEN RETURN FALSE; END IF;
    CASE rule->>'mode'
        WHEN 'inherit' THEN RETURN TRUE;
        WHEN 'allow_all' THEN RETURN TRUE;
        WHEN 'deny_all' THEN RETURN FALSE;
        WHEN 'allow_list' THEN
            IF jsonb_typeof(rule->'values') IS DISTINCT FROM 'array' THEN RETURN FALSE; END IF;
            RETURN COALESCE((rule->'values') ? model, FALSE);
        ELSE RETURN FALSE;
    END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION niu_check_dispatch_model_guardrails() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    requested_model TEXT;
    policy JSONB;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    -- Activation takes this same transaction lock before changing the workspace head.
    PERFORM pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||NEW.organization_id::text||':'||NEW.project_id::text,0));
    -- Key assignment/revocation takes the key row lock before changing restrictions.
    PERFORM id FROM api_keys WHERE id=NEW.api_key_id FOR SHARE;
    SELECT model_alias INTO requested_model FROM operations WHERE id=NEW.operation_id;
    FOR policy IN
        SELECT r.policy FROM workspace_guardrail_heads h
        JOIN workspace_guardrail_revisions r USING(organization_id,project_id,revision)
        WHERE h.organization_id=NEW.organization_id AND h.project_id=NEW.project_id
        UNION ALL
        SELECT r.policy FROM key_guardrail_assignments a
        JOIN workspace_guardrail_revisions r ON r.organization_id=a.organization_id
            AND r.project_id=a.project_id AND r.revision=a.policy_revision
        WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id
    LOOP
        IF policy->>'schema_version' IS DISTINCT FROM '1'
           OR NOT niu_model_rule_permits(policy->'models',requested_model)
           OR NOT niu_model_rule_permits(policy->'providers',NEW.dispatch_provider) THEN
            RAISE EXCEPTION 'access guardrail changed before dispatch' USING ERRCODE='P0006';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0053_immutable_dispatch_provider.sql 546
CREATE FUNCTION niu_guard_dispatch_provider_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.dispatch_provider IS DISTINCT FROM NEW.dispatch_provider
       AND (OLD.dispatch_provider IS NOT NULL OR OLD.execution <> 'not_sent') THEN
        RAISE EXCEPTION 'dispatch Provider snapshot is immutable' USING ERRCODE='P0006';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_dispatch_provider_snapshot
BEFORE UPDATE OF dispatch_provider ON attempts
FOR EACH ROW EXECUTE FUNCTION niu_guard_dispatch_provider_snapshot();

-- @niu-legacy-migration 0054_guardrail_dispatch_lock_order.sql 35367
-- Take workspace policy locks before key/account/attempt locks in every admission path.
CREATE OR REPLACE FUNCTION niu_admit_unpriced_gateway_batch_with_route(
    operation_ids UUID[],
    attempt_ids UUID[],
    organization_ids UUID[],
    project_ids UUID[],
    key_ids UUID[],
    model_aliases TEXT[],
    task_ids TEXT[],
    revisions TEXT[],
    upstream_models TEXT[],
    api_bases TEXT[]
)
RETURNS TABLE (attempt_id UUID, status TEXT)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    request_count INTEGER;
    changed BIGINT;
    lock_scope RECORD;
BEGIN
    request_count := cardinality(operation_ids);
    IF request_count IS NULL OR request_count < 1 OR request_count > 64
        OR cardinality(attempt_ids) IS DISTINCT FROM request_count
        OR cardinality(organization_ids) IS DISTINCT FROM request_count
        OR cardinality(project_ids) IS DISTINCT FROM request_count
        OR cardinality(key_ids) IS DISTINCT FROM request_count
        OR cardinality(model_aliases) IS DISTINCT FROM request_count
        OR cardinality(task_ids) IS DISTINCT FROM request_count
        OR cardinality(revisions) IS DISTINCT FROM request_count
        OR cardinality(upstream_models) IS DISTINCT FROM request_count
        OR cardinality(api_bases) IS DISTINCT FROM request_count THEN
        RAISE EXCEPTION 'invalid gateway admission batch' USING ERRCODE = '22023';
    END IF;

    FOR lock_scope IN SELECT DISTINCT o,p FROM unnest(organization_ids,project_ids) AS scopes(o,p) ORDER BY o,p LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||lock_scope.o::text||':'||lock_scope.p::text,0));
    END LOOP;

    WITH input AS MATERIALIZED (
        SELECT request.operation_id, request.attempt_id,
               request.organization_id, request.project_id, request.key_id,
               request.model_alias, request.task_id, request.revision,
               request.upstream_model, request.api_base
          FROM unnest(operation_ids, attempt_ids, organization_ids, project_ids,
                      key_ids, model_aliases, task_ids, revisions,
                      upstream_models, api_bases)
               AS request(operation_id, attempt_id, organization_id, project_id,
                          key_id, model_alias, task_id, revision,
                          upstream_model, api_base)
    ), inserted_operations AS (
        INSERT INTO operations (id, organization_id, project_id, model_alias, task_id)
        SELECT i.operation_id, i.organization_id, i.project_id, i.model_alias, i.task_id
          FROM input i
        RETURNING id
    ), inserted_attempts AS (
        INSERT INTO attempts
            (id, organization_id, project_id, operation_id, resource_id, offer_revision)
        SELECT i.attempt_id, i.organization_id, i.project_id, i.operation_id,
               i.model_alias, i.revision
          FROM input i
          JOIN inserted_operations o ON o.id = i.operation_id
        RETURNING id
    )
    SELECT count(*) INTO changed FROM inserted_attempts;
    IF changed <> request_count THEN
        RAISE EXCEPTION 'gateway admission insert count mismatch' USING ERRCODE = '22023';
    END IF;

    PERFORM k.id
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids)
           AS input(attempt_id, organization_id, project_id, key_id)
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
      JOIN projects p
        ON p.organization_id = k.organization_id
       AND p.id = k.project_id
     WHERE k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
     FOR SHARE OF k, p;

    PERFORM a.id
      FROM unnest(attempt_ids, organization_ids, project_ids)
           AS input(attempt_id, organization_id, project_id)
      JOIN account_assignments s
        ON s.organization_id = input.organization_id
       AND s.project_id = input.project_id
       AND s.attempt_id = input.attempt_id
      JOIN supplier_accounts a
        ON a.organization_id = s.organization_id
       AND a.project_id = s.project_id
       AND a.id = s.account_id
     FOR SHARE OF a;

    PERFORM o.id
      FROM unnest(model_aliases, upstream_models, api_bases)
           AS input(model_alias, upstream_model, api_base)
      JOIN provider_offers o ON o.model_alias = input.model_alias
      JOIN vendor_models m ON m.alias = input.model_alias
      JOIN vendors v ON v.id = m.vendor_id
     FOR SHARE OF o, m, v;

    -- A published customer tariff is bound only when this key is eligible to
    -- use the model. Its immutable revision records the actual rate in effect.
    INSERT INTO customer_attempt_tariffs (attempt_id, revision_id)
    SELECT input.attempt_id, tariff.current_revision
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids, model_aliases)
           AS input(attempt_id, organization_id, project_id, key_id, model_alias)
      JOIN customer_tariffs tariff
        ON tariff.organization_id = input.organization_id
       AND tariff.project_id = input.project_id
       AND tariff.model_alias = input.model_alias
       AND tariff.current_revision IS NOT NULL
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND (input.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
     WHERE NOT EXISTS (
           SELECT 1 FROM account_assignments s
           JOIN supplier_accounts a
             ON a.organization_id = s.organization_id
            AND a.project_id = s.project_id
            AND a.id = s.account_id
           WHERE s.organization_id = input.organization_id
             AND s.project_id = input.project_id
             AND s.attempt_id = input.attempt_id
             AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                      AND a.credential_revision = s.credential_revision)
       )
       AND NOT EXISTS (
           SELECT 1 FROM project_budgets b
            WHERE b.organization_id = input.organization_id
              AND b.project_id = input.project_id
              AND NOT EXISTS (
                  SELECT 1 FROM cost_reservations r
                   WHERE r.attempt_id = input.attempt_id AND r.state = 'held'
              )
       )
    ON CONFLICT ON CONSTRAINT customer_attempt_tariffs_pkey DO NOTHING;

    -- Supplier attribution is captured atomically. A known offer that no
    -- longer matches the live route is rejected below before any dispatch.
    INSERT INTO provider_attempt_offers (attempt_id, provider_id, offer_id, revision_id)
    SELECT input.attempt_id, offer.provider_id, offer.id, offer.current_revision
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids,
                  model_aliases, upstream_models, api_bases)
           AS input(attempt_id, organization_id, project_id, key_id,
                    model_alias, upstream_model, api_base)
      JOIN provider_offers offer
        ON offer.model_alias = input.model_alias
       AND offer.active
       AND offer.current_revision IS NOT NULL
      JOIN vendor_models model
        ON model.alias = input.model_alias
       AND model.vendor_id = offer.vendor_id
       AND model.upstream_model = input.upstream_model
      JOIN vendors vendor
        ON vendor.id = model.vendor_id
       AND vendor.api_base IS NOT DISTINCT FROM input.api_base
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND (input.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
     WHERE NOT EXISTS (
           SELECT 1 FROM account_assignments s
           JOIN supplier_accounts a
             ON a.organization_id = s.organization_id
            AND a.project_id = s.project_id
            AND a.id = s.account_id
           WHERE s.organization_id = input.organization_id
             AND s.project_id = input.project_id
             AND s.attempt_id = input.attempt_id
             AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                      AND a.credential_revision = s.credential_revision)
       )
       AND NOT EXISTS (
           SELECT 1 FROM project_budgets b
            WHERE b.organization_id = input.organization_id
              AND b.project_id = input.project_id
              AND NOT EXISTS (
                  SELECT 1 FROM cost_reservations r
                   WHERE r.attempt_id = input.attempt_id AND r.state = 'held'
              )
       )
    ON CONFLICT ON CONSTRAINT provider_attempt_offers_pkey DO NOTHING;

    RETURN QUERY
    WITH input AS MATERIALIZED (
        SELECT request.attempt_id, request.organization_id,
               request.project_id, request.key_id, request.model_alias,
               request.upstream_model, request.api_base, request.position
          FROM unnest(attempt_ids, organization_ids, project_ids, key_ids,
                      model_aliases, upstream_models, api_bases)
               WITH ORDINALITY AS request(attempt_id, organization_id,
                   project_id, key_id, model_alias, upstream_model, api_base, position)
    ), dispatched AS (
        UPDATE attempts a
           SET execution = 'may_have_executed',
               dispatched_at = clock_timestamp(),
               api_key_id = i.key_id
          FROM input i, operations o, api_keys k
         WHERE a.organization_id = i.organization_id
           AND a.project_id = i.project_id
           AND a.id = i.attempt_id
           AND a.execution = 'not_sent'
           AND o.organization_id = a.organization_id
           AND o.project_id = a.project_id
           AND o.id = a.operation_id
           AND o.model_alias = i.model_alias
           AND k.id = i.key_id
           AND k.organization_id = i.organization_id
           AND k.project_id = i.project_id
           AND (o.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
           AND k.expires_at > clock_timestamp()
           AND k.revoked_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM provider_offers offer
               WHERE offer.model_alias = i.model_alias
                 AND NOT EXISTS (
                     SELECT 1 FROM provider_offers current_offer
                     JOIN vendor_models m
                       ON m.alias = current_offer.model_alias
                      AND m.vendor_id = current_offer.vendor_id
                      AND m.upstream_model = i.upstream_model
                     JOIN vendors v
                       ON v.id = m.vendor_id
                      AND v.api_base IS NOT DISTINCT FROM i.api_base
                     WHERE current_offer.id = offer.id
                       AND current_offer.active
                       AND current_offer.current_revision IS NOT NULL
                 )
           )
           AND NOT EXISTS (
               SELECT 1 FROM account_assignments s
                WHERE s.organization_id = i.organization_id
                  AND s.project_id = i.project_id
                  AND s.attempt_id = a.id
                  AND s.state <> 'held'
           )
           AND (
               NOT EXISTS (
                   SELECT 1 FROM project_budgets b
                    WHERE b.organization_id = i.organization_id
                      AND b.project_id = i.project_id
               )
               OR EXISTS (
                   SELECT 1 FROM cost_reservations r
                    WHERE r.attempt_id = a.id AND r.state = 'held'
               )
           )
        RETURNING a.id AS attempt_id
    )
    SELECT i.attempt_id,
           CASE
               WHEN NOT EXISTS (
                   SELECT 1 FROM api_keys k
                    WHERE k.id = i.key_id
                      AND k.organization_id = i.organization_id
                      AND k.project_id = i.project_id
                      AND k.revoked_at IS NULL
                      AND k.expires_at > clock_timestamp()
                      AND (i.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
               ) THEN 'unauthorized'
               WHEN EXISTS (
                   SELECT 1 FROM account_assignments s
                   JOIN supplier_accounts a
                     ON a.organization_id = s.organization_id
                    AND a.project_id = s.project_id
                    AND a.id = s.account_id
                   WHERE s.organization_id = i.organization_id
                     AND s.project_id = i.project_id
                     AND s.attempt_id = i.attempt_id
                     AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                              AND a.credential_revision = s.credential_revision)
               ) THEN 'account_unavailable'
               WHEN EXISTS (
                   SELECT 1 FROM provider_offers offer
                   WHERE offer.model_alias = i.model_alias
                     AND NOT EXISTS (
                         SELECT 1 FROM vendor_models m
                         JOIN vendors v ON v.id = m.vendor_id
                         WHERE m.alias = i.model_alias
                           AND m.vendor_id = offer.vendor_id
                           AND m.upstream_model = i.upstream_model
                           AND v.api_base IS NOT DISTINCT FROM i.api_base
                           AND offer.active
                           AND offer.current_revision IS NOT NULL
                     )
               ) THEN 'account_unavailable'
               WHEN d.attempt_id IS NOT NULL THEN 'admitted'
               ELSE 'conflict'
           END::TEXT AS status
      FROM input i
      LEFT JOIN dispatched d ON d.attempt_id = i.attempt_id
     ORDER BY i.position;
END;
$$;
CREATE OR REPLACE FUNCTION niu_admit_unpriced_gateway_batch_with_route(
    operation_ids UUID[],
    attempt_ids UUID[],
    organization_ids UUID[],
    project_ids UUID[],
    key_ids UUID[],
    model_aliases TEXT[],
    task_ids TEXT[],
    revisions TEXT[],
    upstream_models TEXT[],
    api_bases TEXT[],
    dispatch_providers TEXT[]
)
RETURNS TABLE (attempt_id UUID, status TEXT)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    request_count INTEGER;
    changed BIGINT;
    lock_scope RECORD;
BEGIN
    request_count := cardinality(operation_ids);
    IF request_count IS NULL OR request_count < 1 OR request_count > 64
        OR cardinality(attempt_ids) IS DISTINCT FROM request_count
        OR cardinality(organization_ids) IS DISTINCT FROM request_count
        OR cardinality(project_ids) IS DISTINCT FROM request_count
        OR cardinality(key_ids) IS DISTINCT FROM request_count
        OR cardinality(model_aliases) IS DISTINCT FROM request_count
        OR cardinality(task_ids) IS DISTINCT FROM request_count
        OR cardinality(revisions) IS DISTINCT FROM request_count
        OR cardinality(upstream_models) IS DISTINCT FROM request_count
        OR cardinality(api_bases) IS DISTINCT FROM request_count
        OR cardinality(dispatch_providers) IS DISTINCT FROM request_count THEN
        RAISE EXCEPTION 'invalid gateway admission batch' USING ERRCODE = '22023';
    END IF;

    FOR lock_scope IN SELECT DISTINCT o,p FROM unnest(organization_ids,project_ids) AS scopes(o,p) ORDER BY o,p LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||lock_scope.o::text||':'||lock_scope.p::text,0));
    END LOOP;

    WITH input AS MATERIALIZED (
        SELECT request.operation_id, request.attempt_id,
               request.organization_id, request.project_id, request.key_id,
               request.model_alias, request.task_id, request.revision,
               request.upstream_model, request.api_base, request.dispatch_provider
          FROM unnest(operation_ids, attempt_ids, organization_ids, project_ids,
                      key_ids, model_aliases, task_ids, revisions,
                      upstream_models, api_bases, dispatch_providers)
               AS request(operation_id, attempt_id, organization_id, project_id,
                          key_id, model_alias, task_id, revision,
                          upstream_model, api_base, dispatch_provider)
    ), inserted_operations AS (
        INSERT INTO operations (id, organization_id, project_id, model_alias, task_id)
        SELECT i.operation_id, i.organization_id, i.project_id, i.model_alias, i.task_id
          FROM input i
        RETURNING id
    ), inserted_attempts AS (
        INSERT INTO attempts
            (id, organization_id, project_id, operation_id, resource_id, offer_revision, dispatch_provider)
        SELECT i.attempt_id, i.organization_id, i.project_id, i.operation_id,
               i.model_alias, i.revision, i.dispatch_provider
          FROM input i
          JOIN inserted_operations o ON o.id = i.operation_id
        RETURNING id
    )
    SELECT count(*) INTO changed FROM inserted_attempts;
    IF changed <> request_count THEN
        RAISE EXCEPTION 'gateway admission insert count mismatch' USING ERRCODE = '22023';
    END IF;

    PERFORM k.id
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids)
           AS input(attempt_id, organization_id, project_id, key_id)
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
      JOIN projects p
        ON p.organization_id = k.organization_id
       AND p.id = k.project_id
     WHERE k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
     FOR SHARE OF k, p;

    PERFORM a.id
      FROM unnest(attempt_ids, organization_ids, project_ids)
           AS input(attempt_id, organization_id, project_id)
      JOIN account_assignments s
        ON s.organization_id = input.organization_id
       AND s.project_id = input.project_id
       AND s.attempt_id = input.attempt_id
      JOIN supplier_accounts a
        ON a.organization_id = s.organization_id
       AND a.project_id = s.project_id
       AND a.id = s.account_id
     FOR SHARE OF a;

    PERFORM o.id
      FROM unnest(model_aliases, upstream_models, api_bases)
           AS input(model_alias, upstream_model, api_base)
      JOIN provider_offers o ON o.model_alias = input.model_alias
      JOIN vendor_models m ON m.alias = input.model_alias
      JOIN vendors v ON v.id = m.vendor_id
     FOR SHARE OF o, m, v;

    -- A published customer tariff is bound only when this key is eligible to
    -- use the model. Its immutable revision records the actual rate in effect.
    INSERT INTO customer_attempt_tariffs (attempt_id, revision_id)
    SELECT input.attempt_id, tariff.current_revision
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids, model_aliases)
           AS input(attempt_id, organization_id, project_id, key_id, model_alias)
      JOIN customer_tariffs tariff
        ON tariff.organization_id = input.organization_id
       AND tariff.project_id = input.project_id
       AND tariff.model_alias = input.model_alias
       AND tariff.current_revision IS NOT NULL
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND (input.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
     WHERE NOT EXISTS (
           SELECT 1 FROM account_assignments s
           JOIN supplier_accounts a
             ON a.organization_id = s.organization_id
            AND a.project_id = s.project_id
            AND a.id = s.account_id
           WHERE s.organization_id = input.organization_id
             AND s.project_id = input.project_id
             AND s.attempt_id = input.attempt_id
             AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                      AND a.credential_revision = s.credential_revision)
       )
       AND NOT EXISTS (
           SELECT 1 FROM project_budgets b
            WHERE b.organization_id = input.organization_id
              AND b.project_id = input.project_id
              AND NOT EXISTS (
                  SELECT 1 FROM cost_reservations r
                   WHERE r.attempt_id = input.attempt_id AND r.state = 'held'
              )
       )
    ON CONFLICT ON CONSTRAINT customer_attempt_tariffs_pkey DO NOTHING;

    -- Supplier attribution is captured atomically. A known offer that no
    -- longer matches the live route is rejected below before any dispatch.
    INSERT INTO provider_attempt_offers (attempt_id, provider_id, offer_id, revision_id)
    SELECT input.attempt_id, offer.provider_id, offer.id, offer.current_revision
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids,
                  model_aliases, upstream_models, api_bases)
           AS input(attempt_id, organization_id, project_id, key_id,
                    model_alias, upstream_model, api_base)
      JOIN provider_offers offer
        ON offer.model_alias = input.model_alias
       AND offer.active
       AND offer.current_revision IS NOT NULL
      JOIN vendor_models model
        ON model.alias = input.model_alias
       AND model.vendor_id = offer.vendor_id
       AND model.upstream_model = input.upstream_model
      JOIN vendors vendor
        ON vendor.id = model.vendor_id
       AND vendor.api_base IS NOT DISTINCT FROM input.api_base
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND (input.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
     WHERE NOT EXISTS (
           SELECT 1 FROM account_assignments s
           JOIN supplier_accounts a
             ON a.organization_id = s.organization_id
            AND a.project_id = s.project_id
            AND a.id = s.account_id
           WHERE s.organization_id = input.organization_id
             AND s.project_id = input.project_id
             AND s.attempt_id = input.attempt_id
             AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                      AND a.credential_revision = s.credential_revision)
       )
       AND NOT EXISTS (
           SELECT 1 FROM project_budgets b
            WHERE b.organization_id = input.organization_id
              AND b.project_id = input.project_id
              AND NOT EXISTS (
                  SELECT 1 FROM cost_reservations r
                   WHERE r.attempt_id = input.attempt_id AND r.state = 'held'
              )
       )
    ON CONFLICT ON CONSTRAINT provider_attempt_offers_pkey DO NOTHING;

    RETURN QUERY
    WITH input AS MATERIALIZED (
        SELECT request.attempt_id, request.organization_id,
               request.project_id, request.key_id, request.model_alias,
               request.upstream_model, request.api_base, request.position
          FROM unnest(attempt_ids, organization_ids, project_ids, key_ids,
                      model_aliases, upstream_models, api_bases)
               WITH ORDINALITY AS request(attempt_id, organization_id,
                   project_id, key_id, model_alias, upstream_model, api_base, position)
    ), dispatched AS (
        UPDATE attempts a
           SET execution = 'may_have_executed',
               dispatched_at = clock_timestamp(),
               api_key_id = i.key_id
          FROM input i, operations o, api_keys k
         WHERE a.organization_id = i.organization_id
           AND a.project_id = i.project_id
           AND a.id = i.attempt_id
           AND a.execution = 'not_sent'
           AND o.organization_id = a.organization_id
           AND o.project_id = a.project_id
           AND o.id = a.operation_id
           AND o.model_alias = i.model_alias
           AND k.id = i.key_id
           AND k.organization_id = i.organization_id
           AND k.project_id = i.project_id
           AND (o.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
           AND k.expires_at > clock_timestamp()
           AND k.revoked_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM provider_offers offer
               WHERE offer.model_alias = i.model_alias
                 AND NOT EXISTS (
                     SELECT 1 FROM provider_offers current_offer
                     JOIN vendor_models m
                       ON m.alias = current_offer.model_alias
                      AND m.vendor_id = current_offer.vendor_id
                      AND m.upstream_model = i.upstream_model
                     JOIN vendors v
                       ON v.id = m.vendor_id
                      AND v.api_base IS NOT DISTINCT FROM i.api_base
                     WHERE current_offer.id = offer.id
                       AND current_offer.active
                       AND current_offer.current_revision IS NOT NULL
                 )
           )
           AND NOT EXISTS (
               SELECT 1 FROM account_assignments s
                WHERE s.organization_id = i.organization_id
                  AND s.project_id = i.project_id
                  AND s.attempt_id = a.id
                  AND s.state <> 'held'
           )
           AND (
               NOT EXISTS (
                   SELECT 1 FROM project_budgets b
                    WHERE b.organization_id = i.organization_id
                      AND b.project_id = i.project_id
               )
               OR EXISTS (
                   SELECT 1 FROM cost_reservations r
                    WHERE r.attempt_id = a.id AND r.state = 'held'
               )
           )
        RETURNING a.id AS attempt_id
    )
    SELECT i.attempt_id,
           CASE
               WHEN NOT EXISTS (
                   SELECT 1 FROM api_keys k
                    WHERE k.id = i.key_id
                      AND k.organization_id = i.organization_id
                      AND k.project_id = i.project_id
                      AND k.revoked_at IS NULL
                      AND k.expires_at > clock_timestamp()
                      AND (i.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
               ) THEN 'unauthorized'
               WHEN EXISTS (
                   SELECT 1 FROM account_assignments s
                   JOIN supplier_accounts a
                     ON a.organization_id = s.organization_id
                    AND a.project_id = s.project_id
                    AND a.id = s.account_id
                   WHERE s.organization_id = i.organization_id
                     AND s.project_id = i.project_id
                     AND s.attempt_id = i.attempt_id
                     AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                              AND a.credential_revision = s.credential_revision)
               ) THEN 'account_unavailable'
               WHEN EXISTS (
                   SELECT 1 FROM provider_offers offer
                   WHERE offer.model_alias = i.model_alias
                     AND NOT EXISTS (
                         SELECT 1 FROM vendor_models m
                         JOIN vendors v ON v.id = m.vendor_id
                         WHERE m.alias = i.model_alias
                           AND m.vendor_id = offer.vendor_id
                           AND m.upstream_model = i.upstream_model
                           AND v.api_base IS NOT DISTINCT FROM i.api_base
                           AND offer.active
                           AND offer.current_revision IS NOT NULL
                     )
               ) THEN 'account_unavailable'
               WHEN d.attempt_id IS NOT NULL THEN 'admitted'
               ELSE 'conflict'
           END::TEXT AS status
      FROM input i
      LEFT JOIN dispatched d ON d.attempt_id = i.attempt_id
     ORDER BY i.position;
END;
$$;
-- Keep the trusted budget reservation and dispatch transition in one database
-- call so network latency does not extend the project-budget row lock.
CREATE OR REPLACE FUNCTION niu_reserve_and_dispatch_gateway(
    p_organization_id UUID,
    p_project_id UUID,
    p_key_id UUID,
    p_attempt_id UUID,
    p_price_revision_id UUID,
    p_resource_id TEXT,
    p_offer_revision TEXT,
    p_prompt_bound BIGINT,
    p_completion_bound BIGINT
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    account_eligible BOOLEAN;
    attempt_row RECORD;
    price_row RECORD;
    computed_amount NUMERIC;
    changed BIGINT;
BEGIN
    IF p_prompt_bound < 0 OR p_completion_bound < 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0009', MESSAGE = 'invalid token bound';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||p_organization_id::text||':'||p_project_id::text,0));

    -- Revocation, expiry, model permission and project budget creation all
    -- synchronize with this admission before it allocates funds.
    PERFORM k.id
      FROM api_keys k
      JOIN projects p ON p.organization_id=k.organization_id AND p.id=k.project_id
     WHERE k.id=p_key_id
       AND k.organization_id=p_organization_id
       AND k.project_id=p_project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND p_resource_id=ANY(k.allowed_models)
     FOR SHARE OF k, p;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
    END IF;

    SELECT a.health='ready'
           AND a.refresh_owner IS NULL
           AND a.credential_revision=s.credential_revision
      INTO account_eligible
      FROM account_assignments s
      JOIN supplier_accounts a
        ON a.organization_id=s.organization_id
       AND a.project_id=s.project_id
       AND a.id=s.account_id
     WHERE s.organization_id=p_organization_id
       AND s.project_id=p_project_id
       AND s.attempt_id=p_attempt_id
     FOR SHARE OF s, a;
    IF FOUND AND account_eligible IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION USING ERRCODE = 'P0007', MESSAGE = 'supplier account is unavailable';
    END IF;

    SELECT a.execution, a.resource_id, a.offer_revision, o.model_alias
      INTO attempt_row
      FROM attempts a
      JOIN operations o
        ON o.organization_id=a.organization_id
       AND o.project_id=a.project_id
       AND o.id=a.operation_id
     WHERE a.organization_id=p_organization_id
       AND a.project_id=p_project_id
       AND a.id=p_attempt_id
       AND o.model_alias=p_resource_id
     FOR UPDATE OF a;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt does not exist';
    END IF;
    IF attempt_row.execution <> 'not_sent'
       OR attempt_row.resource_id <> p_resource_id
       OR attempt_row.offer_revision <> p_offer_revision THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt conflicts with admission';
    END IF;

    SELECT currency, cash_prompt_rate, cash_completion_rate
      INTO price_row
      FROM price_revisions
     WHERE organization_id=p_organization_id
       AND project_id=p_project_id
       AND id=p_price_revision_id
       AND resource_id=p_resource_id
       AND offer_revision=p_offer_revision;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'price revision does not match route';
    END IF;

    IF EXISTS (SELECT 1 FROM cost_reservations WHERE attempt_id=p_attempt_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt already has a reservation';
    END IF;

    computed_amount := ceil((
        price_row.cash_prompt_rate::NUMERIC * p_prompt_bound::NUMERIC
        + price_row.cash_completion_rate::NUMERIC * p_completion_bound::NUMERIC
    ) / 1000000);
    IF computed_amount > 9223372036854775807::NUMERIC THEN
        RAISE EXCEPTION USING ERRCODE = 'P0009', MESSAGE = 'reservation exceeds supported amount';
    END IF;

    UPDATE project_budgets
       SET reserved_nanos=reserved_nanos + computed_amount::BIGINT
     WHERE organization_id=p_organization_id
       AND project_id=p_project_id
       AND currency=price_row.currency
       AND limit_nanos::NUMERIC - spent_nanos::NUMERIC - reserved_nanos::NUMERIC >= computed_amount
       AND EXISTS (
           SELECT 1 FROM api_keys k
            WHERE k.id=p_key_id
              AND k.organization_id=p_organization_id
              AND k.project_id=p_project_id
              AND k.revoked_at IS NULL
              AND k.expires_at > clock_timestamp()
              AND p_resource_id=ANY(k.allowed_models)
       );
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
        IF NOT EXISTS (
            SELECT 1 FROM api_keys k
             WHERE k.id=p_key_id
               AND k.organization_id=p_organization_id
               AND k.project_id=p_project_id
               AND k.revoked_at IS NULL
               AND k.expires_at > clock_timestamp()
               AND p_resource_id=ANY(k.allowed_models)
        ) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
        END IF;
        RAISE EXCEPTION USING ERRCODE = 'P0008', MESSAGE = 'project budget is unavailable';
    END IF;

    INSERT INTO cost_reservations
        (attempt_id, organization_id, project_id, price_revision_id,
         reserved_nanos, prompt_bound, completion_bound)
    VALUES
        (p_attempt_id, p_organization_id, p_project_id, p_price_revision_id,
         computed_amount::BIGINT, p_prompt_bound, p_completion_bound);

    UPDATE attempts a
       SET execution='may_have_executed',
           dispatched_at=clock_timestamp(),
           api_key_id=p_key_id
     WHERE a.organization_id=p_organization_id
       AND a.project_id=p_project_id
       AND a.id=p_attempt_id
       AND a.execution='not_sent'
       AND EXISTS (
           SELECT 1 FROM api_keys k
            WHERE k.id=p_key_id
              AND k.organization_id=p_organization_id
              AND k.project_id=p_project_id
              AND a.resource_id=ANY(k.allowed_models)
              AND k.revoked_at IS NULL
              AND k.expires_at > clock_timestamp()
       )
       AND NOT EXISTS (
           SELECT 1 FROM account_assignments s
            WHERE s.organization_id=p_organization_id
              AND s.project_id=p_project_id
              AND s.attempt_id=a.id
              AND s.state <> 'held'
       )
       AND EXISTS (
           SELECT 1 FROM cost_reservations r
            WHERE r.organization_id=p_organization_id
              AND r.project_id=p_project_id
              AND r.attempt_id=a.id
              AND r.state='held'
       );
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
        IF NOT EXISTS (
            SELECT 1 FROM api_keys k
             WHERE k.id=p_key_id
               AND k.organization_id=p_organization_id
               AND k.project_id=p_project_id
               AND k.revoked_at IS NULL
               AND k.expires_at > clock_timestamp()
               AND p_resource_id=ANY(k.allowed_models)
        ) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
        END IF;
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt changed during admission';
    END IF;
END;
$$;

-- @niu-legacy-migration 0055_priced_wildcard_model_grants.sql 7434
-- Preserve all-model key grants through priced reservation and dispatch.
CREATE OR REPLACE FUNCTION niu_reserve_and_dispatch_gateway(
    p_organization_id UUID,
    p_project_id UUID,
    p_key_id UUID,
    p_attempt_id UUID,
    p_price_revision_id UUID,
    p_resource_id TEXT,
    p_offer_revision TEXT,
    p_prompt_bound BIGINT,
    p_completion_bound BIGINT
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    account_eligible BOOLEAN;
    attempt_row RECORD;
    price_row RECORD;
    computed_amount NUMERIC;
    changed BIGINT;
BEGIN
    IF p_prompt_bound < 0 OR p_completion_bound < 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0009', MESSAGE = 'invalid token bound';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||p_organization_id::text||':'||p_project_id::text,0));

    -- Revocation, expiry, model permission and project budget creation all
    -- synchronize with this admission before it allocates funds.
    PERFORM k.id
      FROM api_keys k
      JOIN projects p ON p.organization_id=k.organization_id AND p.id=k.project_id
     WHERE k.id=p_key_id
       AND k.organization_id=p_organization_id
       AND k.project_id=p_project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND ('*'=ANY(k.allowed_models) OR p_resource_id=ANY(k.allowed_models))
     FOR SHARE OF k, p;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
    END IF;

    SELECT a.health='ready'
           AND a.refresh_owner IS NULL
           AND a.credential_revision=s.credential_revision
      INTO account_eligible
      FROM account_assignments s
      JOIN supplier_accounts a
        ON a.organization_id=s.organization_id
       AND a.project_id=s.project_id
       AND a.id=s.account_id
     WHERE s.organization_id=p_organization_id
       AND s.project_id=p_project_id
       AND s.attempt_id=p_attempt_id
     FOR SHARE OF s, a;
    IF FOUND AND account_eligible IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION USING ERRCODE = 'P0007', MESSAGE = 'supplier account is unavailable';
    END IF;

    SELECT a.execution, a.resource_id, a.offer_revision, o.model_alias
      INTO attempt_row
      FROM attempts a
      JOIN operations o
        ON o.organization_id=a.organization_id
       AND o.project_id=a.project_id
       AND o.id=a.operation_id
     WHERE a.organization_id=p_organization_id
       AND a.project_id=p_project_id
       AND a.id=p_attempt_id
       AND o.model_alias=p_resource_id
     FOR UPDATE OF a;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt does not exist';
    END IF;
    IF attempt_row.execution <> 'not_sent'
       OR attempt_row.resource_id <> p_resource_id
       OR attempt_row.offer_revision <> p_offer_revision THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt conflicts with admission';
    END IF;

    SELECT currency, cash_prompt_rate, cash_completion_rate
      INTO price_row
      FROM price_revisions
     WHERE organization_id=p_organization_id
       AND project_id=p_project_id
       AND id=p_price_revision_id
       AND resource_id=p_resource_id
       AND offer_revision=p_offer_revision;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'price revision does not match route';
    END IF;

    IF EXISTS (SELECT 1 FROM cost_reservations WHERE attempt_id=p_attempt_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt already has a reservation';
    END IF;

    computed_amount := ceil((
        price_row.cash_prompt_rate::NUMERIC * p_prompt_bound::NUMERIC
        + price_row.cash_completion_rate::NUMERIC * p_completion_bound::NUMERIC
    ) / 1000000);
    IF computed_amount > 9223372036854775807::NUMERIC THEN
        RAISE EXCEPTION USING ERRCODE = 'P0009', MESSAGE = 'reservation exceeds supported amount';
    END IF;

    UPDATE project_budgets
       SET reserved_nanos=reserved_nanos + computed_amount::BIGINT
     WHERE organization_id=p_organization_id
       AND project_id=p_project_id
       AND currency=price_row.currency
       AND limit_nanos::NUMERIC - spent_nanos::NUMERIC - reserved_nanos::NUMERIC >= computed_amount
       AND EXISTS (
           SELECT 1 FROM api_keys k
            WHERE k.id=p_key_id
              AND k.organization_id=p_organization_id
              AND k.project_id=p_project_id
              AND k.revoked_at IS NULL
              AND k.expires_at > clock_timestamp()
              AND ('*'=ANY(k.allowed_models) OR p_resource_id=ANY(k.allowed_models))
       );
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
        IF NOT EXISTS (
            SELECT 1 FROM api_keys k
             WHERE k.id=p_key_id
               AND k.organization_id=p_organization_id
               AND k.project_id=p_project_id
               AND k.revoked_at IS NULL
               AND k.expires_at > clock_timestamp()
               AND ('*'=ANY(k.allowed_models) OR p_resource_id=ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
        END IF;
        RAISE EXCEPTION USING ERRCODE = 'P0008', MESSAGE = 'project budget is unavailable';
    END IF;

    INSERT INTO cost_reservations
        (attempt_id, organization_id, project_id, price_revision_id,
         reserved_nanos, prompt_bound, completion_bound)
    VALUES
        (p_attempt_id, p_organization_id, p_project_id, p_price_revision_id,
         computed_amount::BIGINT, p_prompt_bound, p_completion_bound);

    UPDATE attempts a
       SET execution='may_have_executed',
           dispatched_at=clock_timestamp(),
           api_key_id=p_key_id
     WHERE a.organization_id=p_organization_id
       AND a.project_id=p_project_id
       AND a.id=p_attempt_id
       AND a.execution='not_sent'
       AND EXISTS (
           SELECT 1 FROM api_keys k
            WHERE k.id=p_key_id
              AND k.organization_id=p_organization_id
              AND k.project_id=p_project_id
              AND a.resource_id=ANY(k.allowed_models)
              AND k.revoked_at IS NULL
              AND k.expires_at > clock_timestamp()
       )
       AND NOT EXISTS (
           SELECT 1 FROM account_assignments s
            WHERE s.organization_id=p_organization_id
              AND s.project_id=p_project_id
              AND s.attempt_id=a.id
              AND s.state <> 'held'
       )
       AND EXISTS (
           SELECT 1 FROM cost_reservations r
            WHERE r.organization_id=p_organization_id
              AND r.project_id=p_project_id
              AND r.attempt_id=a.id
              AND r.state='held'
       );
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
        IF NOT EXISTS (
            SELECT 1 FROM api_keys k
             WHERE k.id=p_key_id
               AND k.organization_id=p_organization_id
               AND k.project_id=p_project_id
               AND k.revoked_at IS NULL
               AND k.expires_at > clock_timestamp()
               AND ('*'=ANY(k.allowed_models) OR p_resource_id=ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
        END IF;
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt changed during admission';
    END IF;
END;
$$;

-- @niu-legacy-migration 0056_priced_wildcard_dispatch_recheck.sql 7465
-- Preserve all-model key grants through priced reservation and dispatch.
CREATE OR REPLACE FUNCTION niu_reserve_and_dispatch_gateway(
    p_organization_id UUID,
    p_project_id UUID,
    p_key_id UUID,
    p_attempt_id UUID,
    p_price_revision_id UUID,
    p_resource_id TEXT,
    p_offer_revision TEXT,
    p_prompt_bound BIGINT,
    p_completion_bound BIGINT
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    account_eligible BOOLEAN;
    attempt_row RECORD;
    price_row RECORD;
    computed_amount NUMERIC;
    changed BIGINT;
BEGIN
    IF p_prompt_bound < 0 OR p_completion_bound < 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0009', MESSAGE = 'invalid token bound';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||p_organization_id::text||':'||p_project_id::text,0));

    -- Revocation, expiry, model permission and project budget creation all
    -- synchronize with this admission before it allocates funds.
    PERFORM k.id
      FROM api_keys k
      JOIN projects p ON p.organization_id=k.organization_id AND p.id=k.project_id
     WHERE k.id=p_key_id
       AND k.organization_id=p_organization_id
       AND k.project_id=p_project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND ('*'=ANY(k.allowed_models) OR p_resource_id=ANY(k.allowed_models))
     FOR SHARE OF k, p;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
    END IF;

    SELECT a.health='ready'
           AND a.refresh_owner IS NULL
           AND a.credential_revision=s.credential_revision
      INTO account_eligible
      FROM account_assignments s
      JOIN supplier_accounts a
        ON a.organization_id=s.organization_id
       AND a.project_id=s.project_id
       AND a.id=s.account_id
     WHERE s.organization_id=p_organization_id
       AND s.project_id=p_project_id
       AND s.attempt_id=p_attempt_id
     FOR SHARE OF s, a;
    IF FOUND AND account_eligible IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION USING ERRCODE = 'P0007', MESSAGE = 'supplier account is unavailable';
    END IF;

    SELECT a.execution, a.resource_id, a.offer_revision, o.model_alias
      INTO attempt_row
      FROM attempts a
      JOIN operations o
        ON o.organization_id=a.organization_id
       AND o.project_id=a.project_id
       AND o.id=a.operation_id
     WHERE a.organization_id=p_organization_id
       AND a.project_id=p_project_id
       AND a.id=p_attempt_id
       AND o.model_alias=p_resource_id
     FOR UPDATE OF a;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt does not exist';
    END IF;
    IF attempt_row.execution <> 'not_sent'
       OR attempt_row.resource_id <> p_resource_id
       OR attempt_row.offer_revision <> p_offer_revision THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt conflicts with admission';
    END IF;

    SELECT currency, cash_prompt_rate, cash_completion_rate
      INTO price_row
      FROM price_revisions
     WHERE organization_id=p_organization_id
       AND project_id=p_project_id
       AND id=p_price_revision_id
       AND resource_id=p_resource_id
       AND offer_revision=p_offer_revision;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'price revision does not match route';
    END IF;

    IF EXISTS (SELECT 1 FROM cost_reservations WHERE attempt_id=p_attempt_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt already has a reservation';
    END IF;

    computed_amount := ceil((
        price_row.cash_prompt_rate::NUMERIC * p_prompt_bound::NUMERIC
        + price_row.cash_completion_rate::NUMERIC * p_completion_bound::NUMERIC
    ) / 1000000);
    IF computed_amount > 9223372036854775807::NUMERIC THEN
        RAISE EXCEPTION USING ERRCODE = 'P0009', MESSAGE = 'reservation exceeds supported amount';
    END IF;

    UPDATE project_budgets
       SET reserved_nanos=reserved_nanos + computed_amount::BIGINT
     WHERE organization_id=p_organization_id
       AND project_id=p_project_id
       AND currency=price_row.currency
       AND limit_nanos::NUMERIC - spent_nanos::NUMERIC - reserved_nanos::NUMERIC >= computed_amount
       AND EXISTS (
           SELECT 1 FROM api_keys k
            WHERE k.id=p_key_id
              AND k.organization_id=p_organization_id
              AND k.project_id=p_project_id
              AND k.revoked_at IS NULL
              AND k.expires_at > clock_timestamp()
              AND ('*'=ANY(k.allowed_models) OR p_resource_id=ANY(k.allowed_models))
       );
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
        IF NOT EXISTS (
            SELECT 1 FROM api_keys k
             WHERE k.id=p_key_id
               AND k.organization_id=p_organization_id
               AND k.project_id=p_project_id
               AND k.revoked_at IS NULL
               AND k.expires_at > clock_timestamp()
               AND ('*'=ANY(k.allowed_models) OR p_resource_id=ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
        END IF;
        RAISE EXCEPTION USING ERRCODE = 'P0008', MESSAGE = 'project budget is unavailable';
    END IF;

    INSERT INTO cost_reservations
        (attempt_id, organization_id, project_id, price_revision_id,
         reserved_nanos, prompt_bound, completion_bound)
    VALUES
        (p_attempt_id, p_organization_id, p_project_id, p_price_revision_id,
         computed_amount::BIGINT, p_prompt_bound, p_completion_bound);

    UPDATE attempts a
       SET execution='may_have_executed',
           dispatched_at=clock_timestamp(),
           api_key_id=p_key_id
     WHERE a.organization_id=p_organization_id
       AND a.project_id=p_project_id
       AND a.id=p_attempt_id
       AND a.execution='not_sent'
       AND EXISTS (
           SELECT 1 FROM api_keys k
            WHERE k.id=p_key_id
              AND k.organization_id=p_organization_id
              AND k.project_id=p_project_id
              AND ('*'=ANY(k.allowed_models) OR a.resource_id=ANY(k.allowed_models))
              AND k.revoked_at IS NULL
              AND k.expires_at > clock_timestamp()
       )
       AND NOT EXISTS (
           SELECT 1 FROM account_assignments s
            WHERE s.organization_id=p_organization_id
              AND s.project_id=p_project_id
              AND s.attempt_id=a.id
              AND s.state <> 'held'
       )
       AND EXISTS (
           SELECT 1 FROM cost_reservations r
            WHERE r.organization_id=p_organization_id
              AND r.project_id=p_project_id
              AND r.attempt_id=a.id
              AND r.state='held'
       );
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
        IF NOT EXISTS (
            SELECT 1 FROM api_keys k
             WHERE k.id=p_key_id
               AND k.organization_id=p_organization_id
               AND k.project_id=p_project_id
               AND k.revoked_at IS NULL
               AND k.expires_at > clock_timestamp()
               AND ('*'=ANY(k.allowed_models) OR p_resource_id=ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
        END IF;
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt changed during admission';
    END IF;
END;
$$;

-- @niu-legacy-migration 0057_dispatch_guardrail_attribution.sql 2280
-- Allowed dispatch attribution only; denied transitions roll back and are not recorded here.
CREATE TABLE dispatch_guardrail_decisions (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id, project_id, attempt_id),
    FOREIGN KEY (organization_id, project_id, attempt_id) REFERENCES attempts(organization_id, project_id, id),
    FOREIGN KEY (organization_id, project_id, workspace_revision) REFERENCES workspace_guardrail_revisions(organization_id, project_id, revision),
    FOREIGN KEY (organization_id, project_id, key_policy_revision) REFERENCES workspace_guardrail_revisions(organization_id, project_id, revision),
    CHECK (key_assignment_revision IS NULL OR key_assignment_revision > 0)
);
CREATE TRIGGER immutable_dispatch_guardrail_decision
BEFORE UPDATE OR DELETE ON dispatch_guardrail_decisions
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION niu_record_dispatch_guardrails() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    -- Existing dispatch checks hold workspace coordination and the key row lock.
    INSERT INTO dispatch_guardrail_decisions (
        organization_id, project_id, attempt_id, workspace_revision,
        key_policy_revision, key_assignment_revision
    ) VALUES (
        NEW.organization_id, NEW.project_id, NEW.id,
        (SELECT NULLIF(revision,0) FROM workspace_guardrail_heads WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id),
        (SELECT policy_revision FROM key_guardrail_assignments WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND key_id=NEW.api_key_id),
        (SELECT assignment_revision FROM key_guardrail_assignments WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND key_id=NEW.api_key_id)
    );
    RETURN NEW;
END;
$$;
CREATE TRIGGER zz_record_dispatch_guardrail_decision
BEFORE UPDATE OF execution ON attempts
FOR EACH ROW EXECUTE FUNCTION niu_record_dispatch_guardrails();

-- @niu-legacy-migration 0058_guardrail_preparation_denials.sql 1205
CREATE TABLE guardrail_preparation_denials (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    reason TEXT NOT NULL CHECK (reason IN ('model_denied','provider_denied','unsupported_policy')),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
    FOREIGN KEY (organization_id,project_id,workspace_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision),
    FOREIGN KEY (organization_id,project_id,key_policy_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision),
    CHECK (key_assignment_revision IS NULL OR key_assignment_revision > 0)
);
CREATE INDEX guardrail_preparation_denials_scope_time ON guardrail_preparation_denials(organization_id,project_id,recorded_at DESC,id DESC);
CREATE TRIGGER immutable_guardrail_preparation_denial
BEFORE UPDATE OR DELETE ON guardrail_preparation_denials
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0059_inspected_guardrail_binding.sql 2530
-- Bind gateway preparation to the policy revisions checked at dispatch.
CREATE TABLE inspected_guardrail_bindings (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    key_id UUID NOT NULL,
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    PRIMARY KEY (organization_id, project_id, attempt_id),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES attempts(organization_id, project_id, id) DEFERRABLE INITIALLY DEFERRED,
    FOREIGN KEY (organization_id, project_id, key_id)
        REFERENCES api_keys(organization_id, project_id, id)
);
CREATE TRIGGER immutable_inspected_guardrail_binding
BEFORE UPDATE OR DELETE ON inspected_guardrail_bindings
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION niu_check_inspected_guardrail_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    binding inspected_guardrail_bindings%ROWTYPE;
    workspace_revision BIGINT;
    policy_revision BIGINT;
    assignment_revision BIGINT;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    SELECT * INTO binding FROM inspected_guardrail_bindings
        WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND attempt_id=NEW.id;
    -- Compatibility callers still undergo the existing live access checks.
    IF NOT FOUND THEN RETURN NEW; END IF;
    -- Model/provider dispatch checks acquired workspace coordination and key locks.
    SELECT NULLIF(revision,0) INTO workspace_revision FROM workspace_guardrail_heads
        WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id;
    SELECT a.policy_revision,a.assignment_revision INTO policy_revision,assignment_revision
        FROM key_guardrail_assignments a
        WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id;
    IF binding.key_id IS DISTINCT FROM NEW.api_key_id
        OR binding.workspace_revision IS DISTINCT FROM workspace_revision
        OR binding.key_policy_revision IS DISTINCT FROM policy_revision
        OR binding.key_assignment_revision IS DISTINCT FROM assignment_revision THEN
        RAISE EXCEPTION 'inspected guardrail policy changed' USING ERRCODE='P0006';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER zy_check_inspected_guardrail_binding
BEFORE UPDATE OF execution ON attempts
FOR EACH ROW EXECUTE FUNCTION niu_check_inspected_guardrail_binding();

-- @niu-legacy-migration 0060_inspected_binding_lock_order.sql 517
-- Binding insertion precedes admission's ordered workspace/key locks.
-- Defer the key reference check until commit to preserve that lock order.
DO $$
DECLARE key_constraint TEXT;
BEGIN
    SELECT conname INTO STRICT key_constraint FROM pg_constraint
        WHERE conrelid='inspected_guardrail_bindings'::regclass
          AND confrelid='api_keys'::regclass AND contype='f';
    EXECUTE format('ALTER TABLE inspected_guardrail_bindings ALTER CONSTRAINT %I DEFERRABLE INITIALLY DEFERRED', key_constraint);
END;
$$;

-- @niu-legacy-migration 0061_live_input_guardrails.sql 2810
ALTER TABLE guardrail_preparation_denials DROP CONSTRAINT guardrail_preparation_denials_reason_check;
ALTER TABLE guardrail_preparation_denials ADD CONSTRAINT guardrail_preparation_denials_reason_check CHECK (
    reason IN ('model_denied','provider_denied','unsupported_policy','input_blocked','input_unsupported','input_resource_limit','input_unavailable')
);
CREATE OR REPLACE FUNCTION niu_check_inspected_guardrail_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    binding inspected_guardrail_bindings%ROWTYPE;
    workspace_revision BIGINT;
    policy_revision BIGINT;
    assignment_revision BIGINT;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    SELECT * INTO binding FROM inspected_guardrail_bindings
        WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND attempt_id=NEW.id;
    -- Compatibility callers still undergo the existing live access checks.
    IF NOT FOUND THEN
        IF EXISTS (
            SELECT 1 FROM workspace_guardrail_heads h
            JOIN workspace_guardrail_revisions r USING(organization_id,project_id,revision)
            WHERE h.organization_id=NEW.organization_id AND h.project_id=NEW.project_id
              AND jsonb_array_length(COALESCE(r.policy->'input_rules','[]'::jsonb)) > 0
        ) OR EXISTS (
            SELECT 1 FROM key_guardrail_assignments a
            JOIN workspace_guardrail_revisions r ON r.organization_id=a.organization_id AND r.project_id=a.project_id AND r.revision=a.policy_revision
            WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id
              AND jsonb_array_length(COALESCE(r.policy->'input_rules','[]'::jsonb)) > 0
        ) THEN
            RAISE EXCEPTION 'input inspection binding required' USING ERRCODE='P0006';
        END IF;
        RETURN NEW;
    END IF;
    -- Model/provider dispatch checks acquired workspace coordination and key locks.
    SELECT NULLIF(revision,0) INTO workspace_revision FROM workspace_guardrail_heads
        WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id;
    SELECT a.policy_revision,a.assignment_revision INTO policy_revision,assignment_revision
        FROM key_guardrail_assignments a
        WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id;
    IF binding.key_id IS DISTINCT FROM NEW.api_key_id
        OR binding.workspace_revision IS DISTINCT FROM workspace_revision
        OR binding.key_policy_revision IS DISTINCT FROM policy_revision
        OR binding.key_assignment_revision IS DISTINCT FROM assignment_revision THEN
        RAISE EXCEPTION 'inspected guardrail policy changed' USING ERRCODE='P0006';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0062_input_inspection_attribution.sql 1624
-- Nullable historical metadata: do not invent inspection evidence for old attempts.
ALTER TABLE inspected_guardrail_bindings
    ADD COLUMN input_outcome TEXT,
    ADD COLUMN input_elapsed_ms BIGINT,
    ADD CONSTRAINT valid_input_inspection CHECK (
        (input_outcome IS NULL AND input_elapsed_ms IS NULL)
        OR (input_outcome IN ('allowed','redacted') AND input_elapsed_ms IS NOT NULL AND input_elapsed_ms >= 0)
    );

CREATE FUNCTION niu_require_input_inspection_result() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE binding inspected_guardrail_bindings%ROWTYPE;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    SELECT * INTO binding FROM inspected_guardrail_bindings
        WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND attempt_id=NEW.id;
    -- The preceding binding check handles absence and policy revision changes.
    IF NOT FOUND THEN RETURN NEW; END IF;
    IF binding.input_outcome IS NULL AND EXISTS (
        SELECT 1 FROM workspace_guardrail_revisions r
        WHERE r.organization_id=binding.organization_id AND r.project_id=binding.project_id
          AND r.revision IN (binding.workspace_revision,binding.key_policy_revision)
          AND jsonb_array_length(COALESCE(r.policy->'input_rules','[]'::jsonb)) > 0
    ) THEN
        RAISE EXCEPTION 'input inspection result required' USING ERRCODE='P0006';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER zyb_require_input_inspection_result
BEFORE UPDATE OF execution ON attempts
FOR EACH ROW EXECUTE FUNCTION niu_require_input_inspection_result();

-- @niu-legacy-migration 0063_inspection_metadata_null_consistency.sql 453
-- SQL CHECK treats null as passing, so explicitly require both result fields.
ALTER TABLE inspected_guardrail_bindings DROP CONSTRAINT valid_input_inspection;
ALTER TABLE inspected_guardrail_bindings ADD CONSTRAINT valid_input_inspection CHECK (
    (input_outcome IS NULL AND input_elapsed_ms IS NULL)
    OR (input_outcome IS NOT NULL AND input_outcome IN ('allowed','redacted')
        AND input_elapsed_ms IS NOT NULL AND input_elapsed_ms >= 0)
);

-- @niu-legacy-migration 0064_buffered_output_guardrails.sql 4071
ALTER TABLE guardrail_preparation_denials DROP CONSTRAINT guardrail_preparation_denials_reason_check;
ALTER TABLE guardrail_preparation_denials ADD CONSTRAINT guardrail_preparation_denials_reason_check CHECK (
    reason IN ('model_denied','provider_denied','unsupported_policy','input_blocked','input_unsupported','input_resource_limit','input_unavailable','output_incompatible')
);
CREATE TABLE output_guardrail_decisions (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('allowed','redacted','blocked','indeterminate')),
    reason TEXT NOT NULL CHECK (reason IN ('inspected_text','pattern_denial','unsupported_content','resource_limit','inspection_unavailable')),
    elapsed_ms BIGINT NOT NULL CHECK (elapsed_ms >= 0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id,project_id,attempt_id),
    FOREIGN KEY (organization_id,project_id,attempt_id) REFERENCES attempts(organization_id,project_id,id),
    CHECK ((outcome IN ('allowed','redacted') AND reason='inspected_text')
        OR (outcome='blocked' AND reason='pattern_denial')
        OR (outcome='indeterminate' AND reason IN ('unsupported_content','resource_limit','inspection_unavailable')))
);
CREATE TRIGGER immutable_output_guardrail_decision
BEFORE UPDATE OR DELETE ON output_guardrail_decisions
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE OR REPLACE FUNCTION niu_check_inspected_guardrail_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    binding inspected_guardrail_bindings%ROWTYPE;
    workspace_revision BIGINT;
    policy_revision BIGINT;
    assignment_revision BIGINT;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    SELECT * INTO binding FROM inspected_guardrail_bindings
        WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND attempt_id=NEW.id;
    -- Compatibility callers still undergo the existing live access checks.
    IF NOT FOUND THEN
        IF EXISTS (
            SELECT 1 FROM workspace_guardrail_heads h
            JOIN workspace_guardrail_revisions r USING(organization_id,project_id,revision)
            WHERE h.organization_id=NEW.organization_id AND h.project_id=NEW.project_id
              AND (jsonb_array_length(COALESCE(r.policy->'input_rules','[]'::jsonb)) > 0 OR jsonb_array_length(COALESCE(r.policy->'output'->'rules','[]'::jsonb)) > 0)
        ) OR EXISTS (
            SELECT 1 FROM key_guardrail_assignments a
            JOIN workspace_guardrail_revisions r ON r.organization_id=a.organization_id AND r.project_id=a.project_id AND r.revision=a.policy_revision
            WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id
              AND (jsonb_array_length(COALESCE(r.policy->'input_rules','[]'::jsonb)) > 0 OR jsonb_array_length(COALESCE(r.policy->'output'->'rules','[]'::jsonb)) > 0)
        ) THEN
            RAISE EXCEPTION 'input inspection binding required' USING ERRCODE='P0006';
        END IF;
        RETURN NEW;
    END IF;
    -- Model/provider dispatch checks acquired workspace coordination and key locks.
    SELECT NULLIF(revision,0) INTO workspace_revision FROM workspace_guardrail_heads
        WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id;
    SELECT a.policy_revision,a.assignment_revision INTO policy_revision,assignment_revision
        FROM key_guardrail_assignments a
        WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id;
    IF binding.key_id IS DISTINCT FROM NEW.api_key_id
        OR binding.workspace_revision IS DISTINCT FROM workspace_revision
        OR binding.key_policy_revision IS DISTINCT FROM policy_revision
        OR binding.key_assignment_revision IS DISTINCT FROM assignment_revision THEN
        RAISE EXCEPTION 'inspected guardrail policy changed' USING ERRCODE='P0006';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0065_request_payload_deletions.sql 336
-- Keep explicit deletion effective even if asynchronous capture finishes later.
-- Contains no request or response content; accounting remains unchanged.
CREATE TABLE request_payload_deletions (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- @niu-legacy-migration 0066_guardrail_rejection_metadata.sql 5285
-- Distinguish checked policy rejection from unrelated admission conflicts.
-- Details contain only revision metadata, never policies, payloads or credentials.
CREATE FUNCTION niu_guardrail_rejection_detail(org UUID, workspace UUID, key UUID, reason TEXT)
RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'reason',reason,
        'workspace_revision',(SELECT NULLIF(revision,0) FROM workspace_guardrail_heads WHERE organization_id=org AND project_id=workspace),
        'key_policy_revision',(SELECT policy_revision FROM key_guardrail_assignments WHERE organization_id=org AND project_id=workspace AND key_id=key),
        'key_assignment_revision',(SELECT assignment_revision FROM key_guardrail_assignments WHERE organization_id=org AND project_id=workspace AND key_id=key)
    )::text;
$$;

CREATE OR REPLACE FUNCTION niu_check_dispatch_model_guardrails() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    requested_model TEXT;
    policy JSONB;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    -- Activation takes this same transaction lock before changing the workspace head.
    PERFORM pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||NEW.organization_id::text||':'||NEW.project_id::text,0));
    -- Key assignment/revocation takes the key row lock before changing restrictions.
    PERFORM id FROM api_keys WHERE id=NEW.api_key_id FOR SHARE;
    SELECT model_alias INTO requested_model FROM operations WHERE id=NEW.operation_id;
    FOR policy IN
        SELECT r.policy FROM workspace_guardrail_heads h
        JOIN workspace_guardrail_revisions r USING(organization_id,project_id,revision)
        WHERE h.organization_id=NEW.organization_id AND h.project_id=NEW.project_id
        UNION ALL
        SELECT r.policy FROM key_guardrail_assignments a
        JOIN workspace_guardrail_revisions r ON r.organization_id=a.organization_id
            AND r.project_id=a.project_id AND r.revision=a.policy_revision
        WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id
    LOOP
        IF policy->>'schema_version' IS DISTINCT FROM '1'
           OR NOT niu_model_rule_permits(policy->'models',requested_model)
           OR NOT niu_model_rule_permits(policy->'providers',NEW.dispatch_provider) THEN
            RAISE EXCEPTION 'access guardrail changed before dispatch' USING ERRCODE='P0010', DETAIL=niu_guardrail_rejection_detail(NEW.organization_id,NEW.project_id,NEW.api_key_id,'access_denied');
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION niu_check_inspected_guardrail_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    binding inspected_guardrail_bindings%ROWTYPE;
    workspace_revision BIGINT;
    policy_revision BIGINT;
    assignment_revision BIGINT;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    SELECT * INTO binding FROM inspected_guardrail_bindings
        WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND attempt_id=NEW.id;
    -- Compatibility callers still undergo the existing live access checks.
    IF NOT FOUND THEN
        IF EXISTS (
            SELECT 1 FROM workspace_guardrail_heads h
            JOIN workspace_guardrail_revisions r USING(organization_id,project_id,revision)
            WHERE h.organization_id=NEW.organization_id AND h.project_id=NEW.project_id
              AND jsonb_array_length(COALESCE(r.policy->'input_rules','[]'::jsonb)) > 0
        ) OR EXISTS (
            SELECT 1 FROM key_guardrail_assignments a
            JOIN workspace_guardrail_revisions r ON r.organization_id=a.organization_id AND r.project_id=a.project_id AND r.revision=a.policy_revision
            WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id
              AND jsonb_array_length(COALESCE(r.policy->'input_rules','[]'::jsonb)) > 0
        ) THEN
            RAISE EXCEPTION 'input inspection binding required' USING ERRCODE='P0010', DETAIL=niu_guardrail_rejection_detail(NEW.organization_id,NEW.project_id,NEW.api_key_id,'input_binding_missing');
        END IF;
        RETURN NEW;
    END IF;
    -- Model/provider dispatch checks acquired workspace coordination and key locks.
    SELECT NULLIF(revision,0) INTO workspace_revision FROM workspace_guardrail_heads
        WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id;
    SELECT a.policy_revision,a.assignment_revision INTO policy_revision,assignment_revision
        FROM key_guardrail_assignments a
        WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id;
    IF binding.key_id IS DISTINCT FROM NEW.api_key_id
        OR binding.workspace_revision IS DISTINCT FROM workspace_revision
        OR binding.key_policy_revision IS DISTINCT FROM policy_revision
        OR binding.key_assignment_revision IS DISTINCT FROM assignment_revision THEN
        RAISE EXCEPTION 'inspected guardrail policy changed' USING ERRCODE='P0010', DETAIL=niu_guardrail_rejection_detail(NEW.organization_id,NEW.project_id,NEW.api_key_id,'policy_changed');
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0067_dispatch_guardrail_rejections.sql 3051
-- Retain denial outside the subtransaction that rejected dispatch.
CREATE TABLE dispatch_guardrail_rejections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    key_id UUID NOT NULL,
    reason TEXT NOT NULL CHECK(reason IN ('access_denied','input_binding_missing','policy_changed')),
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY(organization_id,project_id,attempt_id) REFERENCES attempts(organization_id,project_id,id),
    FOREIGN KEY(organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
    FOREIGN KEY(organization_id,project_id,workspace_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision),
    FOREIGN KEY(organization_id,project_id,key_policy_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision),
    CHECK(key_assignment_revision IS NULL OR key_assignment_revision > 0)
);
CREATE INDEX dispatch_guardrail_rejections_scope_time ON dispatch_guardrail_rejections(organization_id,project_id,recorded_at DESC,id DESC);
CREATE TRIGGER immutable_dispatch_guardrail_rejection BEFORE UPDATE OR DELETE ON dispatch_guardrail_rejections
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- Caller already holds ordered workspace, key, account and attempt locks.
-- Only the rejected UPDATE is rolled back; its safe checked metadata is retained.
CREATE FUNCTION niu_mark_dispatched_with_guardrail_audit(UUID,UUID,UUID,UUID)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
    changed BIGINT;
    rejection TEXT;
    metadata JSONB;
BEGIN
    BEGIN
        UPDATE attempts a SET execution = 'may_have_executed', dispatched_at = clock_timestamp(), api_key_id = $4 FROM operations o, api_keys k WHERE a.organization_id = $1 AND a.project_id = $2 AND a.id = $3 AND a.execution = 'not_sent' AND o.id = a.operation_id AND k.id = $4 AND ('*' = ANY(k.allowed_models) OR o.model_alias = ANY(k.allowed_models)) AND k.expires_at > clock_timestamp() AND NOT EXISTS (SELECT 1 FROM account_assignments s WHERE s.attempt_id=a.id AND s.state <> 'held') AND (NOT EXISTS (SELECT 1 FROM project_budgets b WHERE b.organization_id=$1 AND b.project_id=$2) OR EXISTS (SELECT 1 FROM cost_reservations r WHERE r.attempt_id=a.id AND r.state='held'));
        GET DIAGNOSTICS changed = ROW_COUNT;
        RETURN changed;
    EXCEPTION WHEN SQLSTATE 'P0010' THEN
        GET STACKED DIAGNOSTICS rejection = PG_EXCEPTION_DETAIL;
    END;
    metadata := rejection::jsonb;
    INSERT INTO dispatch_guardrail_rejections(organization_id,project_id,attempt_id,key_id,reason,workspace_revision,key_policy_revision,key_assignment_revision)
    VALUES($1,$2,$3,$4,metadata->>'reason',(metadata->>'workspace_revision')::BIGINT,(metadata->>'key_policy_revision')::BIGINT,(metadata->>'key_assignment_revision')::BIGINT);
    RETURN -1;
END;
$$;

-- @niu-legacy-migration 0068_priced_dispatch_guardrail_audit.sql 1228
-- Catch only genuine policy rejection after rolling back all reservation effects.
CREATE FUNCTION niu_reserve_and_dispatch_gateway_audited(
    p_organization_id UUID, p_project_id UUID, p_key_id UUID, p_attempt_id UUID,
    p_price_revision_id UUID, p_resource_id TEXT, p_offer_revision TEXT,
    p_prompt_bound BIGINT, p_completion_bound BIGINT
) RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    rejection TEXT;
    metadata JSONB;
BEGIN
    BEGIN
        PERFORM niu_reserve_and_dispatch_gateway(p_organization_id,p_project_id,p_key_id,p_attempt_id,p_price_revision_id,p_resource_id,p_offer_revision,p_prompt_bound,p_completion_bound);
        RETURN TRUE;
    EXCEPTION WHEN SQLSTATE 'P0010' THEN
        GET STACKED DIAGNOSTICS rejection = PG_EXCEPTION_DETAIL;
    END;
    metadata := rejection::jsonb;
    INSERT INTO dispatch_guardrail_rejections(organization_id,project_id,attempt_id,key_id,reason,workspace_revision,key_policy_revision,key_assignment_revision)
    VALUES(p_organization_id,p_project_id,p_attempt_id,p_key_id,metadata->>'reason',(metadata->>'workspace_revision')::BIGINT,(metadata->>'key_policy_revision')::BIGINT,(metadata->>'key_assignment_revision')::BIGINT);
    RETURN FALSE;
END;
$$;

-- @niu-legacy-migration 0069_guardrail_rejection_snapshot.sql 233
-- Trigger checks run after policy coordination locks. Rejection metadata must
-- read the same current state, not a snapshot from before lock acquisition.
ALTER FUNCTION niu_guardrail_rejection_detail(UUID,UUID,UUID,TEXT) VOLATILE;

-- @niu-legacy-migration 0070_batch_guardrail_rejections.sql 2265
-- Distinguish checked policy rejection from unrelated admission conflicts.
-- Details contain only revision metadata, never policies, payloads or credentials.
CREATE OR REPLACE FUNCTION niu_guardrail_rejection_detail(org UUID, workspace UUID, key UUID, reason TEXT)
RETURNS TEXT LANGUAGE sql VOLATILE AS $$
    SELECT jsonb_build_object(
        'reason',reason,
        'organization_id',org,'project_id',workspace,'key_id',key,
        'workspace_revision',(SELECT NULLIF(revision,0) FROM workspace_guardrail_heads WHERE organization_id=org AND project_id=workspace),
        'key_policy_revision',(SELECT policy_revision FROM key_guardrail_assignments WHERE organization_id=org AND project_id=workspace AND key_id=key),
        'key_assignment_revision',(SELECT assignment_revision FROM key_guardrail_assignments WHERE organization_id=org AND project_id=workspace AND key_id=key)
    )::text;
$$;


-- Batch failure can roll back attempts; do not fabricate attempt attribution.
-- Retain denial outside the subtransaction that rejected dispatch.
CREATE TABLE batch_guardrail_rejections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    reason TEXT NOT NULL CHECK(reason IN ('access_denied','input_binding_missing','policy_changed')),
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY(organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
    FOREIGN KEY(organization_id,project_id,workspace_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision),
    FOREIGN KEY(organization_id,project_id,key_policy_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision),
    CHECK(key_assignment_revision IS NULL OR key_assignment_revision > 0)
);
CREATE INDEX batch_guardrail_rejections_scope_time ON batch_guardrail_rejections(organization_id,project_id,recorded_at DESC,id DESC);
CREATE TRIGGER immutable_batch_guardrail_rejection BEFORE UPDATE OR DELETE ON batch_guardrail_rejections
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();


-- @niu-legacy-migration 0071_request_token_categories.sql 339
CREATE TABLE request_token_categories (
    attempt_id uuid PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
    cached_input_tokens bigint CHECK (cached_input_tokens >= 0),
    reasoning_output_tokens bigint CHECK (reasoning_output_tokens >= 0),
    CHECK (cached_input_tokens IS NOT NULL OR reasoning_output_tokens IS NOT NULL)
);

-- @niu-legacy-migration 0072_request_timing_chronology.sql 482
-- Interrupted requests may have no headers. Their measured elapsed time and
-- dispatch still need a valid common monotonic axis.
ALTER TABLE request_timings
    ADD CONSTRAINT request_timings_nonnegative_total CHECK (total_ms >= 0),
    ADD CONSTRAINT request_timings_dispatch_within_total
        CHECK (dispatch_ms IS NULL OR dispatch_ms <= total_ms),
    ADD CONSTRAINT request_timings_output_requires_headers
        CHECK (first_output_ms IS NULL OR headers_ms IS NOT NULL);

-- @niu-legacy-migration 0073_private_codex_connections.sql 935
-- Private subscription credentials never enter installation-wide vendor routes.
CREATE TABLE codex_runtime_identity (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    host_id UUID NOT NULL
);
CREATE TABLE codex_connections (
    account_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
    subject TEXT NOT NULL,
    client_id TEXT NOT NULL,
    credential_ciphertext BYTEA NOT NULL,
    models JSONB NOT NULL CHECK (jsonb_typeof(models) = 'array'),
    lease_owner UUID,
    last_used_at TIMESTAMPTZ,
    cooldown_until TIMESTAMPTZ,
    FOREIGN KEY (organization_id, project_id, account_id)
      REFERENCES supplier_accounts(organization_id, project_id, id),
    UNIQUE (organization_id, project_id, subject, client_id)
);
CREATE INDEX codex_connections_scope ON codex_connections(organization_id, project_id);

-- @niu-legacy-migration 0074_request_finish_reasons.sql 331
-- Content-free completion observations outlive optional payload retention.
CREATE TABLE request_finish_reasons (
    attempt_id uuid PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
    choices jsonb NOT NULL CHECK (
        jsonb_typeof(choices) = 'array'
        AND jsonb_array_length(choices) BETWEEN 1 AND 128
    )
);

-- @niu-legacy-migration 0075_codex_registration_ownership.sql 245
-- One renewable OAuth registration has one private workspace owner. Sharing it
-- across scopes would race rotating tokens and violate credential isolation.
CREATE UNIQUE INDEX codex_registration_owner ON codex_connections(subject, client_id);

-- @niu-legacy-migration 0076_key_dispatch_activity.sql 283
-- Last-used metadata comes from durable dispatch intent, not authentication or payload retention.
CREATE INDEX attempts_key_latest_dispatch
    ON attempts (organization_id, project_id, api_key_id, dispatched_at DESC)
    WHERE api_key_id IS NOT NULL AND dispatched_at IS NOT NULL;

-- @niu-legacy-migration 0077_agent_session_traces.sql 1139
-- Native telemetry events stay immutable; a session projection assembles their tree.
ALTER TABLE personal_agent_traces ADD COLUMN session_key TEXT;
ALTER TABLE personal_agent_traces ADD COLUMN session_segment INTEGER;
ALTER TABLE personal_agent_traces ADD CONSTRAINT personal_agent_session_key_shape
    CHECK ((session_key IS NULL AND session_segment IS NULL) OR
           (session_key ~ '^[a-f0-9]{64}$' AND session_segment >= 1));
CREATE UNIQUE INDEX personal_agent_session_segments
    ON personal_agent_traces(owner_id, connection_id, session_key, session_segment)
    WHERE session_key IS NOT NULL;
CREATE TABLE personal_agent_trace_events (
    owner_id UUID NOT NULL,
    connection_id UUID NOT NULL,
    event_id TEXT NOT NULL,
    trace_id UUID NOT NULL REFERENCES personal_agent_traces(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(owner_id, connection_id, event_id),
    FOREIGN KEY(owner_id, connection_id) REFERENCES personal_agent_connections(owner_id, id)
);
CREATE INDEX personal_agent_trace_events_trace ON personal_agent_trace_events(trace_id);

-- @niu-legacy-migration 0078_unassembled_agent_events.sql 645
-- Previous adapters stored isolated native events as runs. Retain them as evidence,
-- but exclude them from the default session/run report when correlation was lost.
ALTER TABLE personal_agent_traces ADD COLUMN unassembled_event BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE personal_agent_traces ADD COLUMN superseded_by UUID REFERENCES personal_agent_traces(id) ON DELETE CASCADE;
UPDATE personal_agent_traces SET unassembled_event=TRUE
WHERE source='codex' AND session_key IS NULL
  AND name IN ('Codex API request','Codex response completion','Codex tool')
  AND record->>'task_id' = 'task-' || record_id
  AND record_id ~ '^[a-f0-9]{64}$';

-- @niu-legacy-migration 0079_native_trace_unset_timestamps.sql 1167
-- OTLP exporters can leave timeUnixNano at zero while reporting event.timestamp.
-- Older native projections misread that sentinel as 1970. Immutable receipts stay
-- intact; clear only the invalid projection timing and use an explicit receipt basis.
UPDATE personal_agent_traces AS trace
SET record=jsonb_set(record,'{spans}',(
    SELECT jsonb_agg(span || jsonb_build_object(
        'started_at_ms',CASE WHEN span->>'started_at_ms'='0' THEN 'null'::jsonb ELSE span->'started_at_ms' END,
        'ended_at_ms',CASE WHEN span->>'ended_at_ms'='0' THEN 'null'::jsonb ELSE span->'ended_at_ms' END
    ) ORDER BY ordinal)
    FROM jsonb_array_elements(record->'spans') WITH ORDINALITY AS item(span,ordinal)
)),
    occurred_at=CASE WHEN occurred_at=to_timestamp(0) THEN received_at ELSE occurred_at END,
    time_basis=CASE WHEN occurred_at=to_timestamp(0) THEN 'received' ELSE time_basis END,
    duration_ms=CASE WHEN occurred_at=to_timestamp(0) THEN NULL ELSE duration_ms END
WHERE source='codex' AND session_key IS NOT NULL AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(record->'spans') span
    WHERE span->>'started_at_ms'='0' OR span->>'ended_at_ms'='0'
);

-- @niu-legacy-migration 0081_customer_balance_accounts.sql 2718
-- Organization-owned retail balances. Workspaces share capacity within a currency.
-- No accounts are funded by migration; historical invoices remain historical records.
CREATE TABLE customer_balance_accounts (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    credit_limit_nanos BIGINT NOT NULL DEFAULT 0 CHECK (credit_limit_nanos >= 0),
    warning_threshold_nanos BIGINT CHECK (warning_threshold_nanos >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, currency),
    UNIQUE (organization_id, id, currency)
);

-- Signed, append-only entries: verified funding and refunds credit the balance;
-- customer charges and funding reversals debit it. Never record procurement here.
CREATE TABLE customer_balance_entries (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('funding', 'charge', 'refund', 'funding_reversal', 'adjustment')),
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos <> 0),
    idempotency_key UUID NOT NULL,
    project_id UUID,
    attempt_id UUID,
    reverses_entry_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, account_id, currency)
        REFERENCES customer_balance_accounts(organization_id, id, currency),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES customer_charges(organization_id, project_id, attempt_id),
    UNIQUE (account_id, idempotency_key),
    UNIQUE (organization_id, account_id, currency, id),
    FOREIGN KEY (organization_id, account_id, currency, reverses_entry_id)
        REFERENCES customer_balance_entries(organization_id, account_id, currency, id),
    CHECK ((kind IN ('funding', 'refund') AND amount_nanos > 0)
        OR (kind IN ('charge', 'funding_reversal') AND amount_nanos < 0)
        OR kind = 'adjustment'),
    CHECK ((kind = 'charge' AND project_id IS NOT NULL AND attempt_id IS NOT NULL)
        OR (kind <> 'charge' AND project_id IS NULL AND attempt_id IS NULL)),
    CHECK ((kind IN ('refund', 'funding_reversal') AND reverses_entry_id IS NOT NULL)
        OR (kind NOT IN ('refund', 'funding_reversal') AND reverses_entry_id IS NULL))
);
CREATE UNIQUE INDEX customer_balance_charge_once ON customer_balance_entries(attempt_id)
    WHERE kind = 'charge';
CREATE INDEX customer_balance_entries_account ON customer_balance_entries(account_id, created_at, id);
CREATE TRIGGER immutable_customer_balance_entry BEFORE UPDATE OR DELETE ON customer_balance_entries
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0082_customer_balance_attempt_binding.sql 793
-- Pin the account before dispatch. Creating an account later must not silently
-- debit historical invoice-era requests from newly deposited customer funds.
CREATE TABLE customer_attempt_balance_accounts (
    attempt_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES attempts(organization_id, project_id, id),
    FOREIGN KEY (organization_id, account_id, currency)
        REFERENCES customer_balance_accounts(organization_id, id, currency)
);
CREATE TRIGGER immutable_customer_balance_binding BEFORE UPDATE OR DELETE ON customer_attempt_balance_accounts
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0083_customer_funding_receipts.sql 968
-- Only settled payments verified by a trusted integration may create receipts.
-- A payment reference cannot credit two organizations or currencies.
CREATE TABLE customer_funding_receipts (
    channel TEXT NOT NULL CHECK (length(trim(channel)) BETWEEN 1 AND 100),
    payment_reference TEXT NOT NULL CHECK (length(trim(payment_reference)) BETWEEN 1 AND 200),
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    entry_id UUID NOT NULL UNIQUE,
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (channel, payment_reference),
    FOREIGN KEY (organization_id, account_id, currency, entry_id)
        REFERENCES customer_balance_entries(organization_id, account_id, currency, id)
);
CREATE TRIGGER immutable_customer_funding_receipt BEFORE UPDATE OR DELETE ON customer_funding_receipts
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0084_customer_balance_reservations.sql 626
CREATE TABLE customer_balance_reservations (
    attempt_id UUID PRIMARY KEY REFERENCES customer_attempt_balance_accounts(attempt_id),
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    released_at TIMESTAMPTZ,
    FOREIGN KEY (organization_id, account_id, currency)
        REFERENCES customer_balance_accounts(organization_id, id, currency)
);
CREATE INDEX customer_balance_reservations_held ON customer_balance_reservations(account_id)
    WHERE released_at IS NULL;

-- @niu-legacy-migration 0085_customer_reservation_integrity.sql 1466
ALTER TABLE customer_attempt_balance_accounts
    ADD UNIQUE (attempt_id, organization_id, account_id, currency);
ALTER TABLE customer_balance_reservations
    ADD FOREIGN KEY (attempt_id, organization_id, account_id, currency)
        REFERENCES customer_attempt_balance_accounts(attempt_id, organization_id, account_id, currency);

CREATE FUNCTION protect_customer_balance_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'customer reservations cannot be deleted';
    END IF;
    IF ROW(NEW.attempt_id, NEW.organization_id, NEW.account_id, NEW.currency, NEW.amount_nanos, NEW.created_at)
        IS DISTINCT FROM ROW(OLD.attempt_id, OLD.organization_id, OLD.account_id, OLD.currency, OLD.amount_nanos, OLD.created_at)
        OR OLD.released_at IS NOT NULL OR NEW.released_at IS NULL THEN
        RAISE EXCEPTION 'only a terminal reservation release is permitted';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM attempts a WHERE a.id = OLD.attempt_id
        AND (a.execution = 'confirmed_not_executed'
            OR EXISTS (SELECT 1 FROM customer_charges c WHERE c.attempt_id = a.id))
    ) THEN
        RAISE EXCEPTION 'uncertain customer liability cannot be released';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_customer_balance_reservation BEFORE UPDATE OR DELETE ON customer_balance_reservations
    FOR EACH ROW EXECUTE FUNCTION protect_customer_balance_reservation();

-- @niu-legacy-migration 0086_prepaid_dispatch_requirement.sql 1563
-- Defense in depth for every adapter, including batched unpriced admission.
CREATE FUNCTION require_customer_balance_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    END IF;
    -- Funding/account activation takes an organization update lock. Admission
    -- holds a shared lock until commit so activation cannot race this check.
    PERFORM id FROM organizations WHERE id=NEW.organization_id FOR SHARE;
    IF EXISTS (SELECT 1 FROM customer_balance_accounts WHERE organization_id=NEW.organization_id)
        AND NOT EXISTS (SELECT 1 FROM customer_balance_reservations
            WHERE attempt_id=NEW.id AND organization_id=NEW.organization_id AND released_at IS NULL)
        AND NOT EXISTS (
            SELECT 1 FROM customer_attempt_tariffs t
            JOIN customer_tariff_revisions r ON r.id=t.revision_id
            JOIN customer_attempt_balance_accounts b ON b.attempt_id=t.attempt_id AND b.currency=r.currency
            WHERE t.attempt_id=NEW.id AND b.organization_id=NEW.organization_id
                AND r.prompt_rate=0 AND r.completion_rate=0
        ) THEN
        RAISE EXCEPTION 'prepaid dispatch requires a funded retail reservation' USING ERRCODE='P0009';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_customer_balance_dispatch BEFORE INSERT OR UPDATE OF execution ON attempts
    FOR EACH ROW EXECUTE FUNCTION require_customer_balance_dispatch();

-- @niu-legacy-migration 0087_customer_balance_policy_revisions.sql 859
ALTER TABLE customer_balance_accounts ADD COLUMN policy_revision BIGINT NOT NULL DEFAULT 0 CHECK (policy_revision >= 0);
CREATE TABLE customer_balance_policy_revisions (
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    revision BIGINT NOT NULL CHECK (revision > 0),
    credit_limit_nanos BIGINT NOT NULL CHECK (credit_limit_nanos >= 0),
    warning_threshold_nanos BIGINT CHECK (warning_threshold_nanos >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (account_id, revision),
    FOREIGN KEY (organization_id, account_id, currency)
        REFERENCES customer_balance_accounts(organization_id, id, currency)
);
CREATE TRIGGER immutable_customer_balance_policy BEFORE UPDATE OR DELETE ON customer_balance_policy_revisions
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0088_unsent_customer_reservation_recovery.sql 1045
-- Never-dispatched intent is durable proof of no upstream liability.
CREATE OR REPLACE FUNCTION protect_customer_balance_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'customer reservations cannot be deleted';
    END IF;
    IF ROW(NEW.attempt_id, NEW.organization_id, NEW.account_id, NEW.currency, NEW.amount_nanos, NEW.created_at)
        IS DISTINCT FROM ROW(OLD.attempt_id, OLD.organization_id, OLD.account_id, OLD.currency, OLD.amount_nanos, OLD.created_at)
        OR OLD.released_at IS NOT NULL OR NEW.released_at IS NULL THEN
        RAISE EXCEPTION 'only a terminal reservation release is permitted';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM attempts a WHERE a.id = OLD.attempt_id
        AND (a.execution IN ('not_sent', 'confirmed_not_executed')
            OR EXISTS (SELECT 1 FROM customer_charges c WHERE c.attempt_id = a.id))
    ) THEN
        RAISE EXCEPTION 'uncertain customer liability cannot be released';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0089_customer_balance_history_index.sql 126
CREATE INDEX customer_balance_entries_company_history ON customer_balance_entries(organization_id, created_at DESC, id DESC);

-- @niu-legacy-migration 0090_customer_topup_orders.sql 2643
-- Immutable order intent, provider identity and successful settlement are separate.
-- Pending orders never grant spending capacity. No merchant secrets are stored here.
CREATE TABLE customer_topup_orders (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos > 0),
    aggregator TEXT NOT NULL CHECK (aggregator ~ '^[a-z0-9]{1,32}$'),
    merchant TEXT NOT NULL CHECK (merchant ~ '^[A-Za-z0-9]{1,64}$'),
    payment_method TEXT NOT NULL CHECK (payment_method ~ '^[A-Za-z0-9.-]{1,64}$'),
    idempotency_key UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, account_id, currency)
        REFERENCES customer_balance_accounts(organization_id, id, currency),
    UNIQUE (organization_id, idempotency_key),
    UNIQUE (id, aggregator, merchant),
    UNIQUE (id, organization_id, account_id, currency)
);
CREATE INDEX customer_topup_orders_company_history ON customer_topup_orders(organization_id, created_at DESC, id DESC);
CREATE TRIGGER immutable_customer_topup_order BEFORE UPDATE OR DELETE ON customer_topup_orders
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE TABLE customer_topup_provider_orders (
    order_id UUID PRIMARY KEY,
    aggregator TEXT NOT NULL,
    merchant TEXT NOT NULL,
    platform_reference TEXT NOT NULL CHECK (platform_reference ~ '^[A-Za-z0-9]{1,128}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (aggregator, merchant, platform_reference),
    FOREIGN KEY (order_id, aggregator, merchant)
        REFERENCES customer_topup_orders(id, aggregator, merchant)
);
CREATE TRIGGER immutable_customer_topup_provider_order BEFORE UPDATE OR DELETE ON customer_topup_provider_orders
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE TABLE customer_topup_settlements (
    order_id UUID PRIMARY KEY REFERENCES customer_topup_orders(id),
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    entry_id UUID NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, account_id, currency, entry_id)
        REFERENCES customer_balance_entries(organization_id, account_id, currency, id),
    FOREIGN KEY (order_id, organization_id, account_id, currency)
        REFERENCES customer_topup_orders(id, organization_id, account_id, currency)
);
CREATE TRIGGER immutable_customer_topup_settlement BEFORE UPDATE OR DELETE ON customer_topup_settlements
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0091_customer_topup_creation_claims.sql 494
-- Commit before contacting an aggregator. An uncertain request is reconciled,
-- never automatically re-created, even after process replacement.
CREATE TABLE customer_topup_creation_claims (
    order_id UUID PRIMARY KEY REFERENCES customer_topup_orders(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_customer_topup_creation_claim
    BEFORE UPDATE OR DELETE ON customer_topup_creation_claims
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0092_payment_query_limits.sql 330
-- Shared admission state, not payment evidence or an accounting record.
CREATE TABLE payment_query_limits (
    aggregator TEXT NOT NULL CHECK (aggregator ~ '^[a-z0-9]{1,32}$'),
    merchant TEXT NOT NULL CHECK (merchant ~ '^[A-Za-z0-9]{1,64}$'),
    next_query_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (aggregator, merchant)
);

-- @niu-legacy-migration 0093_customer_topup_recovery_index.sql 109
CREATE INDEX customer_topup_orders_merchant_recovery
    ON customer_topup_orders(aggregator, merchant, id);

-- @niu-legacy-migration 0094_customer_topup_checkout.sql 603
-- A validated checkout response survives browser/device changes and restarts.
-- It grants no funds and cannot replace an earlier checkout identity.
CREATE TABLE customer_topup_checkout (
    order_id UUID PRIMARY KEY REFERENCES customer_topup_provider_orders(order_id),
    checkout_url TEXT NOT NULL CHECK (length(checkout_url) BETWEEN 1 AND 2048 AND checkout_url LIKE 'https://%'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_customer_topup_checkout BEFORE UPDATE OR DELETE ON customer_topup_checkout
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0095_customer_topup_notifications.sql 416
-- Only verified notification receipt, never paid state or unsigned payload.
CREATE TABLE customer_topup_notifications (
    order_id UUID PRIMARY KEY REFERENCES customer_topup_orders(id),
    received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_customer_topup_notification BEFORE UPDATE OR DELETE ON customer_topup_notifications
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0096_customer_topup_closures.sql 1680
-- Closure requires independently verified provider identity. It is terminal,
-- immutable and mutually exclusive with funding, including concurrent writes.
ALTER TABLE customer_topup_provider_orders ADD CONSTRAINT customer_topup_bound_identity
    UNIQUE (order_id, platform_reference);
CREATE TABLE customer_topup_closures (
    order_id UUID PRIMARY KEY REFERENCES customer_topup_orders(id),
    platform_reference TEXT NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (order_id, platform_reference)
        REFERENCES customer_topup_provider_orders(order_id, platform_reference)
);
CREATE TRIGGER immutable_customer_topup_closure BEFORE UPDATE OR DELETE ON customer_topup_closures
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE FUNCTION guard_topup_terminal_state() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM id FROM customer_topup_orders WHERE id = NEW.order_id FOR UPDATE;
    IF TG_TABLE_NAME = 'customer_topup_closures' THEN
        IF EXISTS (SELECT 1 FROM customer_topup_settlements WHERE order_id = NEW.order_id) THEN
            RAISE EXCEPTION 'Payment already settled';
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM customer_topup_closures WHERE order_id = NEW.order_id) THEN
            RAISE EXCEPTION 'Payment already closed';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER guard_customer_topup_closure BEFORE INSERT ON customer_topup_closures
    FOR EACH ROW EXECUTE FUNCTION guard_topup_terminal_state();
CREATE TRIGGER guard_customer_topup_settlement BEFORE INSERT ON customer_topup_settlements
    FOR EACH ROW EXECUTE FUNCTION guard_topup_terminal_state();

-- @niu-legacy-migration 0097_personal_vendor_ownership.sql 2549
-- Personal upstream credentials belong to one customer account. This record
-- confers no commercial qualification and does not itself enable inference.
CREATE TABLE personal_vendor_ownership (
    vendor_id UUID PRIMARY KEY REFERENCES vendors(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX personal_vendor_organization ON personal_vendor_ownership(organization_id, vendor_id);

CREATE FUNCTION niu_personal_vendor_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'personal credential ownership is immutable' USING ERRCODE = '23514';
    END IF;
    PERFORM 1 FROM vendors WHERE id = NEW.vendor_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM provider_offers WHERE vendor_id = NEW.vendor_id
               AND (active OR current_qualification_review IS NOT NULL)) THEN
        RAISE EXCEPTION 'commercial supply cannot become personal' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER personal_vendor_owner_guard BEFORE INSERT OR UPDATE OR DELETE ON personal_vendor_ownership
    FOR EACH ROW EXECUTE FUNCTION niu_personal_vendor_owner_guard();

CREATE FUNCTION niu_commercial_offer_personal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.active OR NEW.current_qualification_review IS NOT NULL THEN
        PERFORM 1 FROM vendors WHERE id = NEW.vendor_id FOR UPDATE;
        IF EXISTS (SELECT 1 FROM personal_vendor_ownership WHERE vendor_id = NEW.vendor_id) THEN
            RAISE EXCEPTION 'personal credentials cannot supply commercial offers' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER commercial_offer_personal_guard BEFORE INSERT OR UPDATE ON provider_offers
    FOR EACH ROW EXECUTE FUNCTION niu_commercial_offer_personal_guard();

CREATE FUNCTION niu_offer_review_personal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE credential UUID;
BEGIN
    SELECT vendor_id INTO credential FROM provider_offers WHERE id = NEW.offer_id;
    PERFORM 1 FROM vendors WHERE id = credential FOR UPDATE;
    IF EXISTS (SELECT 1 FROM personal_vendor_ownership WHERE vendor_id = credential) THEN
        RAISE EXCEPTION 'personal credentials cannot receive commercial offer reviews' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER offer_review_personal_guard BEFORE INSERT ON provider_offer_qualification_reviews
    FOR EACH ROW EXECUTE FUNCTION niu_offer_review_personal_guard();

-- @niu-legacy-migration 0098_personal_vendor_conflict_errors.sql 2069
-- Preserve applied ownership migration; extend audit actions and safe conflict errors.
ALTER TABLE vendor_audit_events DROP CONSTRAINT vendor_audit_events_action_check;
ALTER TABLE vendor_audit_events ADD CONSTRAINT vendor_audit_events_action_check CHECK (action IN (
    'vendor_created', 'vendor_updated', 'vendor_seeded',
    'vendor_model_created', 'vendor_model_updated', 'vendor_model_seeded',
    'supplier_associated', 'personal_owner_assigned'
));

CREATE OR REPLACE FUNCTION niu_personal_vendor_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'personal credential ownership is immutable' USING ERRCODE = 'P0008';
    END IF;
    PERFORM 1 FROM vendors WHERE id = NEW.vendor_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM provider_offers WHERE vendor_id = NEW.vendor_id
               AND (active OR current_qualification_review IS NOT NULL)) THEN
        RAISE EXCEPTION 'commercial supply cannot become personal' USING ERRCODE = 'P0008';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION niu_commercial_offer_personal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.active OR NEW.current_qualification_review IS NOT NULL THEN
        PERFORM 1 FROM vendors WHERE id = NEW.vendor_id FOR UPDATE;
        IF EXISTS (SELECT 1 FROM personal_vendor_ownership WHERE vendor_id = NEW.vendor_id) THEN
            RAISE EXCEPTION 'personal credentials cannot supply commercial offers' USING ERRCODE = 'P0008';
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION niu_offer_review_personal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE credential UUID;
BEGIN
    SELECT vendor_id INTO credential FROM provider_offers WHERE id = NEW.offer_id;
    PERFORM 1 FROM vendors WHERE id = credential FOR UPDATE;
    IF EXISTS (SELECT 1 FROM personal_vendor_ownership WHERE vendor_id = credential) THEN
        RAISE EXCEPTION 'personal credentials cannot receive commercial offer reviews' USING ERRCODE = 'P0008';
    END IF;
    RETURN NEW;
END $$;

-- @niu-legacy-migration 0099_personal_attempt_route_binding.sql 2122
-- Durable personal-route evidence only. This does not waive prepaid admission.
CREATE TABLE personal_attempt_routes (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    vendor_id UUID NOT NULL REFERENCES personal_vendor_ownership(vendor_id),
    vendor_revision BIGINT NOT NULL,
    model_revision BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE FUNCTION validate_personal_attempt_route() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'personal attempt route is immutable' USING ERRCODE='P0008';
    END IF;
    -- Lock the credential before the model, matching model configuration writes.
    PERFORM id FROM vendors WHERE id=NEW.vendor_id FOR SHARE;
    PERFORM m.alias FROM vendor_models m JOIN attempts a ON a.resource_id=m.alias
        WHERE a.id=NEW.attempt_id FOR SHARE OF m;
    PERFORM id FROM attempts WHERE id=NEW.attempt_id FOR UPDATE;
    IF NOT EXISTS (
        SELECT 1 FROM attempts a
        JOIN vendor_models m ON m.alias=a.resource_id
        JOIN vendors v ON v.id=m.vendor_id
        JOIN personal_vendor_ownership o ON o.vendor_id=v.id
        WHERE a.id=NEW.attempt_id AND a.execution='not_sent'
            AND o.organization_id=a.organization_id AND v.id=NEW.vendor_id
            AND v.enabled AND m.enabled
            AND v.revision=NEW.vendor_revision AND m.revision=NEW.model_revision
    ) THEN
        RAISE EXCEPTION 'personal route ownership or revision changed' USING ERRCODE='P0008';
    END IF;
    IF EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=NEW.attempt_id)
        OR EXISTS (SELECT 1 FROM provider_attempt_offers WHERE attempt_id=NEW.attempt_id)
        OR EXISTS (SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id=NEW.attempt_id) THEN
        RAISE EXCEPTION 'personal route already has commercial accounting' USING ERRCODE='P0008';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_personal_attempt_route BEFORE INSERT OR UPDATE OR DELETE
    ON personal_attempt_routes FOR EACH ROW EXECUTE FUNCTION validate_personal_attempt_route();

-- @niu-legacy-migration 0100_personal_attempt_accounting_exclusion.sql 1056
-- Serialize commercial accounting bindings against personal-route assignment.
-- Personal upstream bills are paid by the credential owner, not Niu balances.
CREATE FUNCTION reject_personal_attempt_accounting() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM id FROM attempts WHERE id=NEW.attempt_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id=NEW.attempt_id) THEN
        RAISE EXCEPTION 'personal attempts cannot receive commercial accounting'
            USING ERRCODE='P0008';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER reject_personal_customer_tariff BEFORE INSERT ON customer_attempt_tariffs
    FOR EACH ROW EXECUTE FUNCTION reject_personal_attempt_accounting();
CREATE TRIGGER reject_personal_supplier_offer BEFORE INSERT ON provider_attempt_offers
    FOR EACH ROW EXECUTE FUNCTION reject_personal_attempt_accounting();
CREATE TRIGGER reject_personal_customer_balance BEFORE INSERT ON customer_attempt_balance_accounts
    FOR EACH ROW EXECUTE FUNCTION reject_personal_attempt_accounting();

-- @niu-legacy-migration 0101_personal_accounting_guard_order.sql 512
-- PostgreSQL runs same-event triggers in name order. Reject personal billing
-- before commercial qualification or reference validation reports its error.
ALTER TRIGGER reject_personal_customer_tariff ON customer_attempt_tariffs
    RENAME TO a_personal_customer_tariff;
ALTER TRIGGER reject_personal_supplier_offer ON provider_attempt_offers
    RENAME TO a_personal_supplier_offer;
ALTER TRIGGER reject_personal_customer_balance ON customer_attempt_balance_accounts
    RENAME TO a_personal_customer_balance;

-- @niu-legacy-migration 0102_personal_prepaid_dispatch.sql 3433
-- Owner-funded personal dispatch does not reserve Niu customer funds.
-- Defense in depth for every adapter, including batched unpriced admission.
CREATE OR REPLACE FUNCTION require_customer_balance_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    END IF;
    -- Funding/account activation takes an organization update lock. Admission
    -- holds a shared lock until commit so activation cannot race this check.
    PERFORM id FROM organizations WHERE id=NEW.organization_id FOR SHARE;
    IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id=NEW.id) THEN
        -- Recheck under locks at the dispatch boundary, not merely at resolution.
        PERFORM v.id FROM vendors v JOIN personal_attempt_routes b ON b.vendor_id=v.id
            WHERE b.attempt_id=NEW.id FOR SHARE OF v;
        PERFORM m.alias FROM vendor_models m WHERE m.alias=NEW.resource_id FOR SHARE;
        IF NOT EXISTS (
            SELECT 1 FROM personal_attempt_routes b
            JOIN personal_vendor_ownership o ON o.vendor_id=b.vendor_id
            JOIN vendors v ON v.id=b.vendor_id
            JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=NEW.resource_id
            JOIN api_keys k ON k.id=NEW.api_key_id
            JOIN inspected_guardrail_bindings g ON g.attempt_id=NEW.id AND g.key_id=k.id
            WHERE b.attempt_id=NEW.id AND o.organization_id=NEW.organization_id
                AND v.enabled AND m.enabled
                AND v.revision=b.vendor_revision AND m.revision=b.model_revision
                AND NEW.dispatch_provider=v.adapter
                AND k.organization_id=NEW.organization_id AND k.project_id=NEW.project_id
                AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp()
                AND ('*'=ANY(k.allowed_models) OR NEW.resource_id=ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION 'personal dispatch ownership, policy or route changed' USING ERRCODE='P0008';
        END IF;
        IF EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM provider_attempt_offers WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM account_assignments WHERE attempt_id=NEW.id) THEN
            RAISE EXCEPTION 'personal dispatch has incompatible accounting' USING ERRCODE='P0008';
        END IF;
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM customer_balance_accounts WHERE organization_id=NEW.organization_id)
        AND NOT EXISTS (SELECT 1 FROM customer_balance_reservations
            WHERE attempt_id=NEW.id AND organization_id=NEW.organization_id AND released_at IS NULL)
        AND NOT EXISTS (
            SELECT 1 FROM customer_attempt_tariffs t
            JOIN customer_tariff_revisions r ON r.id=t.revision_id
            JOIN customer_attempt_balance_accounts b ON b.attempt_id=t.attempt_id AND b.currency=r.currency
            WHERE t.attempt_id=NEW.id AND b.organization_id=NEW.organization_id
                AND r.prompt_rate=0 AND r.completion_rate=0
        ) THEN
        RAISE EXCEPTION 'prepaid dispatch requires a funded retail reservation' USING ERRCODE='P0009';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0103_personal_dispatch_conflict_code.sql 3364
-- Personal route conflicts are distinct from the existing P0008 budget error.
CREATE OR REPLACE FUNCTION require_customer_balance_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    END IF;
    -- Funding/account activation takes an organization update lock. Admission
    -- holds a shared lock until commit so activation cannot race this check.
    PERFORM id FROM organizations WHERE id=NEW.organization_id FOR SHARE;
    IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id=NEW.id) THEN
        -- Recheck under locks at the dispatch boundary, not merely at resolution.
        PERFORM v.id FROM vendors v JOIN personal_attempt_routes b ON b.vendor_id=v.id
            WHERE b.attempt_id=NEW.id FOR SHARE OF v;
        PERFORM m.alias FROM vendor_models m WHERE m.alias=NEW.resource_id FOR SHARE;
        IF NOT EXISTS (
            SELECT 1 FROM personal_attempt_routes b
            JOIN personal_vendor_ownership o ON o.vendor_id=b.vendor_id
            JOIN vendors v ON v.id=b.vendor_id
            JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=NEW.resource_id
            JOIN api_keys k ON k.id=NEW.api_key_id
            JOIN inspected_guardrail_bindings g ON g.attempt_id=NEW.id AND g.key_id=k.id
            WHERE b.attempt_id=NEW.id AND o.organization_id=NEW.organization_id
                AND v.enabled AND m.enabled
                AND v.revision=b.vendor_revision AND m.revision=b.model_revision
                AND NEW.dispatch_provider=v.adapter
                AND k.organization_id=NEW.organization_id AND k.project_id=NEW.project_id
                AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp()
                AND ('*'=ANY(k.allowed_models) OR NEW.resource_id=ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION 'personal dispatch ownership, policy or route changed' USING ERRCODE='P0011';
        END IF;
        IF EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM provider_attempt_offers WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM account_assignments WHERE attempt_id=NEW.id) THEN
            RAISE EXCEPTION 'personal dispatch has incompatible accounting' USING ERRCODE='P0011';
        END IF;
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM customer_balance_accounts WHERE organization_id=NEW.organization_id)
        AND NOT EXISTS (SELECT 1 FROM customer_balance_reservations
            WHERE attempt_id=NEW.id AND organization_id=NEW.organization_id AND released_at IS NULL)
        AND NOT EXISTS (
            SELECT 1 FROM customer_attempt_tariffs t
            JOIN customer_tariff_revisions r ON r.id=t.revision_id
            JOIN customer_attempt_balance_accounts b ON b.attempt_id=t.attempt_id AND b.currency=r.currency
            WHERE t.attempt_id=NEW.id AND b.organization_id=NEW.organization_id
                AND r.prompt_rate=0 AND r.completion_rate=0
        ) THEN
        RAISE EXCEPTION 'prepaid dispatch requires a funded retail reservation' USING ERRCODE='P0009';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0104_chat_session_archive.sql 202
ALTER TABLE chat_sessions ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX chat_sessions_archive_recent
ON chat_sessions (organization_id, project_id, owner, archived, updated_at DESC);

-- @niu-legacy-migration 0105_output_guardrail_observations.sql 1137
-- Observation is independent of enforcement and never labels delivery blocked.
CREATE TABLE output_guardrail_observations (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('clear','matched','indeterminate')),
    reason TEXT NOT NULL CHECK (reason IN ('inspected_text','pattern_match','unsupported_content','resource_limit','inspection_unavailable')),
    elapsed_ms BIGINT NOT NULL CHECK (elapsed_ms >= 0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id,project_id,attempt_id),
    FOREIGN KEY (organization_id,project_id,attempt_id) REFERENCES attempts(organization_id,project_id,id),
    CHECK ((outcome='clear' AND reason='inspected_text')
        OR (outcome='matched' AND reason='pattern_match')
        OR (outcome='indeterminate' AND reason IN ('unsupported_content','resource_limit','inspection_unavailable')))
);
CREATE TRIGGER immutable_output_guardrail_observation
BEFORE UPDATE OR DELETE ON output_guardrail_observations
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0106_input_detector_decisions.sql 4446
-- Metadata-only receipts; request text and detector response bodies are excluded.
CREATE TABLE input_detector_decisions (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    detector_name TEXT NOT NULL CHECK (length(detector_name) BETWEEN 1 AND 200),
    configuration_fingerprint TEXT NOT NULL CHECK (configuration_fingerprint ~ '^[a-f0-9]{64}$'),
    outcome TEXT NOT NULL CHECK (outcome IN ('clear','matched','indeterminate')),
    reason TEXT NOT NULL CHECK (reason IN ('detector_verdict','resource_limit','capacity_exhausted','credential_unavailable','endpoint_unavailable','transport_failure','service_failure','response_limit','invalid_response','timeout','configuration_unavailable','unsupported_content')),
    elapsed_ms BIGINT NOT NULL CHECK (elapsed_ms >= 0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
    CHECK ((outcome IN ('clear','matched') AND reason='detector_verdict') OR outcome='indeterminate')
);
CREATE INDEX input_detector_decisions_scope_time ON input_detector_decisions(organization_id,project_id,recorded_at DESC);
CREATE TRIGGER immutable_input_detector_decision BEFORE UPDATE OR DELETE ON input_detector_decisions
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
ALTER TABLE inspected_guardrail_bindings ADD COLUMN input_detector_decision_ids UUID[] NOT NULL DEFAULT '{}';
ALTER TABLE guardrail_preparation_denials DROP CONSTRAINT guardrail_preparation_denials_reason_check;
ALTER TABLE guardrail_preparation_denials ADD CONSTRAINT guardrail_preparation_denials_reason_check CHECK (
    reason IN ('model_denied','provider_denied','unsupported_policy','input_blocked','input_unsupported','input_resource_limit','input_unavailable','output_incompatible','detector_blocked','detector_unavailable','detector_unsupported')
);
CREATE FUNCTION niu_check_input_detector_bindings() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy JSONB; detector JSONB; binding inspected_guardrail_bindings%ROWTYPE;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    -- Existing dispatch guards acquire policy/key coordination locks first.
    SELECT * INTO binding FROM inspected_guardrail_bindings
      WHERE organization_id=NEW.organization_id AND project_id=NEW.project_id AND attempt_id=NEW.id;
    FOR policy IN
      SELECT r.policy FROM workspace_guardrail_heads h JOIN workspace_guardrail_revisions r USING(organization_id,project_id,revision)
        WHERE h.organization_id=NEW.organization_id AND h.project_id=NEW.project_id
      UNION ALL
      SELECT r.policy FROM key_guardrail_assignments a JOIN workspace_guardrail_revisions r
        ON r.organization_id=a.organization_id AND r.project_id=a.project_id AND r.revision=a.policy_revision
        WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id
    LOOP
      FOR detector IN SELECT value FROM jsonb_array_elements(COALESCE(policy->'input_detectors','[]'::jsonb)) LOOP
        IF detector->>'consent_to_external_processing' IS DISTINCT FROM 'true' OR NOT EXISTS (
          SELECT 1 FROM input_detector_decisions d WHERE d.id=ANY(binding.input_detector_decision_ids)
            AND d.organization_id=NEW.organization_id AND d.project_id=NEW.project_id AND d.key_id=NEW.api_key_id
            AND d.workspace_revision IS NOT DISTINCT FROM binding.workspace_revision
            AND d.key_policy_revision IS NOT DISTINCT FROM binding.key_policy_revision
            AND d.key_assignment_revision IS NOT DISTINCT FROM binding.key_assignment_revision
            AND d.detector_name=detector->>'detector'
            AND d.configuration_fingerprint=detector->>'configuration_fingerprint' AND d.outcome='clear'
        ) THEN
          RAISE EXCEPTION 'required detector inspection missing' USING ERRCODE='P0010', DETAIL=niu_guardrail_rejection_detail(NEW.organization_id,NEW.project_id,NEW.api_key_id,'input_binding_missing');
        END IF;
      END LOOP;
    END LOOP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER zz_input_detector_dispatch_guard BEFORE UPDATE OF execution ON attempts
FOR EACH ROW EXECUTE FUNCTION niu_check_input_detector_bindings();

-- @niu-legacy-migration 0107_member_password_credentials.sql 1285
-- Opt-in member credentials. Existing sessions and development login are unchanged.
CREATE TABLE member_password_credentials (
    operator_id UUID PRIMARY KEY REFERENCES admin_operators(id),
    email TEXT NOT NULL UNIQUE CHECK (
        email = lower(email) AND email = btrim(email)
        AND length(email) BETWEEN 3 AND 254
    ),
    password_hash TEXT NOT NULL CHECK (
        length(password_hash) BETWEEN 1 AND 256
        AND password_hash LIKE '$argon2id$v=19$%'
    ),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE operator_audit_events DROP CONSTRAINT operator_audit_events_action_check;
ALTER TABLE operator_audit_events ADD CONSTRAINT operator_audit_events_action_check
    CHECK (action IN ('operator_created', 'session_created', 'session_revoked',
        'operator_revoked', 'password_changed'));
ALTER TABLE operator_audit_events DROP CONSTRAINT operator_audit_events_check1;
ALTER TABLE operator_audit_events ADD CONSTRAINT operator_audit_events_check1 CHECK (
    (action IN ('session_created', 'session_revoked') AND target_session_id IS NOT NULL)
    OR (action IN ('operator_created', 'operator_revoked', 'password_changed')
        AND target_session_id IS NULL)
);

-- @niu-legacy-migration 0108_password_login_admission.sql 483
-- Shared admission counters contain no plaintext email, password or session.
CREATE TABLE password_login_admission (
    kind TEXT NOT NULL CHECK (kind IN ('global', 'identity')),
    bucket BYTEA NOT NULL CHECK (octet_length(bucket) = 32),
    window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    attempts INTEGER NOT NULL CHECK (attempts BETWEEN 1 AND 120),
    PRIMARY KEY (kind, bucket)
);
CREATE INDEX password_login_admission_expiry ON password_login_admission(window_start);

-- @niu-legacy-migration 0109_customer_media_pricing.sql 751
-- Customer selling-price snapshots only. Supplier purchase terms never belong here.
CREATE TABLE customer_media_attempt_pricing (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    snapshot JSONB NOT NULL CHECK (
        jsonb_typeof(snapshot) = 'object'
        AND snapshot->>'version' = '1'
        AND octet_length(snapshot::text) <= 131072
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES attempts(organization_id, project_id, id)
);
CREATE TRIGGER immutable_customer_media_pricing
    BEFORE UPDATE OR DELETE ON customer_media_attempt_pricing
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0110_customer_media_usage.sql 1021
-- Immutable reported media usage, separate from text-token completion and debits.
ALTER TABLE customer_media_attempt_pricing
    ADD UNIQUE (organization_id, project_id, attempt_id);
CREATE TABLE customer_media_usage_observations (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    receipt_sha256 BYTEA NOT NULL CHECK (octet_length(receipt_sha256)=32),
    source TEXT NOT NULL CHECK (source IN ('query','callback')),
    meter TEXT NOT NULL CHECK (length(meter) BETWEEN 1 AND 256),
    quantity JSONB NOT NULL CHECK (jsonb_typeof(quantity)='object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (attempt_id,receipt_sha256),
    FOREIGN KEY (organization_id,project_id,attempt_id)
        REFERENCES customer_media_attempt_pricing(organization_id,project_id,attempt_id)
);
CREATE TRIGGER immutable_customer_media_usage
    BEFORE UPDATE OR DELETE ON customer_media_usage_observations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0111_customer_media_liability.sql 1893
CREATE TABLE customer_media_liability_bounds (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    bound JSONB NOT NULL CHECK (jsonb_typeof(bound)='object' AND octet_length(bound::text)<=4096),
    maximum_nanos BIGINT NOT NULL CHECK (maximum_nanos>0),
    FOREIGN KEY (organization_id,project_id,attempt_id)
        REFERENCES customer_media_attempt_pricing(organization_id,project_id,attempt_id),
    FOREIGN KEY (attempt_id) REFERENCES customer_balance_reservations(attempt_id)
);
CREATE TRIGGER immutable_customer_media_liability BEFORE UPDATE OR DELETE ON customer_media_liability_bounds
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- Owner-funded personal requests cannot acquire customer media liabilities.
CREATE FUNCTION separate_personal_media_accounting() RETURNS TRIGGER AS $$
BEGIN
    PERFORM id FROM attempts WHERE id=NEW.attempt_id FOR UPDATE;
    IF TG_TABLE_NAME='personal_attempt_routes' THEN
        IF EXISTS (SELECT 1 FROM customer_media_attempt_pricing WHERE attempt_id=NEW.attempt_id) THEN
            RAISE EXCEPTION 'personal route conflicts with customer media pricing' USING ERRCODE='23514';
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id=NEW.attempt_id) THEN
            RAISE EXCEPTION 'customer media pricing conflicts with personal route' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER separate_personal_media_pricing BEFORE INSERT ON customer_media_attempt_pricing
    FOR EACH ROW EXECUTE FUNCTION separate_personal_media_accounting();
-- Run after the existing validator has locked credential, model and attempt.
CREATE TRIGGER zz_separate_media_personal_route BEFORE INSERT ON personal_attempt_routes
    FOR EACH ROW EXECUTE FUNCTION separate_personal_media_accounting();

-- @niu-legacy-migration 0112_customer_media_meter_integrity.sql 1383
-- Strengthen previously applied customer media snapshots without rewriting history.
ALTER TABLE customer_media_attempt_pricing
    ADD CONSTRAINT customer_media_snapshot_version_present CHECK (snapshot ? 'version');

-- Serializes both billing modes on the same attempt. An operation cannot acquire
-- independent text and media charges, including concurrent competing inserts.
CREATE FUNCTION enforce_customer_meter_exclusivity() RETURNS TRIGGER AS $$
BEGIN
    PERFORM id FROM attempts WHERE id = NEW.attempt_id FOR UPDATE;
    IF TG_TABLE_NAME = 'customer_media_attempt_pricing' THEN
        IF EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=NEW.attempt_id) THEN
            RAISE EXCEPTION 'customer text tariff already bound' USING ERRCODE='23514';
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM customer_media_attempt_pricing WHERE attempt_id=NEW.attempt_id) THEN
            RAISE EXCEPTION 'customer media tariff already bound' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER exclusive_customer_media_meter BEFORE INSERT ON customer_media_attempt_pricing
    FOR EACH ROW EXECUTE FUNCTION enforce_customer_meter_exclusivity();
CREATE TRIGGER exclusive_customer_text_meter BEFORE INSERT ON customer_attempt_tariffs
    FOR EACH ROW EXECUTE FUNCTION enforce_customer_meter_exclusivity();

-- @niu-legacy-migration 0113_customer_media_settlement.sql 3736
CREATE TABLE customer_media_charges (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos>=0),
    bound_exceeded BOOLEAN NOT NULL,
    explanation JSONB NOT NULL CHECK (jsonb_typeof(explanation)='object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id,project_id,attempt_id)
        REFERENCES customer_media_attempt_pricing(organization_id,project_id,attempt_id),
    FOREIGN KEY (attempt_id) REFERENCES customer_media_liability_bounds(attempt_id),
    UNIQUE (organization_id,project_id,attempt_id)
);
CREATE TRIGGER immutable_customer_media_charge BEFORE UPDATE OR DELETE ON customer_media_charges
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- Preserve the shared ledger's charge kind and tenant scope; validate the exact
-- source charge instead of requiring every model to have text-token billing.
DO $$
DECLARE old_constraint TEXT;
BEGIN
    SELECT conname INTO STRICT old_constraint FROM pg_constraint
        WHERE conrelid='customer_balance_entries'::regclass
        AND confrelid='customer_charges'::regclass AND contype='f';
    EXECUTE format('ALTER TABLE customer_balance_entries DROP CONSTRAINT %I',old_constraint);
END;
$$;
ALTER TABLE customer_balance_entries ADD FOREIGN KEY (organization_id,project_id,attempt_id)
    REFERENCES attempts(organization_id,project_id,id);
CREATE FUNCTION validate_customer_charge_ledger_source() RETURNS TRIGGER AS $$
DECLARE sources BIGINT;
BEGIN
    IF NEW.kind <> 'charge' THEN RETURN NEW; END IF;
    SELECT count(*) INTO sources FROM (
        SELECT organization_id,project_id,attempt_id,currency,amount_nanos FROM customer_charges
        UNION ALL
        SELECT organization_id,project_id,attempt_id,currency,amount_nanos FROM customer_media_charges
    ) c WHERE c.organization_id=NEW.organization_id AND c.project_id=NEW.project_id
        AND c.attempt_id=NEW.attempt_id AND c.currency=NEW.currency
        AND c.amount_nanos>0 AND NEW.amount_nanos=-c.amount_nanos;
    IF sources <> 1 THEN RAISE EXCEPTION 'customer debit requires one exact charge' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER validate_customer_charge_ledger_source BEFORE INSERT ON customer_balance_entries
    FOR EACH ROW EXECUTE FUNCTION validate_customer_charge_ledger_source();

CREATE OR REPLACE FUNCTION protect_customer_balance_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'customer reservations cannot be deleted'; END IF;
    IF ROW(NEW.attempt_id,NEW.organization_id,NEW.account_id,NEW.currency,NEW.amount_nanos,NEW.created_at)
        IS DISTINCT FROM ROW(OLD.attempt_id,OLD.organization_id,OLD.account_id,OLD.currency,OLD.amount_nanos,OLD.created_at)
        OR OLD.released_at IS NOT NULL OR NEW.released_at IS NULL THEN
        RAISE EXCEPTION 'only a terminal reservation release is permitted';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM attempts a WHERE a.id=OLD.attempt_id
        AND (a.execution IN ('not_sent','confirmed_not_executed')
            OR EXISTS (SELECT 1 FROM customer_charges c WHERE c.attempt_id=a.id)
            OR EXISTS (SELECT 1 FROM customer_media_charges c WHERE c.attempt_id=a.id))) THEN
        RAISE EXCEPTION 'uncertain customer liability cannot be released';
    END IF;
    RETURN NEW;
END;
$$;

ALTER TABLE customer_balance_reservations ADD UNIQUE (attempt_id,amount_nanos);
ALTER TABLE customer_media_liability_bounds ADD FOREIGN KEY (attempt_id,maximum_nanos)
    REFERENCES customer_balance_reservations(attempt_id,amount_nanos);

-- @niu-legacy-migration 0114_customer_media_credit_enforcement.sql 2254
CREATE FUNCTION enforce_customer_media_debit_capacity() RETURNS TRIGGER AS $$
DECLARE funded BOOLEAN;
BEGIN
    IF NEW.kind<>'charge' OR NOT EXISTS (SELECT 1 FROM customer_media_charges WHERE attempt_id=NEW.attempt_id) THEN RETURN NEW; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR UPDATE;
    SELECT COALESCE((SELECT SUM(amount_nanos) FROM customer_balance_entries WHERE account_id=a.id),0)
        +a.credit_limit_nanos-COALESCE((SELECT SUM(amount_nanos) FROM customer_balance_reservations
            WHERE account_id=a.id AND released_at IS NULL AND attempt_id<>NEW.attempt_id),0)
        >=-NEW.amount_nanos INTO funded FROM customer_balance_accounts a WHERE a.id=NEW.account_id;
    IF funded IS DISTINCT FROM true THEN RAISE EXCEPTION 'media debit exceeds available approved capacity' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER enforce_customer_media_debit_capacity BEFORE INSERT ON customer_balance_entries
    FOR EACH ROW EXECUTE FUNCTION enforce_customer_media_debit_capacity();

CREATE OR REPLACE FUNCTION protect_customer_balance_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'customer reservations cannot be deleted'; END IF;
    IF ROW(NEW.attempt_id,NEW.organization_id,NEW.account_id,NEW.currency,NEW.amount_nanos,NEW.created_at)
        IS DISTINCT FROM ROW(OLD.attempt_id,OLD.organization_id,OLD.account_id,OLD.currency,OLD.amount_nanos,OLD.created_at)
        OR OLD.released_at IS NOT NULL OR NEW.released_at IS NULL THEN
        RAISE EXCEPTION 'only a terminal reservation release is permitted';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM attempts a WHERE a.id=OLD.attempt_id
        AND (a.execution IN ('not_sent','confirmed_not_executed')
            OR EXISTS (SELECT 1 FROM customer_charges c WHERE c.attempt_id=a.id)
            OR EXISTS (SELECT 1 FROM customer_media_charges c WHERE c.attempt_id=a.id
                AND (c.amount_nanos=0 OR EXISTS (SELECT 1 FROM customer_balance_entries e
                    WHERE e.attempt_id=c.attempt_id AND e.kind='charge'))))) THEN
        RAISE EXCEPTION 'unposted customer liability cannot be released';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0115_media_job_observations.sql 1368
-- Internal upstream identifiers stay outside customer response serialization.
CREATE TABLE media_jobs (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    upstream_job_id TEXT NOT NULL CHECK (octet_length(upstream_job_id) BETWEEN 1 AND 512),
    schema_revision TEXT NOT NULL CHECK (octet_length(schema_revision) BETWEEN 1 AND 256),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, project_id, attempt_id),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES attempts(organization_id, project_id, id)
);
CREATE TRIGGER immutable_media_job_binding BEFORE UPDATE OR DELETE ON media_jobs
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE media_job_observations (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','unknown')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (attempt_id, status),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES media_jobs(organization_id, project_id, attempt_id)
);
CREATE TRIGGER immutable_media_job_observation BEFORE UPDATE OR DELETE ON media_job_observations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0116_media_recovery_routes.sql 1423
-- Immutable pre-dispatch recovery identity; never contains plaintext credentials.
CREATE TABLE media_recovery_routes (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    vendor_revision BIGINT NOT NULL CHECK (vendor_revision > 0),
    model_revision BIGINT NOT NULL CHECK (model_revision > 0),
    upstream_model TEXT NOT NULL,
    schema_revision TEXT NOT NULL,
    adapter TEXT NOT NULL,
    api_base TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, project_id, attempt_id),
    UNIQUE (attempt_id, vendor_id),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES attempts(organization_id, project_id, id)
);
CREATE TRIGGER immutable_media_recovery_route BEFORE UPDATE OR DELETE ON media_recovery_routes
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE media_upstream_job_claims (
    attempt_id UUID PRIMARY KEY REFERENCES media_jobs(attempt_id),
    vendor_id UUID NOT NULL,
    upstream_job_id TEXT NOT NULL,
    UNIQUE (vendor_id, upstream_job_id),
    FOREIGN KEY (attempt_id, vendor_id) REFERENCES media_recovery_routes(attempt_id, vendor_id)
);
CREATE TRIGGER immutable_media_upstream_job_claim BEFORE UPDATE OR DELETE ON media_upstream_job_claims
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0117_media_job_binding_integrity.sql 1319
-- Existing pre-route jobs remain historical evidence; new jobs require a pin.
ALTER TABLE media_jobs ADD UNIQUE (attempt_id, upstream_job_id);
ALTER TABLE media_upstream_job_claims ADD FOREIGN KEY (attempt_id, upstream_job_id)
    REFERENCES media_jobs(attempt_id, upstream_job_id);
CREATE FUNCTION require_media_job_recovery_route() RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM media_recovery_routes r
        WHERE r.organization_id=NEW.organization_id AND r.project_id=NEW.project_id
        AND r.attempt_id=NEW.attempt_id AND r.schema_revision=NEW.schema_revision) THEN
        RAISE EXCEPTION 'media recovery route required' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER require_media_job_recovery_route BEFORE INSERT ON media_jobs
    FOR EACH ROW EXECUTE FUNCTION require_media_job_recovery_route();
CREATE FUNCTION claim_media_upstream_job() RETURNS trigger AS $$
BEGIN
    INSERT INTO media_upstream_job_claims(attempt_id,vendor_id,upstream_job_id)
    SELECT NEW.attempt_id,r.vendor_id,NEW.upstream_job_id FROM media_recovery_routes r
    WHERE r.attempt_id=NEW.attempt_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER claim_media_upstream_job AFTER INSERT ON media_jobs
    FOR EACH ROW EXECUTE FUNCTION claim_media_upstream_job();

-- @niu-legacy-migration 0118_media_completion_evidence.sql 1177
-- Serialize observations with completion and settlement on the attempt lock.
CREATE FUNCTION lock_media_status_attempt() RETURNS trigger AS $$
BEGIN
    PERFORM 1 FROM attempts WHERE organization_id=NEW.organization_id
        AND project_id=NEW.project_id AND id=NEW.attempt_id FOR UPDATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER lock_media_status_attempt BEFORE INSERT ON media_job_observations
    FOR EACH ROW EXECUTE FUNCTION lock_media_status_attempt();
CREATE FUNCTION require_media_completion_evidence() RETURNS trigger AS $$
BEGIN
    IF NEW.execution='confirmed_completed'
       AND EXISTS(SELECT 1 FROM media_jobs WHERE attempt_id=NEW.id)
       AND (NOT EXISTS(SELECT 1 FROM media_job_observations WHERE attempt_id=NEW.id AND status='succeeded')
            OR EXISTS(SELECT 1 FROM media_job_observations WHERE attempt_id=NEW.id AND status='failed')) THEN
        RAISE EXCEPTION 'media completion unresolved' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER require_media_completion_evidence BEFORE UPDATE OF execution ON attempts
    FOR EACH ROW EXECUTE FUNCTION require_media_completion_evidence();

-- @niu-legacy-migration 0119_member_profiles.sql 472
-- Member-owned profile data; installation credentials are not a person.
CREATE TABLE member_profiles (
    operator_id UUID PRIMARY KEY REFERENCES admin_operators(id),
    avatar_data_url TEXT CHECK (avatar_data_url IS NULL OR (
        avatar_data_url LIKE 'data:image/png;base64,%'
        AND octet_length(avatar_data_url) <= 175000
    )),
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

-- @niu-legacy-migration 0120_media_submission_uncertainty.sql 1185
-- A lost create response must survive restart even without an upstream job ID.
CREATE TABLE media_submission_uncertainty (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES media_recovery_routes(organization_id, project_id, attempt_id)
);
CREATE TRIGGER immutable_media_submission_uncertainty BEFORE UPDATE OR DELETE
    ON media_submission_uncertainty FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE FUNCTION require_dispatched_media_uncertainty() RETURNS trigger AS $$
BEGIN
    PERFORM 1 FROM attempts WHERE id=NEW.attempt_id
        AND organization_id=NEW.organization_id AND project_id=NEW.project_id
        AND dispatched_at IS NOT NULL FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'dispatched media attempt required' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER require_dispatched_media_uncertainty BEFORE INSERT
    ON media_submission_uncertainty FOR EACH ROW EXECUTE FUNCTION require_dispatched_media_uncertainty();

-- @niu-legacy-migration 0121_media_dispatch_route_recheck.sql 1806
-- Validate the pre-dispatch pin again at the transition that permits egress.
-- Existing jobs retain historical identity; route changes never authorize replay.
CREATE FUNCTION require_current_media_dispatch_route() RETURNS trigger AS $$
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' THEN
        IF OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    END IF;
    IF NOT EXISTS(SELECT 1 FROM media_recovery_routes WHERE attempt_id=NEW.id) THEN
        RETURN NEW;
    END IF;
    PERFORM v.id FROM vendors v JOIN media_recovery_routes r ON r.vendor_id=v.id
        WHERE r.attempt_id=NEW.id FOR SHARE OF v;
    PERFORM m.alias FROM vendor_models m WHERE m.alias=NEW.resource_id FOR SHARE;
    IF NOT EXISTS (
        SELECT 1 FROM media_recovery_routes r
        JOIN vendors v ON v.id=r.vendor_id
        JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=NEW.resource_id
        WHERE r.attempt_id=NEW.id AND r.organization_id=NEW.organization_id
          AND r.project_id=NEW.project_id AND v.enabled AND m.enabled
          AND v.revision=r.vendor_revision AND m.revision=r.model_revision
          AND v.adapter=r.adapter AND v.api_base=r.api_base
          AND m.upstream_model=r.upstream_model
          AND m.capabilities->'video_schema'->>'revision'=r.schema_revision
          AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership o
              WHERE o.vendor_id=v.id AND o.organization_id<>NEW.organization_id)
    ) THEN
        RAISE EXCEPTION 'media dispatch route changed' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER require_current_media_dispatch_route
    BEFORE INSERT OR UPDATE OF execution ON attempts
    FOR EACH ROW EXECUTE FUNCTION require_current_media_dispatch_route();

-- @niu-legacy-migration 0122_media_query_evidence.sql 1197
-- Content-free query receipts, independent of customer billing mode.
CREATE TABLE media_query_evidence (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    receipt_sha256 BYTEA NOT NULL CHECK (octet_length(receipt_sha256)=32),
    metadata JSONB NOT NULL CHECK (jsonb_typeof(metadata)='object' AND octet_length(metadata::text)<=8192),
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (attempt_id,receipt_sha256),
    FOREIGN KEY (organization_id,project_id,attempt_id)
        REFERENCES media_jobs(organization_id,project_id,attempt_id),
    CHECK (metadata ?& ARRAY['version','source','protocol_revision','meter','status','quantity','provider_times']),
    CHECK (metadata - ARRAY['version','source','protocol_revision','meter','status','quantity','provider_times']='{}'::jsonb),
    CHECK (metadata->>'version'='1' AND metadata->>'source'='query')
);
CREATE TRIGGER immutable_media_query_evidence BEFORE UPDATE OR DELETE ON media_query_evidence
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE INDEX media_query_evidence_scoped ON media_query_evidence(organization_id,project_id,attempt_id,observed_at);

-- @niu-legacy-migration 0123_media_transport_timings.sql 1055
CREATE TABLE media_transport_timings (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('submission','query')),
    started_unix_ms BIGINT NOT NULL CHECK (started_unix_ms BETWEEN 0 AND 9007199254740991),
    elapsed_ms BIGINT NOT NULL CHECK (elapsed_ms BETWEEN 0 AND 120000),
    outcome TEXT NOT NULL CHECK (outcome IN ('received','unavailable')),
    FOREIGN KEY (organization_id,project_id,attempt_id)
        REFERENCES media_recovery_routes(organization_id,project_id,attempt_id)
);
CREATE TRIGGER immutable_media_transport_timing BEFORE UPDATE OR DELETE ON media_transport_timings
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER require_dispatched_media_timing BEFORE INSERT ON media_transport_timings
    FOR EACH ROW EXECUTE FUNCTION require_dispatched_media_uncertainty();
CREATE INDEX media_transport_timings_scoped ON media_transport_timings(organization_id,project_id,attempt_id,started_unix_ms,id);

-- @niu-legacy-migration 0124_media_query_schedule.sql 573
-- Operational scheduling, separate from immutable execution/accounting evidence.
CREATE TABLE media_query_schedule (
    attempt_id UUID PRIMARY KEY REFERENCES media_jobs(attempt_id),
    next_poll_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lease_owner UUID,
    lease_until TIMESTAMPTZ,
    failures INTEGER NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 16),
    stopped BOOLEAN NOT NULL DEFAULT false,
    CHECK ((lease_owner IS NULL)=(lease_until IS NULL))
);
CREATE INDEX media_query_schedule_due ON media_query_schedule(next_poll_at,attempt_id) WHERE NOT stopped;

-- @niu-legacy-migration 0125_customer_media_rate_cards.sql 1199
-- Customer selling schedules only; procurement terms have separate ownership.
CREATE TABLE customer_media_rate_cards (
    organization_id UUID NOT NULL REFERENCES organizations(id),
    revision TEXT NOT NULL CHECK (length(revision) BETWEEN 1 AND 256),
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    model_alias TEXT NOT NULL,
    channel TEXT NOT NULL,
    resolution TEXT NOT NULL,
    reference_video BOOLEAN NOT NULL,
    effective_from BIGINT NOT NULL,
    effective_until BIGINT,
    document JSONB NOT NULL CHECK (
        jsonb_typeof(document)='object' AND octet_length(document::text)<=131072
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id,revision),
    CHECK (effective_until IS NULL OR effective_until>effective_from)
);
CREATE INDEX customer_media_rate_selection ON customer_media_rate_cards
    (organization_id,model_alias,channel,resolution,reference_video,effective_from);
CREATE INDEX customer_media_rate_vendor ON customer_media_rate_cards(vendor_id);
CREATE TRIGGER immutable_customer_media_rate_cards
    BEFORE UPDATE OR DELETE ON customer_media_rate_cards
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0126_customer_media_rate_retirements.sql 1341
-- End eligibility without rewriting a published selling card or pinned job price.
CREATE TABLE customer_media_rate_retirements (
    organization_id UUID NOT NULL,
    revision TEXT NOT NULL,
    effective_until BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id,revision),
    FOREIGN KEY (organization_id,revision)
        REFERENCES customer_media_rate_cards(organization_id,revision)
);
CREATE FUNCTION validate_customer_media_rate_retirement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE starts BIGINT; ends BIGINT;
BEGIN
    SELECT effective_from,effective_until INTO starts,ends
    FROM customer_media_rate_cards
    WHERE organization_id=NEW.organization_id AND revision=NEW.revision;
    IF NOT FOUND OR NEW.effective_until<starts
        OR (ends IS NOT NULL AND NEW.effective_until>ends) THEN
        RAISE EXCEPTION 'invalid media rate retirement' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER valid_customer_media_rate_retirement
    BEFORE INSERT ON customer_media_rate_retirements
    FOR EACH ROW EXECUTE FUNCTION validate_customer_media_rate_retirement();
CREATE TRIGGER immutable_customer_media_rate_retirements
    BEFORE UPDATE OR DELETE ON customer_media_rate_retirements
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0127_supplier_media_pricing.sql 4095
-- Confidential purchase schedules and attempt snapshots, separate from customer prices.
CREATE TABLE supplier_media_rate_cards (
    provider_id UUID NOT NULL REFERENCES provider_businesses(id),
    revision TEXT NOT NULL CHECK (length(revision) BETWEEN 1 AND 256),
    offer_revision UUID NOT NULL REFERENCES provider_offer_revisions(id),
    model_alias TEXT NOT NULL,
    channel TEXT NOT NULL,
    resolution TEXT NOT NULL,
    reference_video BOOLEAN NOT NULL,
    effective_from BIGINT NOT NULL,
    effective_until BIGINT,
    document JSONB NOT NULL CHECK (jsonb_typeof(document)='object' AND octet_length(document::text)<=131072),
    PRIMARY KEY(provider_id,revision),
    CHECK(effective_until IS NULL OR effective_until>effective_from)
);
CREATE INDEX supplier_media_rate_selection ON supplier_media_rate_cards
    (provider_id,offer_revision,model_alias,channel,resolution,reference_video,effective_from);
CREATE TABLE supplier_media_attempt_pricing (
    attempt_id UUID PRIMARY KEY REFERENCES provider_attempt_offers(attempt_id),
    provider_id UUID NOT NULL,
    rate_revision TEXT NOT NULL,
    snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot)='object' AND snapshot->>'version'='1' AND snapshot ? 'version' AND octet_length(snapshot::text)<=131072),
    FOREIGN KEY(provider_id,rate_revision) REFERENCES supplier_media_rate_cards(provider_id,revision)
);
CREATE TRIGGER immutable_supplier_media_cards BEFORE UPDATE OR DELETE ON supplier_media_rate_cards
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_supplier_media_pricing BEFORE UPDATE OR DELETE ON supplier_media_attempt_pricing
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- Use the existing Supplier liability/settlement ledger without inventing text tokens.
ALTER TABLE provider_earnings ALTER COLUMN prompt_tokens DROP NOT NULL;
ALTER TABLE provider_earnings ALTER COLUMN completion_tokens DROP NOT NULL;
ALTER TABLE provider_earnings ADD COLUMN billing_meter TEXT NOT NULL DEFAULT 'text_tokens';
ALTER TABLE provider_earnings ADD COLUMN meter_quantity JSONB;
ALTER TABLE provider_earnings ADD COLUMN media_explanation JSONB;
ALTER TABLE provider_earnings ADD CONSTRAINT supplier_meter_shape CHECK (
    (billing_meter='text_tokens' AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL AND meter_quantity IS NULL AND media_explanation IS NULL)
    OR (billing_meter<>'text_tokens' AND length(billing_meter) BETWEEN 1 AND 100 AND prompt_tokens IS NULL AND completion_tokens IS NULL
        AND meter_quantity IS NOT NULL AND jsonb_typeof(meter_quantity)='object'
        AND media_explanation IS NOT NULL AND jsonb_typeof(media_explanation)='object')
);
CREATE FUNCTION enforce_supplier_media_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE supplier UUID; execution_state TEXT;
BEGIN
    SELECT b.provider_id,a.execution INTO supplier,execution_state
    FROM attempts a JOIN provider_attempt_offers b ON b.attempt_id=a.id
    WHERE a.id=NEW.attempt_id FOR UPDATE OF a;
    IF supplier IS NULL OR supplier<>NEW.provider_id THEN
        RAISE EXCEPTION 'supplier binding mismatch' USING ERRCODE='23514';
    END IF;
    IF TG_TABLE_NAME='supplier_media_attempt_pricing' THEN
        IF execution_state<>'not_sent' OR EXISTS(SELECT 1 FROM provider_earnings WHERE attempt_id=NEW.attempt_id)
            OR EXISTS(SELECT 1 FROM personal_attempt_routes WHERE attempt_id=NEW.attempt_id) THEN
            RAISE EXCEPTION 'supplier price must precede execution' USING ERRCODE='23514';
        END IF;
    ELSIF (NEW.billing_meter='text_tokens')=EXISTS(SELECT 1 FROM supplier_media_attempt_pricing WHERE attempt_id=NEW.attempt_id) THEN
        RAISE EXCEPTION 'supplier meter mismatch' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER supplier_media_binding BEFORE INSERT ON supplier_media_attempt_pricing
    FOR EACH ROW EXECUTE FUNCTION enforce_supplier_media_binding();
CREATE TRIGGER supplier_earning_meter BEFORE INSERT ON provider_earnings
    FOR EACH ROW EXECUTE FUNCTION enforce_supplier_media_binding();

-- @niu-legacy-migration 0128_supplier_media_rate_retirements.sql 1426
-- Old publication times were not recorded; preserve them as unknown.
ALTER TABLE supplier_media_rate_cards ADD COLUMN created_at TIMESTAMPTZ;
ALTER TABLE supplier_media_rate_cards ALTER COLUMN created_at SET DEFAULT now();
CREATE TABLE supplier_media_rate_retirements (
    provider_id UUID NOT NULL,
    revision TEXT NOT NULL,
    effective_until BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(provider_id,revision),
    FOREIGN KEY(provider_id,revision) REFERENCES supplier_media_rate_cards(provider_id,revision)
);
CREATE FUNCTION validate_supplier_media_rate_retirement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE starts BIGINT; ends BIGINT;
BEGIN
    SELECT effective_from,effective_until INTO starts,ends FROM supplier_media_rate_cards
    WHERE provider_id=NEW.provider_id AND revision=NEW.revision;
    IF NOT FOUND OR NEW.effective_until<starts OR (ends IS NOT NULL AND NEW.effective_until>ends) THEN
        RAISE EXCEPTION 'invalid supplier media rate retirement' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER valid_supplier_media_retirement BEFORE INSERT ON supplier_media_rate_retirements
    FOR EACH ROW EXECUTE FUNCTION validate_supplier_media_rate_retirement();
CREATE TRIGGER immutable_supplier_media_retirement BEFORE UPDATE OR DELETE ON supplier_media_rate_retirements
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0129_member_preferences.sql 279
CREATE TABLE member_preferences (
    operator_id uuid PRIMARY KEY REFERENCES admin_operators(id) ON DELETE CASCADE,
    color_mode text NOT NULL DEFAULT 'system' CHECK (color_mode IN ('system', 'light', 'dark')),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

-- @niu-legacy-migration 0130_supplier_media_offer_revisions.sql 4457
-- Media offer identity is separate from specification-selected purchase prices.
-- Existing immutable text revisions retain their rates and behavior.
ALTER TABLE provider_offer_revisions
    ADD COLUMN rate_kind TEXT NOT NULL DEFAULT 'text' CHECK (rate_kind IN ('text','media')),
    ADD COLUMN vendor_id UUID REFERENCES vendors(id),
    ADD COLUMN vendor_revision BIGINT,
    ADD COLUMN model_revision BIGINT,
    ADD COLUMN schema_revision TEXT,
    ADD COLUMN replaces_revision UUID REFERENCES provider_offer_revisions(id),
    ALTER COLUMN currency DROP NOT NULL,
    ALTER COLUMN prompt_rate DROP NOT NULL,
    ALTER COLUMN completion_rate DROP NOT NULL;
ALTER TABLE provider_offer_revisions ADD CONSTRAINT provider_offer_revision_meter_shape CHECK (
    (rate_kind='text' AND currency IS NOT NULL AND prompt_rate IS NOT NULL AND completion_rate IS NOT NULL
        AND vendor_id IS NULL AND vendor_revision IS NULL AND model_revision IS NULL AND schema_revision IS NULL AND replaces_revision IS NULL)
    OR
    (rate_kind='media' AND currency IS NULL AND prompt_rate IS NULL AND completion_rate IS NULL
        AND vendor_id IS NOT NULL AND vendor_revision > 0 AND model_revision > 0 AND schema_revision IS NOT NULL
        AND vendor_revision IS NOT NULL AND model_revision IS NOT NULL
        AND octet_length(schema_revision) BETWEEN 1 AND 256 AND schema_revision=btrim(schema_revision)
        AND schema_revision !~ '[[:cntrl:]]')
);

CREATE FUNCTION niu_media_offer_binding_current(p_provider UUID, p_offer UUID, p_revision UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM provider_offers o
        JOIN provider_offer_revisions r ON r.offer_id=o.id AND r.id=p_revision
        JOIN vendors v ON v.id=o.vendor_id
        JOIN vendor_models m ON m.alias=o.model_alias AND m.vendor_id=v.id
        WHERE o.provider_id=p_provider AND o.id=p_offer
          AND (r.rate_kind='text' OR (
              r.vendor_id=v.id AND r.vendor_revision=v.revision AND r.model_revision=m.revision
              AND r.schema_revision=m.capabilities->'video_schema'->>'revision'
              AND m.capabilities->'video_schema'->>'model_alias'=m.alias
              AND m.capabilities->'video_schema'->>'upstream_model'=m.upstream_model
              AND EXISTS (SELECT 1 FROM vendor_supplier_ownership s WHERE s.vendor_id=v.id AND s.provider_id=p_provider)
              AND NOT EXISTS (SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=v.id)
          ))
    )
$$;

CREATE OR REPLACE FUNCTION niu_offer_qualification_current(p_provider UUID, p_offer UUID, p_revision UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT niu_supplier_qualification_current(p_provider)
       AND niu_media_offer_binding_current(p_provider,p_offer,p_revision)
       AND EXISTS (
        SELECT 1 FROM provider_offers o
        JOIN provider_offer_qualification_reviews q ON q.provider_id=o.provider_id
            AND q.offer_id=o.id AND q.id=o.current_qualification_review
        WHERE o.provider_id=p_provider AND o.id=p_offer AND o.current_revision=p_revision
          AND q.rate_revision=p_revision AND q.revoked_at IS NULL AND q.valid_until>now()
          AND NOT EXISTS (SELECT 1 FROM provider_qualification_revocations r WHERE r.offer_review_id=q.id)
       )
$$;

-- A media-only offer cannot admit text/embedding traffic, including a route race.
CREATE FUNCTION niu_guard_media_offer_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.execution='not_sent' AND NEW.execution='may_have_executed'
       AND EXISTS (SELECT 1 FROM provider_attempt_offers b
           JOIN provider_offer_revisions r ON r.id=b.revision_id
           WHERE b.attempt_id=NEW.id AND r.rate_kind='media')
       AND (NOT EXISTS (SELECT 1 FROM supplier_media_attempt_pricing p WHERE p.attempt_id=NEW.id)
            OR NOT EXISTS (SELECT 1 FROM customer_media_attempt_pricing p WHERE p.attempt_id=NEW.id)
            OR NOT EXISTS (SELECT 1 FROM customer_media_liability_bounds b WHERE b.attempt_id=NEW.id)
            OR NOT EXISTS (SELECT 1 FROM media_recovery_routes r WHERE r.attempt_id=NEW.id)) THEN
        RAISE EXCEPTION 'media offer requires pinned media pricing, liability and route'
            USING ERRCODE='P0007';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER media_offer_requires_media_dispatch
BEFORE UPDATE OF execution ON attempts FOR EACH ROW EXECUTE FUNCTION niu_guard_media_offer_dispatch();

-- @niu-legacy-migration 0131_media_offer_text_compatibility.sql 1212
-- Media configuration pinning must not change legacy text requalification.
CREATE OR REPLACE FUNCTION niu_media_offer_binding_current(p_provider UUID, p_offer UUID, p_revision UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM provider_offers o
        JOIN provider_offer_revisions r ON r.offer_id=o.id AND r.id=p_revision
        WHERE o.provider_id=p_provider AND o.id=p_offer
          AND (r.rate_kind='text' OR EXISTS (
              SELECT 1 FROM vendors v
              JOIN vendor_models m ON m.alias=o.model_alias AND m.vendor_id=v.id
              WHERE v.id=o.vendor_id AND r.vendor_id=v.id
                AND r.vendor_revision=v.revision AND r.model_revision=m.revision
                AND r.schema_revision=m.capabilities->'video_schema'->>'revision'
                AND m.capabilities->'video_schema'->>'model_alias'=m.alias
                AND m.capabilities->'video_schema'->>'upstream_model'=m.upstream_model
                AND EXISTS (SELECT 1 FROM vendor_supplier_ownership s WHERE s.vendor_id=v.id AND s.provider_id=p_provider)
                AND NOT EXISTS (SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=v.id)
          ))
    )
$$;

-- @niu-legacy-migration 0132_chat_drafts.sql 548
-- Composer state is independent of sent conversations and owned by one actor.
CREATE TABLE chat_drafts (
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    owner text NOT NULL,
    payload jsonb,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id, project_id, owner),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    CHECK (payload IS NULL OR jsonb_typeof(payload) = 'object')
);

-- @niu-legacy-migration 0133_media_output_snapshots.sql 1349
-- Pre-dispatch output/estimate evidence; no prompts, credentials or purchase prices.
CREATE TABLE media_output_snapshots (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    document JSONB NOT NULL CHECK (jsonb_typeof(document) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES media_recovery_routes(organization_id, project_id, attempt_id)
);
CREATE TRIGGER immutable_media_output_snapshot BEFORE UPDATE OR DELETE ON media_output_snapshots
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE FUNCTION require_unsent_media_output_snapshot() RETURNS TRIGGER AS $$
BEGIN
    PERFORM 1 FROM attempts a JOIN media_recovery_routes r ON r.attempt_id=a.id
    WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id
      AND a.id=NEW.attempt_id AND a.dispatched_at IS NULL
      AND NEW.document->'output'->>'schema_revision'=r.schema_revision
    FOR UPDATE OF a;
    IF NOT FOUND THEN RAISE EXCEPTION 'media output snapshot requires unsent pinned route'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER require_unsent_media_output_snapshot BEFORE INSERT ON media_output_snapshots
    FOR EACH ROW EXECUTE FUNCTION require_unsent_media_output_snapshot();

-- @niu-legacy-migration 0134_media_output_dispatch_requirement.sql 949
-- Output-aware routes cannot reach egress without their saved specification.
CREATE FUNCTION require_media_output_before_dispatch() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.dispatched_at IS NULL AND NEW.dispatched_at IS NOT NULL AND EXISTS (
        SELECT 1 FROM media_recovery_routes r JOIN vendor_models m
          ON m.vendor_id=r.vendor_id AND m.alias=NEW.resource_id
        WHERE r.attempt_id=NEW.id
          AND m.capabilities->'video_schema'->'output' IS NOT NULL
          AND m.capabilities->'video_schema'->'output' <> 'null'::jsonb
          AND NOT EXISTS (SELECT 1 FROM media_output_snapshots s WHERE s.attempt_id=NEW.id)
    ) THEN
        RAISE EXCEPTION 'media dispatch requires effective output snapshot';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER require_media_output_before_dispatch BEFORE UPDATE OF dispatched_at ON attempts
    FOR EACH ROW EXECUTE FUNCTION require_media_output_before_dispatch();

-- @niu-legacy-migration 0135_media_result_references.sql 1667
-- Signed output URLs are encrypted private content, separate from accounting.
CREATE TABLE media_result_references (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('video','last_frame')),
    ciphertext BYTEA CHECK (octet_length(ciphertext) BETWEEN 30 AND 16413),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp() + interval '24 hours',
    deleted_at TIMESTAMPTZ,
    PRIMARY KEY (attempt_id,kind),
    FOREIGN KEY (organization_id,project_id,attempt_id)
        REFERENCES media_recovery_routes(organization_id,project_id,attempt_id),
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours 1 second'),
    CHECK ((deleted_at IS NULL AND ciphertext IS NOT NULL) OR (deleted_at IS NOT NULL AND ciphertext IS NULL))
);
CREATE INDEX media_result_expiry ON media_result_references(expires_at) WHERE ciphertext IS NOT NULL;
CREATE FUNCTION protect_media_result_reference() RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.organization_id,NEW.project_id,NEW.attempt_id,NEW.kind,NEW.created_at,NEW.expires_at)
      IS DISTINCT FROM (OLD.organization_id,OLD.project_id,OLD.attempt_id,OLD.kind,OLD.created_at,OLD.expires_at)
      OR (OLD.deleted_at IS NOT NULL AND NEW IS DISTINCT FROM OLD) THEN
        RAISE EXCEPTION 'media result identity, expiry and deletion are permanent';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER protect_media_result_reference BEFORE UPDATE ON media_result_references
    FOR EACH ROW EXECUTE FUNCTION protect_media_result_reference();

-- @niu-legacy-migration 0136_media_result_retention_hardening.sql 992
-- Preserve the already applied 0135 checksum; harden retention append-only.
-- Its separate clock_timestamp defaults could differ by microseconds. Shorten
-- existing windows before enforcing the exact 24-hour maximum; never extend.
DROP TRIGGER protect_media_result_reference ON media_result_references;
UPDATE media_result_references SET expires_at=created_at+interval '24 hours'
    WHERE expires_at>created_at+interval '24 hours';
ALTER TABLE media_result_references
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN expires_at SET DEFAULT now()+interval '24 hours',
    ADD CONSTRAINT media_result_retention_maximum CHECK(expires_at<=created_at+interval '24 hours');
CREATE TRIGGER protect_media_result_reference BEFORE UPDATE ON media_result_references
    FOR EACH ROW EXECUTE FUNCTION protect_media_result_reference();
CREATE TRIGGER retain_media_result_tombstone BEFORE DELETE ON media_result_references
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0137_customer_activity_media_charges.sql 1243
-- Customer-facing activity includes posted media charges, never Supplier costs.
-- A recorded media liability is not a paid charge until its exact debit exists;
-- qualified zero charges instead require their reservation to be released.
CREATE VIEW customer_activity_charges AS
SELECT organization_id, project_id, attempt_id, currency, amount_nanos
FROM customer_charges
UNION ALL
SELECT m.organization_id, m.project_id, m.attempt_id, m.currency, m.amount_nanos
FROM customer_media_charges m
WHERE NOT EXISTS (SELECT 1 FROM customer_charges t WHERE t.attempt_id=m.attempt_id)
AND (
    EXISTS (
        SELECT 1 FROM customer_balance_entries e
        WHERE e.organization_id=m.organization_id AND e.project_id=m.project_id
          AND e.attempt_id=m.attempt_id AND e.currency=m.currency
          AND e.kind='charge' AND e.amount_nanos=-m.amount_nanos
    )
    OR (m.amount_nanos=0 AND EXISTS (
        SELECT 1 FROM customer_balance_reservations r
        WHERE r.organization_id=m.organization_id AND r.attempt_id=m.attempt_id
          AND r.released_at IS NOT NULL
    ))
);

CREATE VIEW customer_activity_priced_attempts AS
SELECT attempt_id FROM customer_attempt_tariffs
UNION
SELECT attempt_id FROM customer_media_attempt_pricing;

-- @niu-legacy-migration 0138_customer_workspace_spending_limits.sql 4067
-- Customer retail spending is independent of legacy procurement budgets.
CREATE TABLE customer_workspace_spending_limits (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    limit_nanos BIGINT NOT NULL CHECK (limit_nanos >= 0),
    revision BIGINT NOT NULL CHECK (revision > 0),
    PRIMARY KEY (organization_id, project_id, currency),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id,id),
    FOREIGN KEY (organization_id, account_id, currency)
        REFERENCES customer_balance_accounts(organization_id,id,currency)
);

CREATE FUNCTION niu_customer_workspace_committed(p_organization UUID,p_project UUID,p_account UUID)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
    SELECT COALESCE((SELECT -SUM(e.amount_nanos) FROM customer_balance_entries e
        WHERE e.organization_id=p_organization AND e.project_id=p_project
          AND e.account_id=p_account AND e.kind='charge'),0)
        - COALESCE((SELECT SUM(r.amount_nanos) FROM customer_balance_entries r
            JOIN customer_balance_entries c ON c.id=r.reverses_entry_id
            WHERE r.account_id=p_account AND r.kind='refund'
              AND c.organization_id=p_organization AND c.project_id=p_project AND c.kind='charge'),0)
        + COALESCE((SELECT SUM(r.amount_nanos) FROM customer_balance_reservations r
            JOIN customer_attempt_balance_accounts b ON b.attempt_id=r.attempt_id
            WHERE b.organization_id=p_organization AND b.project_id=p_project
              AND r.account_id=p_account AND r.released_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM customer_balance_entries e
                  WHERE e.attempt_id=r.attempt_id AND e.kind='charge')),0)
$$;

CREATE FUNCTION protect_customer_workspace_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'spending limits cannot be deleted'; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR UPDATE;
    IF TG_OP='UPDATE' AND (ROW(NEW.organization_id,NEW.project_id,NEW.account_id,NEW.currency)
        IS DISTINCT FROM ROW(OLD.organization_id,OLD.project_id,OLD.account_id,OLD.currency)
        OR NEW.revision<>OLD.revision+1) THEN
        RAISE EXCEPTION 'invalid spending limit revision' USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' AND NEW.revision<>1 THEN
        RAISE EXCEPTION 'invalid initial spending limit revision' USING ERRCODE='23514';
    END IF;
    IF niu_customer_workspace_committed(NEW.organization_id,NEW.project_id,NEW.account_id)>NEW.limit_nanos THEN
        RAISE EXCEPTION 'spending limit below committed customer liability' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_customer_workspace_limit BEFORE INSERT OR UPDATE OR DELETE
    ON customer_workspace_spending_limits FOR EACH ROW EXECUTE FUNCTION protect_customer_workspace_limit();

CREATE FUNCTION enforce_customer_workspace_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE workspace UUID; maximum BIGINT;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR UPDATE;
    SELECT project_id INTO workspace FROM customer_attempt_balance_accounts
        WHERE attempt_id=NEW.attempt_id AND organization_id=NEW.organization_id
          AND account_id=NEW.account_id AND currency=NEW.currency;
    SELECT limit_nanos INTO maximum FROM customer_workspace_spending_limits
        WHERE organization_id=NEW.organization_id AND project_id=workspace
          AND account_id=NEW.account_id AND currency=NEW.currency;
    IF maximum IS NOT NULL AND
        niu_customer_workspace_committed(NEW.organization_id,workspace,NEW.account_id)+NEW.amount_nanos>maximum THEN
        RAISE EXCEPTION 'customer workspace spending limit exceeded' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_customer_workspace_reservation BEFORE INSERT ON customer_balance_reservations
    FOR EACH ROW EXECUTE FUNCTION enforce_customer_workspace_reservation();

-- @niu-legacy-migration 0139_customer_workspace_commitment_visibility.sql 229
-- Commitment checks must observe current reservations within the transaction.
-- Preserve the checksum of the already-applied spending-limit migration.
ALTER FUNCTION niu_customer_workspace_committed(UUID, UUID, UUID) VOLATILE;

-- @niu-legacy-migration 0140_customer_workspace_limit_history.sql 1781
CREATE TABLE customer_workspace_limit_history (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    currency TEXT NOT NULL,
    revision BIGINT NOT NULL CHECK (revision>0),
    limit_nanos BIGINT NOT NULL CHECK (limit_nanos>=0),
    recorded_at TIMESTAMPTZ,
    source TEXT NOT NULL CHECK (source IN ('migration_baseline','configuration')),
    PRIMARY KEY (organization_id,project_id,currency,revision),
    FOREIGN KEY (organization_id,project_id,currency)
        REFERENCES customer_workspace_spending_limits(organization_id,project_id,currency),
    CHECK ((source='migration_baseline' AND recorded_at IS NULL)
        OR (source='configuration' AND recorded_at IS NOT NULL))
);

-- Only the current revision is known on upgrade; do not invent earlier changes.
INSERT INTO customer_workspace_limit_history(organization_id,project_id,currency,revision,limit_nanos,source)
SELECT organization_id,project_id,currency,revision,limit_nanos,'migration_baseline'
FROM customer_workspace_spending_limits;

CREATE TRIGGER immutable_customer_workspace_limit_history BEFORE UPDATE OR DELETE
    ON customer_workspace_limit_history FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION record_customer_workspace_limit_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO customer_workspace_limit_history(organization_id,project_id,currency,revision,limit_nanos,recorded_at,source)
        VALUES(NEW.organization_id,NEW.project_id,NEW.currency,NEW.revision,NEW.limit_nanos,clock_timestamp(),'configuration');
    RETURN NEW;
END;
$$;
CREATE TRIGGER record_customer_workspace_limit_revision AFTER INSERT OR UPDATE
    ON customer_workspace_spending_limits FOR EACH ROW EXECUTE FUNCTION record_customer_workspace_limit_revision();

-- @niu-legacy-migration 0141_customer_workspace_limit_actors.sql 1775
ALTER TABLE customer_workspace_limit_history
    ADD COLUMN actor_kind TEXT NOT NULL DEFAULT 'unknown' CHECK (actor_kind IN ('unknown','installation','member')),
    ADD COLUMN actor_member_id UUID REFERENCES admin_operators(id),
    ADD COLUMN actor_name TEXT,
    ADD CONSTRAINT valid_workspace_limit_actor CHECK (
        (actor_kind='unknown' AND actor_member_id IS NULL AND actor_name IS NULL)
        OR (actor_kind='installation' AND actor_member_id IS NULL AND actor_name IS NOT NULL)
        OR (actor_kind='member' AND actor_member_id IS NOT NULL AND actor_name IS NOT NULL));

CREATE OR REPLACE FUNCTION record_customer_workspace_limit_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor TEXT; member UUID; display_name TEXT; kind TEXT := 'unknown';
BEGIN
    actor := NULLIF(current_setting('niu.workspace_limit_actor',true),'');
    IF actor='installation' THEN
        kind := 'installation'; display_name := 'Installation administrator';
    ELSIF actor IS NOT NULL THEN
        member := actor::UUID;
        SELECT name INTO display_name FROM admin_operators
            WHERE id=member AND role='owner' AND revoked_at IS NULL
              AND organization_id=NEW.organization_id
              AND (project_id IS NULL OR project_id=NEW.project_id);
        IF display_name IS NULL THEN RAISE EXCEPTION 'invalid workspace limit actor' USING ERRCODE='23514'; END IF;
        kind := 'member';
    END IF;
    INSERT INTO customer_workspace_limit_history(organization_id,project_id,currency,revision,limit_nanos,recorded_at,source,actor_kind,actor_member_id,actor_name)
        VALUES(NEW.organization_id,NEW.project_id,NEW.currency,NEW.revision,NEW.limit_nanos,clock_timestamp(),'configuration',kind,member,display_name);
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0142_unqualified_image_dispatch_guard.sql 1577
-- Reference-image approval binding is not yet integrated. Never silently ignore
-- a required image detector when transitioning any request to paid dispatch.
CREATE FUNCTION niu_check_unqualified_image_requirements() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy JSONB;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    -- Earlier dispatch guards establish current workspace/key coordination locks.
    FOR policy IN
      SELECT r.policy FROM workspace_guardrail_heads h JOIN workspace_guardrail_revisions r USING(organization_id,project_id,revision)
        WHERE h.organization_id=NEW.organization_id AND h.project_id=NEW.project_id
      UNION ALL
      SELECT r.policy FROM key_guardrail_assignments a JOIN workspace_guardrail_revisions r
        ON r.organization_id=a.organization_id AND r.project_id=a.project_id AND r.revision=a.policy_revision
        WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id
    LOOP
      IF policy ? 'image_detectors' AND policy->'image_detectors' IS DISTINCT FROM '[]'::jsonb THEN
        RAISE EXCEPTION 'required image inspection is not qualified' USING ERRCODE='P0010',
          DETAIL=niu_guardrail_rejection_detail(NEW.organization_id,NEW.project_id,NEW.api_key_id,'input_binding_missing');
      END IF;
    END LOOP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER zz_unqualified_image_dispatch_guard BEFORE UPDATE OF execution ON attempts
FOR EACH ROW EXECUTE FUNCTION niu_check_unqualified_image_requirements();

-- @niu-legacy-migration 0143_image_processing_approvals.sql 1643
-- Private metadata only. Images, inline encodings, credentials, endpoints and
-- detector response bodies never enter an approval receipt.
CREATE TABLE image_processing_approvals (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    detector_name TEXT NOT NULL CHECK (detector_name ~ '^[a-zA-Z0-9_-]{1,200}$'),
    detector_revision TEXT NOT NULL CHECK (length(detector_revision) BETWEEN 1 AND 256),
    configuration_fingerprint TEXT NOT NULL CHECK (configuration_fingerprint ~ '^[a-f0-9]{64}$'),
    content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
    content_position INTEGER NOT NULL CHECK (content_position BETWEEN 0 AND 255),
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    elapsed_ms BIGINT NOT NULL CHECK (elapsed_ms BETWEEN 0 AND 60000),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
    FOREIGN KEY (organization_id,project_id,workspace_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision),
    FOREIGN KEY (organization_id,project_id,key_policy_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision)
);
CREATE INDEX image_processing_approval_scope_time ON image_processing_approvals(organization_id,project_id,recorded_at DESC);
CREATE TRIGGER immutable_image_processing_approval BEFORE UPDATE OR DELETE ON image_processing_approvals
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0144_image_request_bindings.sql 4412
-- Private exact-request metadata; no image or request body is retained here.
ALTER TABLE image_processing_approvals ADD CONSTRAINT image_approval_scope_key_identity UNIQUE(organization_id,project_id,key_id,id);
CREATE TABLE image_request_bindings (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    body_sha256 TEXT NOT NULL CHECK(body_sha256 ~ '^[a-f0-9]{64}$'),
    schema_revision TEXT NOT NULL,
    image_positions INTEGER[] NOT NULL CHECK(cardinality(image_positions) BETWEEN 1 AND 256 AND 0 <= ALL(image_positions) AND 255 >= ALL(image_positions)),
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE(organization_id,project_id,key_id,attempt_id),
    FOREIGN KEY(organization_id,project_id,attempt_id) REFERENCES media_recovery_routes(organization_id,project_id,attempt_id),
    FOREIGN KEY(organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id)
);
CREATE TABLE image_request_approval_bindings (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    approval_id UUID PRIMARY KEY,
    FOREIGN KEY(organization_id,project_id,key_id,attempt_id) REFERENCES image_request_bindings(organization_id,project_id,key_id,attempt_id),
    FOREIGN KEY(organization_id,project_id,key_id,approval_id) REFERENCES image_processing_approvals(organization_id,project_id,key_id,id)
);
CREATE FUNCTION require_prepared_image_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM attempts a JOIN media_recovery_routes r ON r.attempt_id=a.id
      JOIN inspected_guardrail_bindings b ON b.attempt_id=a.id
      WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.id=NEW.attempt_id
        AND a.execution='not_sent' AND a.dispatched_at IS NULL
        AND b.key_id=NEW.key_id AND r.schema_revision=NEW.schema_revision
        AND b.workspace_revision IS NOT DISTINCT FROM NEW.workspace_revision
        AND b.key_policy_revision IS NOT DISTINCT FROM NEW.key_policy_revision
        AND b.key_assignment_revision IS NOT DISTINCT FROM NEW.key_assignment_revision
      FOR UPDATE OF a;
    IF NOT FOUND THEN RAISE EXCEPTION 'image request requires prepared scoped route and policy binding'; END IF;
    IF (SELECT count(DISTINCT position) FROM unnest(NEW.image_positions) position) <> cardinality(NEW.image_positions) THEN
      RAISE EXCEPTION 'image positions must be distinct';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_prepared_image_request BEFORE INSERT ON image_request_bindings FOR EACH ROW EXECUTE FUNCTION require_prepared_image_request();
CREATE FUNCTION require_scoped_image_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM image_request_bindings r JOIN image_processing_approvals p
      ON p.organization_id=r.organization_id AND p.project_id=r.project_id AND p.key_id=r.key_id
      JOIN attempts a ON a.id=r.attempt_id
      WHERE r.attempt_id=NEW.attempt_id AND p.id=NEW.approval_id
        AND r.organization_id=NEW.organization_id AND r.project_id=NEW.project_id AND r.key_id=NEW.key_id
        AND p.content_position=ANY(r.image_positions)
        AND p.workspace_revision IS NOT DISTINCT FROM r.workspace_revision
        AND p.key_policy_revision IS NOT DISTINCT FROM r.key_policy_revision
        AND p.key_assignment_revision IS NOT DISTINCT FROM r.key_assignment_revision
        AND a.execution='not_sent' AND a.dispatched_at IS NULL FOR UPDATE OF a;
    IF NOT FOUND THEN RAISE EXCEPTION 'image approval does not match prepared request'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_scoped_image_approval BEFORE INSERT ON image_request_approval_bindings FOR EACH ROW EXECUTE FUNCTION require_scoped_image_approval();
CREATE TRIGGER immutable_image_request BEFORE UPDATE OR DELETE ON image_request_bindings FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_image_request_approval BEFORE UPDATE OR DELETE ON image_request_approval_bindings FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
-- The 0142 dispatch guard remains active until gateway policy and qualification
-- checks are integrated. Binding a request alone does not authorize generation.

-- @niu-legacy-migration 0145_stripe_topup_references.sql 500
-- Retain legacy adapter limits; Stripe Checkout sessions contain underscores.
ALTER TABLE customer_topup_provider_orders
    DROP CONSTRAINT customer_topup_provider_orders_platform_reference_check;
ALTER TABLE customer_topup_provider_orders
    ADD CONSTRAINT customer_topup_provider_orders_platform_reference_check CHECK (
        (aggregator = 'stripe' AND platform_reference ~ '^cs_[A-Za-z0-9_]{1,252}$')
        OR (aggregator <> 'stripe' AND platform_reference ~ '^[A-Za-z0-9]{1,128}$')
    );

-- @niu-legacy-migration 0146_stripe_checkout_urls.sql 984
ALTER TABLE customer_topup_checkout DROP CONSTRAINT customer_topup_checkout_checkout_url_check;
ALTER TABLE customer_topup_checkout ADD CONSTRAINT customer_topup_checkout_checkout_url_check
    CHECK (length(checkout_url) BETWEEN 1 AND 8192 AND checkout_url LIKE 'https://%');

CREATE FUNCTION require_adapter_checkout_url() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE adapter TEXT;
BEGIN
    SELECT aggregator INTO adapter FROM customer_topup_provider_orders WHERE order_id = NEW.order_id;
    IF adapter = 'stripe' THEN
        IF NEW.checkout_url !~ '^https://checkout[.]stripe[.]com/' THEN
            RAISE EXCEPTION 'Invalid checkout origin';
        END IF;
    ELSIF length(NEW.checkout_url) > 2048 OR position('#' IN NEW.checkout_url) > 0 THEN
        RAISE EXCEPTION 'Invalid checkout URL';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER adapter_checkout_url BEFORE INSERT ON customer_topup_checkout
    FOR EACH ROW EXECUTE FUNCTION require_adapter_checkout_url();

-- @niu-legacy-migration 0147_key_metadata_updates.sql 414
ALTER TABLE api_keys ADD COLUMN revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE key_audit_events DROP CONSTRAINT key_audit_events_action_check;
ALTER TABLE key_audit_events ADD CONSTRAINT key_audit_events_action_check
    CHECK (action IN ('issued', 'revoked', 'rotated', 'updated'));
ALTER TABLE key_audit_events ADD COLUMN previous_metadata JSONB;
ALTER TABLE key_audit_events ADD COLUMN updated_metadata JSONB;

-- @niu-legacy-migration 0148_epay_merchant_checkout.sql 972
-- Classic EPay supplies its provider reference only after checkout.
-- A checkout is an immutable merchant-order artifact, never payment evidence.
ALTER TABLE customer_topup_checkout DROP CONSTRAINT customer_topup_checkout_order_id_fkey;
ALTER TABLE customer_topup_checkout ADD CONSTRAINT customer_topup_checkout_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES customer_topup_orders(id);

CREATE FUNCTION require_checkout_payment_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM customer_topup_orders o WHERE o.id=NEW.order_id
        AND (o.aggregator='epay' OR EXISTS
            (SELECT 1 FROM customer_topup_provider_orders p WHERE p.order_id=o.id))) THEN
        RAISE EXCEPTION 'checkout requires a saved payment identity';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER require_checkout_payment_identity BEFORE INSERT ON customer_topup_checkout
    FOR EACH ROW EXECUTE FUNCTION require_checkout_payment_identity();

-- @niu-legacy-migration 0149_epay_payment_references.sql 649
-- Match the bounded identifier accepted by the classic EPay verifier.
-- Preserve Stripe and all other adapters' existing limits.
ALTER TABLE customer_topup_provider_orders
    DROP CONSTRAINT customer_topup_provider_orders_platform_reference_check;
ALTER TABLE customer_topup_provider_orders
    ADD CONSTRAINT customer_topup_provider_orders_platform_reference_check CHECK (
        (aggregator = 'stripe' AND platform_reference ~ '^cs_[A-Za-z0-9_]{1,252}$')
        OR (aggregator = 'epay' AND platform_reference ~ '^[A-Za-z0-9_-]{1,128}$')
        OR (aggregator NOT IN ('stripe', 'epay') AND platform_reference ~ '^[A-Za-z0-9]{1,128}$')
    );

-- @niu-legacy-migration 0150_asset_management_credentials.sql 1098
-- Asset management credentials are separate from inference bearer credentials.
-- Rows are immutable revisions for original-account recovery; no dispatch is enabled.
CREATE TABLE vendor_asset_management_credentials (
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    revision BIGINT NOT NULL CHECK (revision > 0),
    upstream_project TEXT NOT NULL CHECK (char_length(upstream_project) BETWEEN 1 AND 1024 AND btrim(upstream_project)=upstream_project),
    credential_ciphertext BYTEA NOT NULL CHECK (octet_length(credential_ciphertext) BETWEEN 30 AND 65536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (vendor_id, revision)
);

CREATE FUNCTION preserve_asset_management_credential_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'asset management credential revisions are immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_asset_management_credential_revision
    BEFORE UPDATE OR DELETE ON vendor_asset_management_credentials
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_management_credential_revision();

-- @niu-legacy-migration 0151_asset_management_configuration_actor.sql 239
-- Prior internal foundation rows have no attributed actor; do not invent one.
ALTER TABLE vendor_asset_management_credentials
    ADD COLUMN actor_kind TEXT NOT NULL DEFAULT 'unknown'
    CHECK (actor_kind IN ('unknown','installation'));

-- @niu-legacy-migration 0152_asset_management_credential_revocation.sql 1598
CREATE TABLE vendor_asset_management_revocations (
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    through_revision BIGINT NOT NULL CHECK (through_revision > 0),
    actor_kind TEXT NOT NULL CHECK (actor_kind='installation'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (vendor_id,through_revision)
);
CREATE FUNCTION preserve_asset_management_revocation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'asset management revocations are immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_asset_management_revocation
    BEFORE UPDATE OR DELETE ON vendor_asset_management_revocations
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_management_revocation();

ALTER TABLE vendor_asset_management_credentials ALTER COLUMN credential_ciphertext DROP NOT NULL;
CREATE OR REPLACE FUNCTION preserve_asset_management_credential_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE'
       AND OLD.credential_ciphertext IS NOT NULL AND NEW.credential_ciphertext IS NULL
       AND ROW(NEW.vendor_id,NEW.revision,NEW.upstream_project,NEW.created_at,NEW.actor_kind)
           IS NOT DISTINCT FROM ROW(OLD.vendor_id,OLD.revision,OLD.upstream_project,OLD.created_at,OLD.actor_kind)
       AND EXISTS (SELECT 1 FROM vendor_asset_management_revocations r
                   WHERE r.vendor_id=OLD.vendor_id AND r.through_revision>=OLD.revision)
    THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'asset management credential revisions are immutable except revoked-secret erasure' USING ERRCODE='23514';
END;
$$;

-- @niu-legacy-migration 0153_asset_management_erasure_audit.sql 599
CREATE TABLE vendor_asset_management_erasures (
    vendor_id UUID NOT NULL,
    through_revision BIGINT NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind='installation'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (vendor_id,through_revision),
    FOREIGN KEY (vendor_id,through_revision) REFERENCES vendor_asset_management_revocations(vendor_id,through_revision)
);
CREATE TRIGGER immutable_asset_management_erasure
    BEFORE UPDATE OR DELETE ON vendor_asset_management_erasures
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_management_revocation();

-- @niu-legacy-migration 0154_asset_group_create_intents.sql 900
CREATE TABLE asset_group_create_intents (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    idempotency_key UUID NOT NULL,
    vendor_id UUID NOT NULL,
    credential_revision BIGINT NOT NULL,
    upstream_project TEXT NOT NULL,
    request_body JSONB NOT NULL,
    state TEXT NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared','dispatching','uncertain','succeeded')),
    upstream_group_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
    FOREIGN KEY (vendor_id,credential_revision) REFERENCES vendor_asset_management_credentials(vendor_id,revision),
    UNIQUE (organization_id,project_id,idempotency_key),
    CHECK ((state='succeeded') = (upstream_group_id IS NOT NULL))
);

-- @niu-legacy-migration 0155_asset_group_intent_transitions.sql 975
CREATE FUNCTION preserve_asset_group_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND
       (NEW.id,NEW.organization_id,NEW.project_id,NEW.idempotency_key,NEW.vendor_id,NEW.credential_revision,NEW.upstream_project,NEW.request_body,NEW.created_at)
       IS NOT DISTINCT FROM
       (OLD.id,OLD.organization_id,OLD.project_id,OLD.idempotency_key,OLD.vendor_id,OLD.credential_revision,OLD.upstream_project,OLD.request_body,OLD.created_at)
       AND ((OLD.state='prepared' AND NEW.state='dispatching') OR
            (OLD.state='dispatching' AND NEW.state IN ('uncertain','succeeded')) OR
            (OLD.state='uncertain' AND NEW.state='succeeded')) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'asset creation intent is immutable outside forward transitions';
END;
$$;
CREATE TRIGGER asset_group_intent_transitions BEFORE UPDATE OR DELETE ON asset_group_create_intents
FOR EACH ROW EXECUTE FUNCTION preserve_asset_group_intent();

-- @niu-legacy-migration 0156_asset_group_account_revision.sql 1139
-- Existing intents have no trustworthy historical account revision. Zero keeps
-- them readable for reconciliation but ineligible for an upstream claim.
ALTER TABLE asset_group_create_intents ADD COLUMN vendor_revision BIGINT NOT NULL DEFAULT 0 CHECK (vendor_revision>=0);
CREATE OR REPLACE FUNCTION preserve_asset_group_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND
       (NEW.id,NEW.organization_id,NEW.project_id,NEW.idempotency_key,NEW.vendor_id,NEW.vendor_revision,NEW.credential_revision,NEW.upstream_project,NEW.request_body,NEW.created_at)
       IS NOT DISTINCT FROM
       (OLD.id,OLD.organization_id,OLD.project_id,OLD.idempotency_key,OLD.vendor_id,OLD.vendor_revision,OLD.credential_revision,OLD.upstream_project,OLD.request_body,OLD.created_at)
       AND ((OLD.state='prepared' AND NEW.state='dispatching') OR
            (OLD.state='dispatching' AND NEW.state IN ('uncertain','succeeded')) OR
            (OLD.state='uncertain' AND NEW.state='succeeded')) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'asset creation intent is immutable outside forward transitions';
END;
$$;

-- @niu-legacy-migration 0157_asset_group_reconciliation_index.sql 153
CREATE INDEX asset_group_intents_reconciliation ON asset_group_create_intents(organization_id,project_id,id)
WHERE state IN ('dispatching','uncertain');

-- @niu-legacy-migration 0158_asset_group_request_retention.sql 2367
DROP TRIGGER asset_group_intent_transitions ON asset_group_create_intents;
ALTER TABLE asset_group_create_intents ALTER COLUMN request_body DROP NOT NULL;
ALTER TABLE asset_group_create_intents ADD COLUMN request_fingerprint BYTEA;
ALTER TABLE asset_group_create_intents ADD COLUMN request_expires_at TIMESTAMPTZ;
UPDATE asset_group_create_intents SET request_fingerprint=sha256(convert_to(request_body::text,'UTF8')),request_expires_at=created_at+interval '24 hours';
ALTER TABLE asset_group_create_intents ALTER COLUMN request_fingerprint SET NOT NULL;
ALTER TABLE asset_group_create_intents ALTER COLUMN request_expires_at SET NOT NULL;
ALTER TABLE asset_group_create_intents ADD CONSTRAINT asset_group_request_digest_size CHECK (octet_length(request_fingerprint)=32);
CREATE OR REPLACE FUNCTION preserve_asset_group_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND
       (NEW.id,NEW.organization_id,NEW.project_id,NEW.idempotency_key,NEW.vendor_id,NEW.vendor_revision,NEW.credential_revision,NEW.upstream_project,NEW.request_fingerprint,NEW.request_expires_at,NEW.created_at)
       IS NOT DISTINCT FROM
       (OLD.id,OLD.organization_id,OLD.project_id,OLD.idempotency_key,OLD.vendor_id,OLD.vendor_revision,OLD.credential_revision,OLD.upstream_project,OLD.request_fingerprint,OLD.request_expires_at,OLD.created_at) THEN
        IF NEW.request_body IS NOT DISTINCT FROM OLD.request_body AND
          ((OLD.state='prepared' AND NEW.state='dispatching') OR
           (OLD.state='dispatching' AND NEW.state IN ('uncertain','succeeded')) OR
           (OLD.state='uncertain' AND NEW.state='succeeded')) THEN RETURN NEW; END IF;
        IF OLD.request_body IS NOT NULL AND NEW.request_body IS NULL AND OLD.request_expires_at<=clock_timestamp()
           AND (NEW.state,NEW.upstream_group_id,NEW.updated_at) IS NOT DISTINCT FROM (OLD.state,OLD.upstream_group_id,OLD.updated_at)
           THEN RETURN NEW; END IF;
    END IF;
    RAISE EXCEPTION 'asset creation intent is immutable outside forward transitions or expired content erasure';
END;
$$;
CREATE TRIGGER asset_group_intent_transitions BEFORE UPDATE OR DELETE ON asset_group_create_intents
FOR EACH ROW EXECUTE FUNCTION preserve_asset_group_intent();
CREATE INDEX asset_group_request_expiry ON asset_group_create_intents(request_expires_at,id) WHERE request_body IS NOT NULL;

-- @niu-legacy-migration 0159_asset_group_request_deletion.sql 1938
CREATE TABLE asset_group_request_deletions (
    intent_id UUID PRIMARY KEY REFERENCES asset_group_create_intents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION preserve_asset_group_request_deletion() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'asset request deletion event is immutable';
END;
$$;
CREATE TRIGGER asset_group_request_deletion_immutable BEFORE UPDATE OR DELETE ON asset_group_request_deletions
FOR EACH ROW EXECUTE FUNCTION preserve_asset_group_request_deletion();
CREATE OR REPLACE FUNCTION preserve_asset_group_intent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND
       (NEW.id,NEW.organization_id,NEW.project_id,NEW.idempotency_key,NEW.vendor_id,NEW.vendor_revision,NEW.credential_revision,NEW.upstream_project,NEW.request_fingerprint,NEW.request_expires_at,NEW.created_at)
       IS NOT DISTINCT FROM
       (OLD.id,OLD.organization_id,OLD.project_id,OLD.idempotency_key,OLD.vendor_id,OLD.vendor_revision,OLD.credential_revision,OLD.upstream_project,OLD.request_fingerprint,OLD.request_expires_at,OLD.created_at) THEN
        IF NEW.request_body IS NOT DISTINCT FROM OLD.request_body AND
          ((OLD.state='prepared' AND NEW.state='dispatching') OR
           (OLD.state='dispatching' AND NEW.state IN ('uncertain','succeeded')) OR
           (OLD.state='uncertain' AND NEW.state='succeeded')) THEN RETURN NEW; END IF;
        IF OLD.request_body IS NOT NULL AND NEW.request_body IS NULL AND (OLD.request_expires_at<=clock_timestamp() OR EXISTS (SELECT 1 FROM asset_group_request_deletions d WHERE d.intent_id=OLD.id))
           AND (NEW.state,NEW.upstream_group_id,NEW.updated_at) IS NOT DISTINCT FROM (OLD.state,OLD.upstream_group_id,OLD.updated_at)
           THEN RETURN NEW; END IF;
    END IF;
    RAISE EXCEPTION 'asset creation intent is immutable outside forward transitions or authorized content erasure';
END;
$$;

-- @niu-legacy-migration 0160_platform_administrators.sql 244
-- Platform administration is independent of customer workspace membership.
-- Existing members retain their scope and never gain platform access implicitly.
ALTER TABLE admin_operators ADD COLUMN platform_admin boolean NOT NULL DEFAULT false;

-- @niu-legacy-migration 0161_platform_admin_events.sql 485
CREATE TABLE platform_admin_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id uuid NOT NULL REFERENCES admin_operators(id),
    granted boolean NOT NULL,
    actor_kind text NOT NULL CHECK (actor_kind = 'database_administrator'),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_platform_admin_events
    BEFORE UPDATE OR DELETE ON platform_admin_events
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0162_asset_group_request_discovery_index.sql 257
-- Customer discovery includes every local intent state. The reconciliation
-- partial index does not cover prepared or completed requests.
CREATE INDEX asset_group_intents_workspace_discovery
ON asset_group_create_intents(organization_id, project_id, id);

-- @niu-legacy-migration 0163_workspace_request_summary_index.sql 104
CREATE INDEX operations_workspace_created ON operations (organization_id, project_id, created_at DESC);

-- @niu-legacy-migration 0164_supplier_directory_deletion.sql 67
ALTER TABLE provider_businesses ADD COLUMN deleted_at TIMESTAMPTZ;

-- @niu-legacy-migration 0165_payment_gateway_configuration.sql 639
CREATE TABLE payment_gateway_configuration (
    gateway TEXT PRIMARY KEY CHECK (gateway = 'epay'),
    revision BIGINT NOT NULL CHECK (revision > 0),
    ciphertext BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE payment_gateway_configuration_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gateway TEXT NOT NULL,
    revision BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_payment_gateway_configuration_events BEFORE UPDATE OR DELETE ON payment_gateway_configuration_events FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0166_payment_gateway_configuration_actor.sql 115
ALTER TABLE payment_gateway_configuration_events ADD COLUMN actor_operator_id UUID REFERENCES admin_operators(id);

-- @niu-legacy-migration 0167_supplier_profile.sql 370
ALTER TABLE provider_businesses
    ADD COLUMN description TEXT NOT NULL DEFAULT '' CHECK (octet_length(description) <= 8000),
    ADD COLUMN website_url TEXT NOT NULL DEFAULT '' CHECK (octet_length(website_url) <= 2048),
    ADD COLUMN logo_url TEXT NOT NULL DEFAULT '' CHECK (octet_length(logo_url) <= 2048),
    ADD COLUMN profile_revision BIGINT NOT NULL DEFAULT 1;

-- @niu-legacy-migration 0168_image_dispatch_receipt_guard.sql 3707
-- Require immutable exact-request coverage rather than rejecting every image
-- policy. Gateway admission must still inspect the actual outgoing content.
CREATE OR REPLACE FUNCTION niu_check_unqualified_image_requirements() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE policy JSONB; detector JSONB; binding image_request_bindings%ROWTYPE; position INTEGER;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    FOR policy IN
      SELECT r.policy FROM workspace_guardrail_heads h JOIN workspace_guardrail_revisions r USING(organization_id,project_id,revision)
        WHERE h.organization_id=NEW.organization_id AND h.project_id=NEW.project_id
      UNION ALL
      SELECT r.policy FROM key_guardrail_assignments a JOIN workspace_guardrail_revisions r
        ON r.organization_id=a.organization_id AND r.project_id=a.project_id AND r.revision=a.policy_revision
        WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id
    LOOP
      IF NOT (policy ? 'image_detectors') OR policy->'image_detectors' = '[]'::jsonb THEN CONTINUE; END IF;
      IF jsonb_typeof(policy->'image_detectors') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'invalid required image inspection' USING ERRCODE='P0010',
          DETAIL=niu_guardrail_rejection_detail(NEW.organization_id,NEW.project_id,NEW.api_key_id,'input_binding_missing');
      END IF;
      SELECT i.* INTO binding FROM image_request_bindings i JOIN inspected_guardrail_bindings b
        ON b.organization_id=i.organization_id AND b.project_id=i.project_id AND b.attempt_id=i.attempt_id AND b.key_id=i.key_id
        WHERE i.organization_id=NEW.organization_id AND i.project_id=NEW.project_id AND i.attempt_id=NEW.id AND i.key_id=NEW.api_key_id
          AND i.workspace_revision IS NOT DISTINCT FROM b.workspace_revision
          AND i.key_policy_revision IS NOT DISTINCT FROM b.key_policy_revision
          AND i.key_assignment_revision IS NOT DISTINCT FROM b.key_assignment_revision;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'required image request binding missing' USING ERRCODE='P0010',
          DETAIL=niu_guardrail_rejection_detail(NEW.organization_id,NEW.project_id,NEW.api_key_id,'input_binding_missing');
      END IF;
      FOR detector IN SELECT value FROM jsonb_array_elements(policy->'image_detectors') LOOP
        FOREACH position IN ARRAY binding.image_positions LOOP
          IF detector->>'consent_to_image_processing' IS DISTINCT FROM 'true' OR NOT EXISTS (
            SELECT 1 FROM image_request_approval_bindings a JOIN image_processing_approvals r
              ON r.organization_id=a.organization_id AND r.project_id=a.project_id AND r.key_id=a.key_id AND r.id=a.approval_id
              WHERE a.attempt_id=NEW.id AND a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id
                AND r.content_position=position AND r.detector_name=detector->>'detector'
                AND r.configuration_fingerprint=detector->>'configuration_fingerprint'
                AND r.workspace_revision IS NOT DISTINCT FROM binding.workspace_revision
                AND r.key_policy_revision IS NOT DISTINCT FROM binding.key_policy_revision
                AND r.key_assignment_revision IS NOT DISTINCT FROM binding.key_assignment_revision
          ) THEN
            RAISE EXCEPTION 'required image inspection coverage missing' USING ERRCODE='P0010',
              DETAIL=niu_guardrail_rejection_detail(NEW.organization_id,NEW.project_id,NEW.api_key_id,'input_binding_missing');
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0169_asset_operation_authorizations.sql 2428
-- Explicit administrator-reviewed qualification; never inferred from credentials.
CREATE TABLE asset_operation_authorizations (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    vendor_id UUID NOT NULL,
    vendor_revision BIGINT NOT NULL CHECK (vendor_revision > 0),
    credential_revision BIGINT NOT NULL,
    operation TEXT NOT NULL CHECK (operation='CreateAssetGroup'),
    rights_sha256 BYTEA NOT NULL CHECK (octet_length(rights_sha256)=32),
    protocol_sha256 BYTEA NOT NULL CHECK (octet_length(protocol_sha256)=32),
    data_handling_sha256 BYTEA NOT NULL CHECK (octet_length(data_handling_sha256)=32),
    free_operation_sha256 BYTEA NOT NULL CHECK (octet_length(free_operation_sha256)=32),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK ((actor_kind='operator')=(actor_id IS NOT NULL)),
    CHECK (expires_at>created_at AND expires_at<=created_at+INTERVAL '90 days'),
    FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
    FOREIGN KEY (vendor_id,credential_revision) REFERENCES vendor_asset_management_credentials(vendor_id,revision)
);
CREATE TABLE asset_operation_authorization_revocations (
    authorization_id UUID PRIMARY KEY REFERENCES asset_operation_authorizations(id),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((actor_kind='operator')=(actor_id IS NOT NULL))
);
CREATE FUNCTION preserve_asset_operation_authorization() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'asset operation authorization events are immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_asset_operation_authorization BEFORE UPDATE OR DELETE ON asset_operation_authorizations
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE TRIGGER immutable_asset_operation_authorization_revocation BEFORE UPDATE OR DELETE ON asset_operation_authorization_revocations
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE INDEX asset_operation_authorization_binding ON asset_operation_authorizations
    (organization_id,project_id,vendor_id,vendor_revision,credential_revision);

-- @niu-legacy-migration 0170_asset_dispatch_authorization_receipts.sql 548
-- Historical claims have no qualification receipt; never fabricate one.
CREATE TABLE asset_group_dispatch_authorizations (
    intent_id UUID PRIMARY KEY REFERENCES asset_group_create_intents(id),
    authorization_id UUID NOT NULL REFERENCES asset_operation_authorizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_group_dispatch_authorization BEFORE UPDATE OR DELETE
    ON asset_group_dispatch_authorizations FOR EACH ROW
    EXECUTE FUNCTION preserve_asset_operation_authorization();

-- @niu-legacy-migration 0171_asset_group_dispatch_outcomes.sql 758
-- Management audit only; does not mutate balances or inference accounting.
CREATE TABLE asset_group_dispatch_outcomes (
    intent_id UUID PRIMARY KEY REFERENCES asset_group_dispatch_authorizations(intent_id),
    outcome TEXT NOT NULL CHECK (outcome IN ('succeeded','uncertain')),
    reason TEXT CHECK (reason IN ('invalid_configuration','destination_rejected','upstream_uncertain','timeout')),
    duration_ms BIGINT NOT NULL CHECK (duration_ms>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((outcome='succeeded')=(reason IS NULL))
);
CREATE TRIGGER immutable_asset_group_dispatch_outcome BEFORE UPDATE OR DELETE ON asset_group_dispatch_outcomes
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();

-- @niu-legacy-migration 0172_asset_group_read_authorizations.sql 436
-- Read rights require their own reviewed grant. Existing creation grants retain
-- exactly their original operation and cannot authorize account reads.
ALTER TABLE asset_operation_authorizations
    DROP CONSTRAINT asset_operation_authorizations_operation_check;
ALTER TABLE asset_operation_authorizations
    ADD CONSTRAINT asset_operation_authorizations_operation_check
    CHECK (operation IN ('CreateAssetGroup','GetAssetGroup'));

-- @niu-legacy-migration 0173_asset_group_read_audit.sql 1309
-- Read-only management audit; no inference ledger or balance mutation.
CREATE TABLE asset_group_read_claims (
    id UUID PRIMARY KEY,
    intent_id UUID NOT NULL REFERENCES asset_group_create_intents(id),
    authorization_id UUID NOT NULL REFERENCES asset_operation_authorizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE asset_group_read_outcomes (
    read_id UUID PRIMARY KEY REFERENCES asset_group_read_claims(id),
    outcome TEXT NOT NULL CHECK (outcome IN ('succeeded','failed')),
    reason TEXT CHECK (reason IN ('invalid_configuration','destination_rejected','unavailable','transport','timeout','response_limit','invalid_response')),
    duration_ms BIGINT NOT NULL CHECK (duration_ms>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((outcome='succeeded')=(reason IS NULL))
);
CREATE TRIGGER immutable_asset_group_read_claim BEFORE UPDATE OR DELETE ON asset_group_read_claims
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE TRIGGER immutable_asset_group_read_outcome BEFORE UPDATE OR DELETE ON asset_group_read_outcomes
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE INDEX asset_group_read_claim_intent ON asset_group_read_claims(intent_id,created_at);

-- @niu-legacy-migration 0174_asset_group_read_results.sql 1622
-- Private descriptive results are encrypted separately from immutable audit.
CREATE TABLE asset_group_read_results (
    read_id UUID PRIMARY KEY REFERENCES asset_group_read_outcomes(read_id),
    ciphertext BYTEA CHECK (ciphertext IS NULL OR octet_length(ciphertext) BETWEEN 30 AND 8192),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp()+INTERVAL '24 hours'),
    deleted_at TIMESTAMPTZ,
    CHECK ((ciphertext IS NULL)=(deleted_at IS NOT NULL))
);
CREATE FUNCTION preserve_asset_group_read_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS NULL
       AND NEW.deleted_at IS NOT NULL AND NEW.read_id=OLD.read_id AND NEW.expires_at=OLD.expires_at THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'asset read results permit erasure only' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_asset_group_read_result BEFORE UPDATE OR DELETE ON asset_group_read_results
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_group_read_result();
CREATE INDEX asset_group_read_result_expiry ON asset_group_read_results(expires_at,read_id) WHERE ciphertext IS NOT NULL;
-- A deletion during an in-flight read must also prevent later content storage.
CREATE TABLE asset_group_read_result_deletions (
    read_id UUID PRIMARY KEY REFERENCES asset_group_read_claims(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_group_read_result_deletion BEFORE UPDATE OR DELETE ON asset_group_read_result_deletions
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();

-- @niu-legacy-migration 0175_asset_listing_authorizations.sql 372
-- Listing is a separately reviewed operation; never widen existing grants.
ALTER TABLE asset_operation_authorizations
    DROP CONSTRAINT asset_operation_authorizations_operation_check;
ALTER TABLE asset_operation_authorizations
    ADD CONSTRAINT asset_operation_authorizations_operation_check
    CHECK (operation IN ('CreateAssetGroup','GetAssetGroup','ListAssets'));

-- @niu-legacy-migration 0176_asset_listing_audit.sql 1569
-- Listing audit contains no descriptive content, URL, cursor or billing data.
CREATE TABLE asset_listing_claims (
    id UUID PRIMARY KEY,
    intent_id UUID NOT NULL REFERENCES asset_group_create_intents(id),
    authorization_id UUID NOT NULL REFERENCES asset_operation_authorizations(id),
    maximum_items INTEGER NOT NULL CHECK (maximum_items BETWEEN 1 AND 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE asset_listing_outcomes (
    listing_id UUID PRIMARY KEY REFERENCES asset_listing_claims(id),
    outcome TEXT NOT NULL CHECK (outcome IN ('succeeded','failed')),
    reason TEXT CHECK (reason IN ('invalid_configuration','destination_rejected','unavailable','transport','timeout','response_limit','invalid_response')),
    duration_ms BIGINT NOT NULL CHECK (duration_ms>=0),
    item_count INTEGER CHECK (item_count BETWEEN 0 AND 100),
    has_more BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((outcome='succeeded')=(reason IS NULL)),
    CHECK ((outcome='succeeded')=(item_count IS NOT NULL)),
    CHECK ((outcome='succeeded')=(has_more IS NOT NULL))
);
CREATE TRIGGER immutable_asset_listing_claim BEFORE UPDATE OR DELETE ON asset_listing_claims
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE TRIGGER immutable_asset_listing_outcome BEFORE UPDATE OR DELETE ON asset_listing_outcomes
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE INDEX asset_listing_claim_intent ON asset_listing_claims(intent_id,created_at);

-- @niu-legacy-migration 0177_asset_listing_results.sql 1609
-- Private descriptive results are encrypted separately from immutable audit.
CREATE TABLE asset_listing_results (
    listing_id UUID PRIMARY KEY REFERENCES asset_listing_outcomes(listing_id),
    ciphertext BYTEA CHECK (ciphertext IS NULL OR octet_length(ciphertext) BETWEEN 30 AND 131072),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp()+INTERVAL '24 hours'),
    deleted_at TIMESTAMPTZ,
    CHECK ((ciphertext IS NULL)=(deleted_at IS NOT NULL))
);
CREATE FUNCTION preserve_asset_listing_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS NULL
       AND NEW.deleted_at IS NOT NULL AND NEW.listing_id=OLD.listing_id AND NEW.expires_at=OLD.expires_at THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'asset listing results permit erasure only' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_asset_listing_result BEFORE UPDATE OR DELETE ON asset_listing_results
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_listing_result();
CREATE INDEX asset_listing_result_expiry ON asset_listing_results(expires_at,listing_id) WHERE ciphertext IS NOT NULL;
-- A deletion during an in-flight read must also prevent later content storage.
CREATE TABLE asset_listing_result_deletions (
    listing_id UUID PRIMARY KEY REFERENCES asset_listing_claims(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_listing_result_deletion BEFORE UPDATE OR DELETE ON asset_listing_result_deletions
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();

-- @niu-legacy-migration 0178_asset_listing_continuations.sql 744
-- One next-page claim per retained parent, with a finite chain and private receipt.
ALTER TABLE asset_listing_claims
    ADD COLUMN parent_listing_id UUID REFERENCES asset_listing_claims(id),
    ADD COLUMN page_number INTEGER NOT NULL DEFAULT 1 CHECK (page_number BETWEEN 1 AND 100),
    ADD COLUMN parent_snapshot_sha256 BYTEA CHECK (parent_snapshot_sha256 IS NULL OR octet_length(parent_snapshot_sha256)=32),
    ADD CHECK ((parent_listing_id IS NULL)=(page_number=1)),
    ADD CHECK ((parent_listing_id IS NULL)=(parent_snapshot_sha256 IS NULL)),
    ADD CHECK (parent_listing_id IS NULL OR parent_listing_id<>id);
CREATE UNIQUE INDEX asset_listing_one_child ON asset_listing_claims(parent_listing_id) WHERE parent_listing_id IS NOT NULL;

-- @niu-legacy-migration 0179_asset_lookup_authorizations.sql 382
-- Individual reads require separate review; do not widen existing grants.
ALTER TABLE asset_operation_authorizations
    DROP CONSTRAINT asset_operation_authorizations_operation_check;
ALTER TABLE asset_operation_authorizations
    ADD CONSTRAINT asset_operation_authorizations_operation_check
    CHECK (operation IN ('CreateAssetGroup','GetAssetGroup','ListAssets','GetAsset'));

-- @niu-legacy-migration 0180_asset_lookup_claims.sql 768
-- Immutable, zero-charge lookup audit; no upstream asset identity or content.
CREATE TABLE asset_lookup_claims (
    id UUID PRIMARY KEY,
    listing_id UUID NOT NULL REFERENCES asset_listing_claims(id),
    authorization_id UUID NOT NULL REFERENCES asset_operation_authorizations(id),
    item_index INTEGER NOT NULL CHECK (item_index BETWEEN 0 AND 99),
    listing_snapshot_sha256 BYTEA NOT NULL CHECK (octet_length(listing_snapshot_sha256)=32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_lookup_claim BEFORE UPDATE OR DELETE ON asset_lookup_claims
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE INDEX asset_lookup_claim_listing ON asset_lookup_claims(listing_id,created_at);

-- @niu-legacy-migration 0181_asset_lookup_outcomes.sql 892
-- Transport success is distinct from the asset processing status observed.
CREATE TABLE asset_lookup_outcomes (
    lookup_id UUID PRIMARY KEY REFERENCES asset_lookup_claims(id),
    outcome TEXT NOT NULL CHECK (outcome IN ('succeeded','failed')),
    asset_status TEXT CHECK (asset_status IN ('Active','Processing','Failed')),
    reason TEXT CHECK (reason IN ('invalid_configuration','destination_rejected','unavailable','transport','timeout','response_limit','invalid_response')),
    duration_ms BIGINT NOT NULL CHECK (duration_ms>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((outcome='succeeded')=(asset_status IS NOT NULL)),
    CHECK ((outcome='failed')=(reason IS NOT NULL))
);
CREATE TRIGGER immutable_asset_lookup_outcome BEFORE UPDATE OR DELETE ON asset_lookup_outcomes
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();

-- @niu-legacy-migration 0182_asset_lookup_results.sql 1590
-- Private descriptive results are encrypted separately from immutable audit.
CREATE TABLE asset_lookup_results (
    lookup_id UUID PRIMARY KEY REFERENCES asset_lookup_outcomes(lookup_id),
    ciphertext BYTEA CHECK (ciphertext IS NULL OR octet_length(ciphertext) BETWEEN 30 AND 131072),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp()+INTERVAL '24 hours'),
    deleted_at TIMESTAMPTZ,
    CHECK ((ciphertext IS NULL)=(deleted_at IS NOT NULL))
);
CREATE FUNCTION preserve_asset_lookup_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS NULL
       AND NEW.deleted_at IS NOT NULL AND NEW.lookup_id=OLD.lookup_id AND NEW.expires_at=OLD.expires_at THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'asset lookup results permit erasure only' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_asset_lookup_result BEFORE UPDATE OR DELETE ON asset_lookup_results
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_lookup_result();
CREATE INDEX asset_lookup_result_expiry ON asset_lookup_results(expires_at,lookup_id) WHERE ciphertext IS NOT NULL;
-- A deletion during an in-flight read must also prevent later content storage.
CREATE TABLE asset_lookup_result_deletions (
    lookup_id UUID PRIMARY KEY REFERENCES asset_lookup_claims(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_lookup_result_deletion BEFORE UPDATE OR DELETE ON asset_lookup_result_deletions
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();

-- @niu-legacy-migration 0183_asset_group_update_authorizations.sql 404
-- Metadata writes require separate review; existing grants remain unchanged.
ALTER TABLE asset_operation_authorizations
    DROP CONSTRAINT asset_operation_authorizations_operation_check;
ALTER TABLE asset_operation_authorizations
    ADD CONSTRAINT asset_operation_authorizations_operation_check
    CHECK (operation IN ('CreateAssetGroup','GetAssetGroup','ListAssets','GetAsset','UpdateAssetGroup'));

-- @niu-legacy-migration 0184_asset_group_update_intents.sql 2355
-- Immutable mutation identity/grant/digest are separate from erasable patch content.
CREATE TABLE asset_group_update_intents (
    id UUID PRIMARY KEY,
    intent_id UUID NOT NULL REFERENCES asset_group_create_intents(id),
    authorization_id UUID NOT NULL REFERENCES asset_operation_authorizations(id),
    patch_sha256 BYTEA NOT NULL CHECK (octet_length(patch_sha256)=32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_group_update_intent BEFORE UPDATE OR DELETE ON asset_group_update_intents
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE TABLE asset_group_update_patches (
    update_id UUID PRIMARY KEY REFERENCES asset_group_update_intents(id),
    ciphertext BYTEA CHECK (ciphertext IS NULL OR octet_length(ciphertext) BETWEEN 30 AND 8192),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (clock_timestamp()+INTERVAL '24 hours'),
    deleted_at TIMESTAMPTZ,
    CHECK ((ciphertext IS NULL)=(deleted_at IS NOT NULL))
);
CREATE FUNCTION preserve_asset_group_update_patch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS NULL
       AND NEW.deleted_at IS NOT NULL AND NEW.update_id=OLD.update_id AND NEW.expires_at=OLD.expires_at THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'asset group update patch permits erasure only' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_asset_group_update_patch BEFORE UPDATE OR DELETE ON asset_group_update_patches
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_group_update_patch();
CREATE INDEX asset_group_update_patch_expiry ON asset_group_update_patches(expires_at,update_id) WHERE ciphertext IS NOT NULL;
CREATE TABLE asset_group_update_claims (
    update_id UUID PRIMARY KEY REFERENCES asset_group_update_intents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_group_update_claim BEFORE UPDATE OR DELETE ON asset_group_update_claims
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
-- Operational hold survives uncertain completion; release requires reconciliation.
CREATE TABLE asset_group_update_holds (
    intent_id UUID PRIMARY KEY REFERENCES asset_group_create_intents(id),
    update_id UUID UNIQUE NOT NULL REFERENCES asset_group_update_intents(id)
);

-- @niu-legacy-migration 0185_asset_group_update_outcomes.sql 802
-- Acknowledgement is not read-back verification; unacknowledged dispatch is uncertain.
CREATE TABLE asset_group_update_outcomes (
    update_id UUID PRIMARY KEY REFERENCES asset_group_update_claims(update_id),
    outcome TEXT NOT NULL CHECK (outcome IN ('acknowledged','uncertain')),
    reason TEXT CHECK (reason IN ('invalid_configuration','destination_rejected','unavailable','transport','timeout','response_limit','invalid_response')),
    duration_ms BIGINT NOT NULL CHECK (duration_ms>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((outcome='uncertain')=(reason IS NOT NULL))
);
CREATE TRIGGER immutable_asset_group_update_outcome BEFORE UPDATE OR DELETE ON asset_group_update_outcomes
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();

-- @niu-legacy-migration 0186_asset_group_update_reads.sql 597
-- Fresh reads admitted after an acknowledged metadata mutation. No hold release.
CREATE TABLE asset_group_update_reads (
    read_id UUID PRIMARY KEY REFERENCES asset_group_read_claims(id),
    update_id UUID NOT NULL REFERENCES asset_group_update_outcomes(update_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX asset_group_update_reads_update ON asset_group_update_reads(update_id);
CREATE TRIGGER immutable_asset_group_update_read BEFORE UPDATE OR DELETE ON asset_group_update_reads
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();

-- @niu-legacy-migration 0187_asset_group_update_reconciliations.sql 555
-- A matching retained, update-bound read can reconcile acknowledged writes only.
CREATE TABLE asset_group_update_reconciliations (
    update_id UUID PRIMARY KEY REFERENCES asset_group_update_outcomes(update_id),
    read_id UUID NOT NULL UNIQUE REFERENCES asset_group_update_reads(read_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_group_update_reconciliation BEFORE UPDATE OR DELETE ON asset_group_update_reconciliations
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();

-- @niu-legacy-migration 0188_asset_read_deletion_compatibility.sql 779
-- Original 0174 deployments predate in-flight read deletion tombstones.
-- Current 0174 deployments already have them; preserve both receipt histories.
CREATE TABLE IF NOT EXISTS asset_group_read_result_deletions (
    read_id UUID PRIMARY KEY REFERENCES asset_group_read_claims(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='asset_group_read_result_deletions'::regclass
        AND tgname='immutable_asset_group_read_result_deletion') THEN
        CREATE TRIGGER immutable_asset_group_read_result_deletion
            BEFORE UPDATE OR DELETE ON asset_group_read_result_deletions
            FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
    END IF;
END $$;

-- @niu-legacy-migration 0189_branding_configuration.sql 832
-- Public deployment branding; secrets and arbitrary CSS do not belong here.
CREATE TABLE branding_configuration (
    singleton BOOLEAN PRIMARY KEY CHECK (singleton),
    revision BIGINT NOT NULL CHECK (revision>0),
    settings JSONB NOT NULL CHECK (jsonb_typeof(settings)='object'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE branding_configuration_events (
    revision BIGINT PRIMARY KEY CHECK (revision>0),
    settings JSONB NOT NULL CHECK (jsonb_typeof(settings)='object'),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_branding_configuration_event
    BEFORE UPDATE OR DELETE ON branding_configuration_events
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();

-- @niu-legacy-migration 0190_asset_group_delete_authorizations.sql 501
-- Cascading deletion requires its own review; existing grants stay unchanged.
-- Qualification is not destructive consent and never dispatches a mutation.
ALTER TABLE asset_operation_authorizations
    DROP CONSTRAINT asset_operation_authorizations_operation_check;
ALTER TABLE asset_operation_authorizations
    ADD CONSTRAINT asset_operation_authorizations_operation_check
    CHECK (operation IN ('CreateAssetGroup','GetAssetGroup','ListAssets','GetAsset','UpdateAssetGroup','DeleteAssetGroup'));

-- @niu-legacy-migration 0191_asset_group_deletion_consents.sql 1630
-- Specific, short-lived consent to irreversible deletion of a saved ordinary
-- group and every contained asset. No dispatch or automatic replay is enabled.
CREATE TABLE asset_group_deletion_consents (
    id UUID PRIMARY KEY,
    intent_id UUID NOT NULL REFERENCES asset_group_create_intents(id),
    authorization_id UUID NOT NULL REFERENCES asset_operation_authorizations(id),
    valid_for_seconds INTEGER NOT NULL CHECK (valid_for_seconds BETWEEN 1 AND 900),
    confirm_cascade BOOLEAN NOT NULL CHECK (confirm_cascade),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK ((actor_kind='operator')=(actor_id IS NOT NULL)),
    CHECK (expires_at>created_at AND expires_at<=created_at+INTERVAL '15 minutes')
);
CREATE TRIGGER immutable_asset_group_deletion_consent BEFORE UPDATE OR DELETE ON asset_group_deletion_consents
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE TABLE asset_group_deletion_consent_revocations (
    consent_id UUID PRIMARY KEY REFERENCES asset_group_deletion_consents(id),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((actor_kind='operator')=(actor_id IS NOT NULL))
);
CREATE TRIGGER immutable_asset_group_deletion_consent_revocation BEFORE UPDATE OR DELETE ON asset_group_deletion_consent_revocations
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();

-- @niu-legacy-migration 0192_asset_group_deletion_claims.sql 1324
-- A committed deletion claim permanently fences further group mutation. Neither
-- caller disconnect nor an uncertain outcome permits automatic replay.
CREATE TABLE asset_group_deletion_claims (
    consent_id UUID PRIMARY KEY REFERENCES asset_group_deletion_consents(id),
    intent_id UUID UNIQUE NOT NULL REFERENCES asset_group_create_intents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_group_deletion_claim BEFORE UPDATE OR DELETE ON asset_group_deletion_claims
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE TABLE asset_group_deletion_outcomes (
    consent_id UUID PRIMARY KEY REFERENCES asset_group_deletion_claims(consent_id),
    outcome TEXT NOT NULL CHECK (outcome IN ('acknowledged','uncertain')),
    reason TEXT CHECK (reason IN ('invalid_configuration','destination_rejected','unavailable','transport','timeout','response_limit','invalid_response')),
    duration_ms BIGINT NOT NULL CHECK (duration_ms>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((outcome='uncertain')=(reason IS NOT NULL))
);
CREATE TRIGGER immutable_asset_group_deletion_outcome BEFORE UPDATE OR DELETE ON asset_group_deletion_outcomes
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();

-- @niu-legacy-migration 0193_asset_create_authorizations.sql 521
-- Media ingestion has a separate reviewed grant; existing grants are unchanged.
-- Qualification alone does not establish processing consent or inspected bytes.
ALTER TABLE asset_operation_authorizations
    DROP CONSTRAINT asset_operation_authorizations_operation_check;
ALTER TABLE asset_operation_authorizations
    ADD CONSTRAINT asset_operation_authorizations_operation_check
    CHECK (operation IN ('CreateAssetGroup','GetAssetGroup','ListAssets','GetAsset','UpdateAssetGroup','DeleteAssetGroup','CreateAsset'));

-- @niu-legacy-migration 0194_inspected_image_sources.sql 1793
-- Private content storage, separate from immutable approval/accounting metadata.
-- This does not publish a URL or authorize Supplier ingestion.
CREATE TABLE inspected_image_sources (
    id UUID PRIMARY KEY,
    approval_id UUID NOT NULL REFERENCES image_processing_approvals(id),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    content_sha256 TEXT NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
    content_type TEXT NOT NULL CHECK(content_type IN ('image/png','image/jpeg','image/webp')),
    byte_length BIGINT NOT NULL CHECK(byte_length BETWEEN 1 AND 8388608),
    created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK(expires_at>created_at AND expires_at<=created_at+interval '15 minutes'),
    FOREIGN KEY(organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id)
);
CREATE TRIGGER immutable_inspected_image_source BEFORE UPDATE OR DELETE ON inspected_image_sources
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE inspected_image_source_content (
    source_id UUID PRIMARY KEY REFERENCES inspected_image_sources(id),
    ciphertext BYTEA NOT NULL CHECK(octet_length(ciphertext) BETWEEN 28 AND 8388736)
);
CREATE TRIGGER immutable_inspected_image_source_bytes BEFORE UPDATE ON inspected_image_source_content
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE inspected_image_source_erasures (
    source_id UUID PRIMARY KEY REFERENCES inspected_image_sources(id),
    erased_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_inspected_image_source_erasure BEFORE UPDATE OR DELETE ON inspected_image_source_erasures
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0195_inspected_image_source_approvals.sql 566
-- Every required workspace/key detector must approve the exact saved bytes.
-- Earlier private snapshots without this proof remain unavailable for handoff.
CREATE TABLE inspected_image_source_approvals (
    source_id UUID NOT NULL REFERENCES inspected_image_sources(id),
    approval_id UUID NOT NULL REFERENCES image_processing_approvals(id),
    PRIMARY KEY(source_id,approval_id)
);
CREATE TRIGGER immutable_inspected_image_source_approvals BEFORE UPDATE OR DELETE ON inspected_image_source_approvals
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0196_inspected_image_source_expiry.sql 166
-- Bounded encrypted-source retention maintenance; provenance stays immutable.
CREATE INDEX inspected_image_sources_expiry ON inspected_image_sources(expires_at,id);

-- @niu-legacy-migration 0197_asset_image_ingestion_consents.sql 1283
-- Exact source/destination ingestion consent; no URL publication or dispatch.
CREATE TABLE asset_image_ingestion_consents (
    id UUID PRIMARY KEY,
    source_id UUID NOT NULL REFERENCES inspected_image_sources(id),
    group_intent_id UUID NOT NULL REFERENCES asset_group_create_intents(id),
    authorization_id UUID NOT NULL REFERENCES asset_operation_authorizations(id),
    valid_for_seconds INTEGER NOT NULL CHECK(valid_for_seconds BETWEEN 1 AND 900),
    confirm_ingestion BOOLEAN NOT NULL CHECK(confirm_ingestion),
    created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK(expires_at>created_at AND expires_at<=created_at+interval '15 minutes')
);
CREATE TRIGGER immutable_asset_image_ingestion_consent BEFORE UPDATE OR DELETE ON asset_image_ingestion_consents
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE asset_image_ingestion_consent_revocations (
    consent_id UUID PRIMARY KEY REFERENCES asset_image_ingestion_consents(id),
    revoked_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_image_ingestion_consent_revocation BEFORE UPDATE OR DELETE ON asset_image_ingestion_consent_revocations
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0198_asset_image_ingestion_dispatch.sql 1316
-- One-shot handoff. Neither uncertainty nor disconnect authorizes replay.
CREATE TABLE asset_image_ingestion_claims (
    consent_id UUID PRIMARY KEY REFERENCES asset_image_ingestion_consents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_asset_image_ingestion_claim BEFORE UPDATE OR DELETE ON asset_image_ingestion_claims
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE asset_image_ingestion_outcomes (
    consent_id UUID PRIMARY KEY REFERENCES asset_image_ingestion_claims(consent_id),
    outcome TEXT NOT NULL CHECK(outcome IN ('accepted','uncertain')),
    upstream_asset_id TEXT CHECK(upstream_asset_id ~ '^asset-[A-Za-z0-9_-]+$' AND length(upstream_asset_id)<=128),
    reason TEXT CHECK(reason IN ('invalid_configuration','destination_rejected','unavailable','transport','timeout','response_limit','invalid_response')),
    duration_ms BIGINT NOT NULL CHECK(duration_ms>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK((outcome='accepted')=(upstream_asset_id IS NOT NULL)),
    CHECK((outcome='uncertain')=(reason IS NOT NULL))
);
CREATE TRIGGER immutable_asset_image_ingestion_outcome BEFORE UPDATE OR DELETE ON asset_image_ingestion_outcomes
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0199_asset_image_source_access.sql 1100
-- Short-lived bearer access to exact claimed bytes; only hashes are retained.
CREATE TABLE asset_image_source_access (
    token_sha256 BYTEA PRIMARY KEY CHECK(octet_length(token_sha256)=32),
    consent_id UUID UNIQUE NOT NULL REFERENCES asset_image_ingestion_claims(consent_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK(expires_at>created_at AND expires_at<=created_at+interval '60 seconds')
);
CREATE TRIGGER immutable_asset_image_source_access BEFORE UPDATE OR DELETE ON asset_image_source_access
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE asset_image_source_deliveries (
    token_sha256 BYTEA NOT NULL REFERENCES asset_image_source_access(token_sha256),
    ordinal SMALLINT NOT NULL CHECK(ordinal BETWEEN 1 AND 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(token_sha256,ordinal)
);
CREATE TRIGGER immutable_asset_image_source_delivery BEFORE UPDATE OR DELETE ON asset_image_source_deliveries
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0200_asset_image_ingestion_recovery.sql 180
-- Bounded interrupted-worker scans retain immutable claims and outcomes.
CREATE INDEX asset_image_ingestion_claim_recovery
ON asset_image_ingestion_claims(created_at,consent_id);

-- @niu-legacy-migration 0201_ingested_image_readiness.sql 1479
-- Readiness is a separately qualified original-account observation, not reuse.
CREATE TABLE ingested_image_readiness_claims (
    id UUID PRIMARY KEY,
    consent_id UUID NOT NULL REFERENCES asset_image_ingestion_outcomes(consent_id),
    authorization_id UUID NOT NULL REFERENCES asset_operation_authorizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX ingested_image_readiness_scope ON ingested_image_readiness_claims(consent_id,created_at);
CREATE INDEX ingested_image_readiness_recovery ON ingested_image_readiness_claims(created_at,id);
CREATE TRIGGER immutable_ingested_image_readiness_claim BEFORE UPDATE OR DELETE ON ingested_image_readiness_claims
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE ingested_image_readiness_outcomes (
    read_id UUID PRIMARY KEY REFERENCES ingested_image_readiness_claims(id),
    asset_status TEXT CHECK(asset_status IN ('Active','Processing','Failed')),
    reason TEXT CHECK(reason IN ('invalid_configuration','destination_rejected','unavailable','transport','timeout','response_limit','invalid_response')),
    duration_ms BIGINT NOT NULL CHECK(duration_ms>=0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK((asset_status IS NOT NULL)<>(reason IS NOT NULL))
);
CREATE TRIGGER immutable_ingested_image_readiness_outcome BEFORE UPDATE OR DELETE ON ingested_image_readiness_outcomes
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0202_request_failures.sql 1450
-- Content-free upstream diagnostics survive optional request-payload deletion.
-- A failure observation never establishes execution, usage or settlement state.
CREATE TABLE request_failures (
    attempt_id uuid PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN (
        'upstream_http_error', 'upstream_region_unavailable',
        'upstream_timeout', 'upstream_connection_error',
        'upstream_transport_error', 'upstream_invalid_response'
    )),
    upstream_http_status smallint,
    CHECK (
        (kind = 'upstream_region_unavailable' AND upstream_http_status IS NOT NULL AND upstream_http_status = 403)
        OR (kind = 'upstream_http_error' AND upstream_http_status IS NOT NULL
            AND upstream_http_status BETWEEN 100 AND 599
            AND upstream_http_status NOT BETWEEN 200 AND 299)
        OR (kind IN ('upstream_timeout', 'upstream_connection_error',
                     'upstream_transport_error', 'upstream_invalid_response')
            AND upstream_http_status IS NULL)
    )
);

CREATE FUNCTION preserve_request_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'request failure observation is immutable' USING ERRCODE='P0008';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_request_failure BEFORE UPDATE ON request_failures
    FOR EACH ROW EXECUTE FUNCTION preserve_request_failure();

-- @niu-legacy-migration 0203_media_recovery_protocols.sql 2770
-- Pin the protocol separately from mutable model capabilities. Do not invent a
-- historical protocol when the original configuration is no longer available.
CREATE TABLE media_recovery_protocols (
    attempt_id UUID PRIMARY KEY REFERENCES media_recovery_routes(attempt_id),
    channel TEXT NOT NULL CHECK (length(channel) BETWEEN 1 AND 256)
);

INSERT INTO media_recovery_protocols(attempt_id,channel)
SELECT r.attempt_id,m.capabilities->'video_schema'->>'channel'
FROM media_recovery_routes r
JOIN attempts a ON a.id=r.attempt_id
JOIN vendors v ON v.id=r.vendor_id
JOIN vendor_models m ON m.alias=a.resource_id AND m.vendor_id=r.vendor_id
WHERE v.revision=r.vendor_revision AND m.revision=r.model_revision
  AND v.adapter=r.adapter AND v.api_base=r.api_base
  AND m.upstream_model=r.upstream_model
  AND m.capabilities->'video_schema'->>'revision'=r.schema_revision
  AND length(m.capabilities->'video_schema'->>'channel') BETWEEN 1 AND 256;

CREATE TRIGGER immutable_media_recovery_protocols BEFORE UPDATE OR DELETE
    ON media_recovery_protocols FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION validate_media_recovery_protocol() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM media_recovery_routes r JOIN attempts a ON a.id=r.attempt_id
        JOIN vendors v ON v.id=r.vendor_id
        JOIN vendor_models m ON m.alias=a.resource_id AND m.vendor_id=r.vendor_id
        WHERE r.attempt_id=NEW.attempt_id AND a.dispatched_at IS NULL
          AND v.revision=r.vendor_revision AND m.revision=r.model_revision
          AND v.adapter=r.adapter AND v.api_base=r.api_base
          AND m.upstream_model=r.upstream_model
          AND m.capabilities->'video_schema'->>'revision'=r.schema_revision
          AND m.capabilities->'video_schema'->>'channel'=NEW.channel
    ) THEN
        RAISE EXCEPTION 'media recovery protocol must match original unsent route' USING ERRCODE='P0008';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_media_recovery_protocol BEFORE INSERT ON media_recovery_protocols
    FOR EACH ROW EXECUTE FUNCTION validate_media_recovery_protocol();

CREATE FUNCTION require_media_recovery_protocol() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution='may_have_executed' AND OLD.execution='not_sent'
        AND EXISTS (SELECT 1 FROM media_recovery_routes WHERE attempt_id=NEW.id)
        AND NOT EXISTS (SELECT 1 FROM media_recovery_protocols WHERE attempt_id=NEW.id) THEN
        RAISE EXCEPTION 'video dispatch requires original recovery protocol' USING ERRCODE='P0008';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_media_recovery_protocol BEFORE UPDATE ON attempts
    FOR EACH ROW EXECUTE FUNCTION require_media_recovery_protocol();

-- @niu-legacy-migration 0204_media_submission_keys.sql 819
-- A submission key and its original attempt commit atomically. Never expire a
-- key into permission to create a second paid job. Store digests, not prompts.
CREATE TABLE media_submission_keys (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_digest BYTEA NOT NULL CHECK (octet_length(key_digest) = 32),
    request_digest BYTEA NOT NULL CHECK (octet_length(request_digest) = 32),
    attempt_id UUID NOT NULL UNIQUE,
    PRIMARY KEY (organization_id, project_id, key_digest),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES attempts(organization_id, project_id, id)
        DEFERRABLE INITIALLY DEFERRED
);
CREATE TRIGGER immutable_media_submission_keys BEFORE UPDATE OR DELETE
ON media_submission_keys FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0205_key_spending_limits.sql 7220
-- Secret rotation retains one spending identity and all historical liabilities.
ALTER TABLE api_keys ADD COLUMN spending_root_id UUID;
WITH RECURSIVE lineage AS (
    SELECT k.id, k.id AS root FROM api_keys k
    WHERE NOT EXISTS (SELECT 1 FROM key_audit_events e WHERE e.action='rotated' AND e.replacement_key_id=k.id)
    UNION ALL
    SELECT e.replacement_key_id, l.root FROM lineage l
    JOIN key_audit_events e ON e.key_id=l.id AND e.action='rotated'
    WHERE e.replacement_key_id IS NOT NULL
)
UPDATE api_keys k SET spending_root_id=l.root FROM lineage l WHERE l.id=k.id;
ALTER TABLE api_keys ALTER COLUMN spending_root_id SET NOT NULL;
ALTER TABLE api_keys ADD FOREIGN KEY (organization_id,project_id,spending_root_id)
    REFERENCES api_keys(organization_id,project_id,id);
CREATE INDEX api_keys_spending_root ON api_keys(spending_root_id,id);
CREATE FUNCTION protect_key_spending_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='INSERT' THEN
        NEW.spending_root_id := COALESCE(NEW.spending_root_id,NEW.id);
    ELSIF NEW.spending_root_id IS DISTINCT FROM OLD.spending_root_id THEN
        RAISE EXCEPTION 'key spending identity is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_key_spending_identity BEFORE INSERT OR UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION protect_key_spending_identity();

CREATE TABLE customer_key_spending_limits (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    spending_root_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    limit_nanos BIGINT CHECK (limit_nanos>=0), -- NULL explicitly restores unlimited.
    revision BIGINT NOT NULL CHECK (revision>0),
    PRIMARY KEY (organization_id,project_id,spending_root_id,currency),
    FOREIGN KEY (organization_id,project_id,spending_root_id) REFERENCES api_keys(organization_id,project_id,id),
    FOREIGN KEY (organization_id,account_id,currency) REFERENCES customer_balance_accounts(organization_id,id,currency)
);
CREATE FUNCTION niu_customer_attempt_spending_root(p_attempt UUID)
RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT k.spending_root_id FROM attempts a
    LEFT JOIN inspected_guardrail_bindings b ON b.attempt_id=a.id
    JOIN api_keys k ON k.id=COALESCE(a.api_key_id,b.key_id)
        AND k.organization_id=a.organization_id AND k.project_id=a.project_id
    WHERE a.id=p_attempt
$$;
CREATE FUNCTION niu_customer_key_committed(p_root UUID,p_account UUID)
RETURNS NUMERIC LANGUAGE sql VOLATILE AS $$
    SELECT COALESCE((SELECT -SUM(e.amount_nanos) FROM customer_balance_entries e
        WHERE e.account_id=p_account AND e.kind='charge'
          AND niu_customer_attempt_spending_root(e.attempt_id)=p_root),0)
      - COALESCE((SELECT SUM(r.amount_nanos) FROM customer_balance_entries r
        JOIN customer_balance_entries c ON c.id=r.reverses_entry_id
        WHERE r.account_id=p_account AND r.kind='refund' AND c.kind='charge'
          AND niu_customer_attempt_spending_root(c.attempt_id)=p_root),0)
      + COALESCE((SELECT SUM(r.amount_nanos) FROM customer_balance_reservations r
        WHERE r.account_id=p_account AND r.released_at IS NULL
          AND niu_customer_attempt_spending_root(r.attempt_id)=p_root
          AND NOT EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.attempt_id=r.attempt_id AND e.kind='charge')),0)
$$;
CREATE FUNCTION protect_customer_key_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'key limits cannot be deleted'; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR UPDATE;
    IF (TG_OP='INSERT' AND NEW.revision<>1) OR
       (TG_OP='UPDATE' AND (NEW.revision<>OLD.revision+1 OR
        ROW(NEW.organization_id,NEW.project_id,NEW.spending_root_id,NEW.account_id,NEW.currency)
        IS DISTINCT FROM ROW(OLD.organization_id,OLD.project_id,OLD.spending_root_id,OLD.account_id,OLD.currency))) THEN
        RAISE EXCEPTION 'invalid key limit revision' USING ERRCODE='23514';
    END IF;
    IF NEW.limit_nanos IS NOT NULL AND EXISTS (
        SELECT 1 FROM customer_balance_reservations r JOIN attempts a ON a.id=r.attempt_id
        WHERE r.account_id=NEW.account_id AND a.project_id=NEW.project_id
          AND r.released_at IS NULL AND niu_customer_attempt_spending_root(r.attempt_id) IS NULL
    ) THEN
        RAISE EXCEPTION 'unattributed liabilities require reconciliation before setting a key limit' USING ERRCODE='23514';
    END IF;
    IF NEW.limit_nanos IS NOT NULL AND niu_customer_key_committed(NEW.spending_root_id,NEW.account_id)>NEW.limit_nanos THEN
        RAISE EXCEPTION 'key limit below committed liability' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_customer_key_limit BEFORE INSERT OR UPDATE OR DELETE ON customer_key_spending_limits
    FOR EACH ROW EXECUTE FUNCTION protect_customer_key_limit();
CREATE FUNCTION enforce_customer_key_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root UUID; maximum BIGINT; workspace UUID;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR UPDATE;
    root := niu_customer_attempt_spending_root(NEW.attempt_id);
    SELECT project_id INTO workspace FROM attempts WHERE id=NEW.attempt_id;
    IF root IS NULL AND EXISTS(SELECT 1 FROM customer_key_spending_limits
        WHERE organization_id=NEW.organization_id AND project_id=workspace
          AND account_id=NEW.account_id AND limit_nanos IS NOT NULL) THEN
        RAISE EXCEPTION 'key attribution required for bounded spending' USING ERRCODE='23514';
    END IF;
    SELECT limit_nanos INTO maximum FROM customer_key_spending_limits
        WHERE organization_id=NEW.organization_id AND spending_root_id=root AND account_id=NEW.account_id;
    IF maximum IS NOT NULL AND niu_customer_key_committed(root,NEW.account_id)+NEW.amount_nanos>maximum THEN
        RAISE EXCEPTION 'customer key spending limit exceeded' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_customer_key_reservation BEFORE INSERT ON customer_balance_reservations
    FOR EACH ROW EXECUTE FUNCTION enforce_customer_key_reservation();

CREATE TABLE customer_key_limit_history (
    organization_id UUID NOT NULL, project_id UUID NOT NULL, spending_root_id UUID NOT NULL,
    currency TEXT NOT NULL, revision BIGINT NOT NULL, limit_nanos BIGINT CHECK(limit_nanos>=0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('installation','member')),
    actor_name TEXT NOT NULL,
    actor_operator_id UUID REFERENCES admin_operators(id),
    CHECK ((actor_kind='installation' AND actor_operator_id IS NULL) OR (actor_kind='member' AND actor_operator_id IS NOT NULL)),
    PRIMARY KEY(organization_id,project_id,spending_root_id,currency,revision),
    FOREIGN KEY(organization_id,project_id,spending_root_id,currency)
        REFERENCES customer_key_spending_limits(organization_id,project_id,spending_root_id,currency)
);
CREATE TRIGGER immutable_customer_key_limit_history BEFORE UPDATE OR DELETE ON customer_key_limit_history
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0206_key_ip_policies.sql 1428
CREATE TABLE key_ip_policies (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    spending_root_id UUID NOT NULL,
    allowed_cidrs TEXT[], -- NULL unrestricted; empty array denies every source.
    revision BIGINT NOT NULL CHECK(revision>0),
    PRIMARY KEY(organization_id,project_id,spending_root_id),
    FOREIGN KEY(organization_id,project_id,spending_root_id) REFERENCES api_keys(organization_id,project_id,id),
    CHECK(allowed_cidrs IS NULL OR cardinality(allowed_cidrs)<=64)
);
CREATE TABLE key_ip_policy_history (
    organization_id UUID NOT NULL, project_id UUID NOT NULL, spending_root_id UUID NOT NULL,
    revision BIGINT NOT NULL CHECK(revision>0), allowed_cidrs TEXT[],
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('installation','member')),
    actor_name TEXT NOT NULL, actor_operator_id UUID REFERENCES admin_operators(id),
    PRIMARY KEY(organization_id,project_id,spending_root_id,revision),
    FOREIGN KEY(organization_id,project_id,spending_root_id) REFERENCES key_ip_policies(organization_id,project_id,spending_root_id),
    CHECK((actor_kind='installation' AND actor_operator_id IS NULL) OR (actor_kind='member' AND actor_operator_id IS NOT NULL))
);
CREATE TRIGGER immutable_key_ip_policy_history BEFORE UPDATE OR DELETE ON key_ip_policy_history
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0207_key_request_rate_limits.sql 3281
-- Rolling-window dispatch admission shared across gateway instances and key rotations.
CREATE TABLE key_request_rate_limits (
    organization_id UUID NOT NULL, project_id UUID NOT NULL, spending_root_id UUID NOT NULL,
    requests_per_minute BIGINT CHECK(requests_per_minute BETWEEN 0 AND 1000000),
    revision BIGINT NOT NULL CHECK(revision > 0),
    UNIQUE(spending_root_id),
    PRIMARY KEY(organization_id,project_id,spending_root_id),
    FOREIGN KEY(organization_id,project_id,spending_root_id) REFERENCES api_keys(organization_id,project_id,id)
);
CREATE TABLE key_request_rate_history (
    organization_id UUID NOT NULL, project_id UUID NOT NULL, spending_root_id UUID NOT NULL,
    revision BIGINT NOT NULL, requests_per_minute BIGINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('installation','member')),
    actor_name TEXT NOT NULL, actor_operator_id UUID REFERENCES admin_operators(id),
    PRIMARY KEY(organization_id,project_id,spending_root_id,revision),
    FOREIGN KEY(organization_id,project_id,spending_root_id) REFERENCES key_request_rate_limits(organization_id,project_id,spending_root_id),
    CHECK((actor_kind='installation' AND actor_operator_id IS NULL) OR (actor_kind='member' AND actor_operator_id IS NOT NULL))
);
CREATE TRIGGER immutable_key_request_rate_history BEFORE UPDATE OR DELETE ON key_request_rate_history
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE key_request_rate_admissions (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    spending_root_id UUID NOT NULL REFERENCES api_keys(id),
    admitted_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX key_request_rate_admissions_window ON key_request_rate_admissions(spending_root_id,admitted_at);
CREATE FUNCTION niu_enforce_key_request_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    root UUID;
    rpm BIGINT;
    admitted BIGINT;
    checked_at TIMESTAMPTZ;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN
        RETURN NEW;
    END IF;
    SELECT spending_root_id INTO root FROM api_keys WHERE id=NEW.api_key_id;
    IF root IS NULL THEN RETURN NEW; END IF;
    -- Lock the configured policy, not the key row: dispatch already holds key SHARE locks.
    SELECT requests_per_minute INTO rpm FROM key_request_rate_limits
        WHERE spending_root_id=root FOR UPDATE;
    IF NOT FOUND THEN RETURN NEW; END IF;
    checked_at := clock_timestamp();
    DELETE FROM key_request_rate_admissions WHERE spending_root_id=root AND admitted_at <= checked_at - INTERVAL '60 seconds';
    IF rpm IS NOT NULL THEN
        SELECT count(*) INTO admitted FROM key_request_rate_admissions
            WHERE spending_root_id=root AND admitted_at > checked_at - INTERVAL '60 seconds';
        IF admitted >= rpm THEN
            RAISE EXCEPTION 'API key request rate exhausted' USING ERRCODE='P0020';
        END IF;
    END IF;
    INSERT INTO key_request_rate_admissions(attempt_id,spending_root_id,admitted_at)
        VALUES(NEW.id,root,checked_at);
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_key_request_rate AFTER INSERT OR UPDATE OF dispatched_at ON attempts
    FOR EACH ROW EXECUTE FUNCTION niu_enforce_key_request_rate();

-- @niu-legacy-migration 0208_key_concurrency_limits.sql 2912
-- Concurrent dispatch admission shared across gateway instances and key rotations.
CREATE TABLE key_concurrency_limits (
    organization_id UUID NOT NULL, project_id UUID NOT NULL, spending_root_id UUID NOT NULL,
    max_concurrent_requests BIGINT CHECK(max_concurrent_requests BETWEEN 0 AND 10000),
    revision BIGINT NOT NULL CHECK(revision > 0),
    UNIQUE(spending_root_id),
    PRIMARY KEY(organization_id,project_id,spending_root_id),
    FOREIGN KEY(organization_id,project_id,spending_root_id) REFERENCES api_keys(organization_id,project_id,id)
);
CREATE TABLE key_concurrency_history (
    organization_id UUID NOT NULL, project_id UUID NOT NULL, spending_root_id UUID NOT NULL,
    revision BIGINT NOT NULL, max_concurrent_requests BIGINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('installation','member')),
    actor_name TEXT NOT NULL, actor_operator_id UUID REFERENCES admin_operators(id),
    PRIMARY KEY(organization_id,project_id,spending_root_id,revision),
    FOREIGN KEY(organization_id,project_id,spending_root_id) REFERENCES key_concurrency_limits(organization_id,project_id,spending_root_id),
    CHECK((actor_kind='installation' AND actor_operator_id IS NULL) OR (actor_kind='member' AND actor_operator_id IS NOT NULL))
);
CREATE TRIGGER immutable_key_concurrency_history BEFORE UPDATE OR DELETE ON key_concurrency_history
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE INDEX key_concurrency_unresolved_attempts ON attempts(api_key_id)
    WHERE dispatched_at IS NOT NULL AND execution='may_have_executed';
CREATE FUNCTION niu_enforce_key_concurrency() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    root UUID;
    maximum BIGINT;
    running BIGINT;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN RETURN NEW; END IF;
    SELECT spending_root_id INTO root FROM api_keys WHERE id=NEW.api_key_id;
    IF root IS NULL THEN RETURN NEW; END IF;
    SELECT max_concurrent_requests INTO maximum FROM key_concurrency_limits
        WHERE spending_root_id=root FOR UPDATE;
    IF NOT FOUND OR maximum IS NULL THEN RETURN NEW; END IF;
    -- Count durable unresolved dispatches, including work admitted before policy activation.
    -- Terminal evidence releases occupancy; disconnects and elapsed time do not.
    SELECT count(*) INTO running FROM attempts a JOIN api_keys k ON k.id=a.api_key_id
        WHERE k.spending_root_id=root AND a.id<>NEW.id
        AND a.dispatched_at IS NOT NULL AND a.execution='may_have_executed';
    IF running >= maximum THEN
        RAISE EXCEPTION 'API key concurrent request limit reached' USING ERRCODE='P0021';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_key_concurrency AFTER INSERT OR UPDATE OF dispatched_at ON attempts
    FOR EACH ROW EXECUTE FUNCTION niu_enforce_key_concurrency();

-- @niu-legacy-migration 0209_key_dispatch_windows.sql 201
-- Bound recent usage and latest-use lookups to each key's dispatched history.
CREATE INDEX attempts_key_dispatch_window ON attempts(api_key_id,dispatched_at DESC)
    WHERE dispatched_at IS NOT NULL;

-- @niu-legacy-migration 0210_key_token_rate_limits.sql 4201
-- Token budget admission shared across gateway instances and key rotations.
CREATE TABLE key_token_rate_limits (
    organization_id UUID NOT NULL, project_id UUID NOT NULL, spending_root_id UUID NOT NULL,
    tokens_per_minute BIGINT CHECK(tokens_per_minute BETWEEN 0 AND 1000000000000),
    revision BIGINT NOT NULL CHECK(revision > 0),
    UNIQUE(spending_root_id),
    PRIMARY KEY(organization_id,project_id,spending_root_id),
    FOREIGN KEY(organization_id,project_id,spending_root_id) REFERENCES api_keys(organization_id,project_id,id)
);
CREATE TABLE key_token_rate_history (
    organization_id UUID NOT NULL, project_id UUID NOT NULL, spending_root_id UUID NOT NULL,
    revision BIGINT NOT NULL, tokens_per_minute BIGINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('installation','member')),
    actor_name TEXT NOT NULL, actor_operator_id UUID REFERENCES admin_operators(id),
    PRIMARY KEY(organization_id,project_id,spending_root_id,revision),
    FOREIGN KEY(organization_id,project_id,spending_root_id) REFERENCES key_token_rate_limits(organization_id,project_id,spending_root_id),
    CHECK((actor_kind='installation' AND actor_operator_id IS NULL) OR (actor_kind='member' AND actor_operator_id IS NOT NULL))
);
CREATE TRIGGER immutable_key_token_rate_history BEFORE UPDATE OR DELETE ON key_token_rate_history
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();


CREATE TABLE key_attempt_token_bounds (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id) DEFERRABLE INITIALLY DEFERRED,
    token_bound BIGINT NOT NULL CHECK(token_bound>0),
    estimator TEXT NOT NULL CHECK(estimator='serialized-utf8-plus-output-v1')
);
CREATE TRIGGER immutable_key_attempt_token_bounds BEFORE UPDATE OR DELETE ON key_attempt_token_bounds
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE FUNCTION niu_enforce_key_token_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE root UUID; maximum BIGINT; requested BIGINT; committed NUMERIC; unbounded BIGINT;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN RETURN NEW; END IF;
    SELECT spending_root_id INTO root FROM api_keys WHERE id=NEW.api_key_id;
    IF root IS NULL THEN RETURN NEW; END IF;
    SELECT tokens_per_minute INTO maximum FROM key_token_rate_limits WHERE spending_root_id=root FOR UPDATE;
    IF NOT FOUND OR maximum IS NULL THEN RETURN NEW; END IF;
    IF maximum=0 THEN RAISE EXCEPTION 'API key token rate exhausted' USING ERRCODE='P0022'; END IF;
    SELECT token_bound INTO requested FROM key_attempt_token_bounds WHERE attempt_id=NEW.id;
    IF requested IS NULL THEN RAISE EXCEPTION 'Token budget requires supported bounded text input' USING ERRCODE='P0023'; END IF;
    SELECT COALESCE(sum(CASE WHEN a.execution='confirmed_completed' AND a.usage_confidence='provider_reported' AND a.prompt_tokens IS NOT NULL AND a.completion_tokens IS NOT NULL THEN a.prompt_tokens::numeric+a.completion_tokens ELSE b.token_bound::numeric END),0),
        count(*) FILTER(WHERE b.token_bound IS NULL AND NOT(a.execution='confirmed_completed' AND a.usage_confidence='provider_reported' AND a.prompt_tokens IS NOT NULL AND a.completion_tokens IS NOT NULL))
        INTO committed,unbounded
        FROM attempts a JOIN api_keys k ON k.id=a.api_key_id LEFT JOIN key_attempt_token_bounds b ON b.attempt_id=a.id
        WHERE k.spending_root_id=root AND a.id<>NEW.id AND a.dispatched_at IS NOT NULL
        AND a.execution<>'confirmed_not_executed'
        AND (a.execution<>'confirmed_completed' OR a.usage_confidence IS DISTINCT FROM 'provider_reported' OR a.prompt_tokens IS NULL OR a.completion_tokens IS NULL OR a.completed_at>clock_timestamp()-interval '60 seconds');
    IF unbounded>0 THEN RAISE EXCEPTION 'Existing unknown usage has no token budget' USING ERRCODE='P0023'; END IF;
    IF committed+requested>maximum THEN RAISE EXCEPTION 'API key token rate exhausted' USING ERRCODE='P0022'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_key_token_rate AFTER INSERT OR UPDATE OF dispatched_at ON attempts
    FOR EACH ROW EXECUTE FUNCTION niu_enforce_key_token_rate();

-- @niu-legacy-migration 0211_key_token_budget_snapshot.sql 3513
-- Separate known completions from unresolved reservations so historical completed
-- requests can use a time-range index instead of a lineage-wide OR scan.
CREATE INDEX attempts_key_known_token_completion ON attempts(api_key_id,completed_at DESC)
    INCLUDE(prompt_tokens,completion_tokens)
    WHERE dispatched_at IS NOT NULL AND execution='confirmed_completed'
      AND usage_confidence='provider_reported' AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL;
CREATE INDEX attempts_key_unknown_token_usage ON attempts(api_key_id)
    WHERE dispatched_at IS NOT NULL AND execution<>'confirmed_not_executed'
      AND NOT(execution='confirmed_completed' AND usage_confidence='provider_reported' AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL);
CREATE FUNCTION niu_key_token_budget(root UUID, excluded UUID, as_of TIMESTAMPTZ)
RETURNS TABLE(known_tokens NUMERIC,reserved_tokens NUMERIC,unbounded_requests BIGINT)
LANGUAGE SQL STABLE AS $$
    SELECT known.total,pending.total,pending.unbounded
    FROM (
        SELECT COALESCE(sum(a.prompt_tokens::numeric+a.completion_tokens),0) AS total
        FROM attempts a JOIN api_keys k ON k.id=a.api_key_id
        WHERE k.spending_root_id=root AND (excluded IS NULL OR a.id<>excluded)
          AND a.dispatched_at IS NOT NULL AND a.execution='confirmed_completed'
          AND a.usage_confidence='provider_reported' AND a.prompt_tokens IS NOT NULL AND a.completion_tokens IS NOT NULL
          AND a.completed_at>as_of-interval '60 seconds'
    ) known CROSS JOIN (
        SELECT COALESCE(sum(b.token_bound::numeric),0) AS total,count(*) FILTER(WHERE b.token_bound IS NULL) AS unbounded
        FROM attempts a JOIN api_keys k ON k.id=a.api_key_id LEFT JOIN key_attempt_token_bounds b ON b.attempt_id=a.id
        WHERE k.spending_root_id=root AND (excluded IS NULL OR a.id<>excluded)
          AND a.dispatched_at IS NOT NULL AND a.execution<>'confirmed_not_executed'
          AND NOT(a.execution='confirmed_completed' AND a.usage_confidence='provider_reported' AND a.prompt_tokens IS NOT NULL AND a.completion_tokens IS NOT NULL)
    ) pending;
$$;
CREATE OR REPLACE FUNCTION niu_enforce_key_token_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE root UUID; maximum BIGINT; requested BIGINT; committed NUMERIC; unbounded BIGINT; checked_at TIMESTAMPTZ;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN RETURN NEW; END IF;
    SELECT spending_root_id INTO root FROM api_keys WHERE id=NEW.api_key_id;
    IF root IS NULL THEN RETURN NEW; END IF;
    SELECT tokens_per_minute INTO maximum FROM key_token_rate_limits WHERE spending_root_id=root FOR UPDATE;
    IF NOT FOUND OR maximum IS NULL THEN RETURN NEW; END IF;
    IF maximum=0 THEN RAISE EXCEPTION 'API key token rate exhausted' USING ERRCODE='P0022'; END IF;
    SELECT token_bound INTO requested FROM key_attempt_token_bounds WHERE attempt_id=NEW.id;
    IF requested IS NULL THEN RAISE EXCEPTION 'Token budget requires supported bounded text input' USING ERRCODE='P0023'; END IF;
    checked_at := clock_timestamp();
    SELECT known_tokens+reserved_tokens,unbounded_requests INTO committed,unbounded
        FROM niu_key_token_budget(root,NEW.id,checked_at);
    IF unbounded>0 THEN RAISE EXCEPTION 'Existing unknown usage has no token budget' USING ERRCODE='P0023'; END IF;
    IF committed+requested>maximum THEN RAISE EXCEPTION 'API key token rate exhausted' USING ERRCODE='P0022'; END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0212_managed_attempt_routes.sql 2516
-- Resolution evidence contains identifiers/revisions only, never credentials.
CREATE TABLE managed_attempt_routes (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id) DEFERRABLE INITIALLY DEFERRED,
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    model_alias TEXT NOT NULL REFERENCES vendor_models(alias),
    vendor_revision BIGINT NOT NULL CHECK (vendor_revision > 0),
    model_revision BIGINT NOT NULL CHECK (model_revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE FUNCTION protect_managed_attempt_route() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'managed route binding is immutable' USING ERRCODE='P0024';
    END IF;
    IF EXISTS (SELECT 1 FROM attempts WHERE id=NEW.attempt_id AND execution<>'not_sent') THEN
        RAISE EXCEPTION 'managed route must bind before dispatch' USING ERRCODE='P0024';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_managed_attempt_route BEFORE INSERT OR UPDATE OR DELETE
    ON managed_attempt_routes FOR EACH ROW EXECUTE FUNCTION protect_managed_attempt_route();

CREATE FUNCTION recheck_managed_attempt_route() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE binding managed_attempt_routes%ROWTYPE;
BEGIN
    IF NEW.execution<>'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.execution<>'not_sent' THEN RETURN NEW; END IF;
    SELECT * INTO binding FROM managed_attempt_routes WHERE attempt_id=NEW.id;
    IF NOT FOUND THEN RETURN NEW; END IF; -- Static/legacy dispatch remains compatible.
    PERFORM id FROM vendors WHERE id=binding.vendor_id FOR SHARE;
    PERFORM alias FROM vendor_models WHERE alias=binding.model_alias FOR SHARE;
    IF NOT EXISTS (
        SELECT 1 FROM vendor_models m JOIN vendors v ON v.id=m.vendor_id
        WHERE m.alias=binding.model_alias AND m.alias=NEW.resource_id
          AND v.id=binding.vendor_id AND v.enabled AND m.enabled
          AND v.revision=binding.vendor_revision AND m.revision=binding.model_revision
          AND v.adapter=NEW.dispatch_provider
          AND NOT EXISTS (SELECT 1 FROM personal_vendor_ownership o
              WHERE o.vendor_id=v.id AND o.organization_id<>NEW.organization_id)
    ) THEN
        RAISE EXCEPTION 'managed route changed before dispatch' USING ERRCODE='P0024';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER recheck_managed_attempt_route BEFORE INSERT OR UPDATE OF execution
    ON attempts FOR EACH ROW EXECUTE FUNCTION recheck_managed_attempt_route();

-- @niu-legacy-migration 0213_model_route_pools.sql 9695
-- Customer aliases remain distinct from selected credential/model mappings.
CREATE TABLE model_route_pools (
    alias TEXT PRIMARY KEY CHECK (length(alias) BETWEEN 1 AND 200 AND alias=btrim(alias)),
    organization_id UUID REFERENCES organizations(id),
    enabled BOOLEAN NOT NULL,
    revision BIGINT NOT NULL CHECK (revision>0),
    candidates JSONB NOT NULL CHECK (jsonb_typeof(candidates)='array' AND jsonb_array_length(candidates) BETWEEN 1 AND 64)
);
CREATE TABLE model_route_pool_history (
    alias TEXT NOT NULL REFERENCES model_route_pools(alias),
    revision BIGINT NOT NULL,
    organization_id UUID REFERENCES organizations(id),
    enabled BOOLEAN NOT NULL,
    candidates JSONB NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(alias,revision)
);
CREATE FUNCTION protect_model_route_pool() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND
        (NEW.alias<>OLD.alias OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.revision<>OLD.revision+1))
        OR (TG_OP='INSERT' AND NEW.revision<>1) THEN
        RAISE EXCEPTION 'route pool identity or revision conflict' USING ERRCODE='P0024';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_model_route_pool BEFORE INSERT OR UPDATE OR DELETE ON model_route_pools
    FOR EACH ROW EXECUTE FUNCTION protect_model_route_pool();
CREATE FUNCTION protect_model_route_pool_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'route pool history is immutable' USING ERRCODE='P0024'; END;
$$;
CREATE TRIGGER protect_model_route_pool_history BEFORE UPDATE OR DELETE ON model_route_pool_history
    FOR EACH ROW EXECUTE FUNCTION protect_model_route_pool_history();
ALTER TABLE managed_attempt_routes ADD COLUMN pool_alias TEXT REFERENCES model_route_pools(alias);
ALTER TABLE managed_attempt_routes ADD COLUMN pool_revision BIGINT;
ALTER TABLE managed_attempt_routes ADD CHECK ((pool_alias IS NULL)=(pool_revision IS NULL));
ALTER TABLE managed_attempt_routes ADD FOREIGN KEY(pool_alias,pool_revision) REFERENCES model_route_pool_history(alias,revision);

CREATE OR REPLACE FUNCTION recheck_managed_attempt_route() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE binding managed_attempt_routes%ROWTYPE;
BEGIN
    IF NEW.execution<>'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.execution<>'not_sent' THEN RETURN NEW; END IF;
    SELECT * INTO binding FROM managed_attempt_routes WHERE attempt_id=NEW.id;
    IF NOT FOUND THEN RETURN NEW; END IF; -- Static/legacy dispatch remains compatible.
    IF binding.pool_alias IS NOT NULL THEN
        PERFORM alias FROM model_route_pools WHERE alias=binding.pool_alias FOR SHARE;
        IF NOT EXISTS (
            SELECT 1 FROM model_route_pools p
            WHERE p.alias=binding.pool_alias AND p.alias=NEW.resource_id
              AND p.enabled AND p.revision=binding.pool_revision
              AND (p.organization_id IS NULL OR p.organization_id=NEW.organization_id)
              AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.candidates) c
                  WHERE c->>'alias'=binding.model_alias AND (c->>'enabled')::boolean)
              AND ((p.organization_id IS NULL AND NOT EXISTS(
                  SELECT 1 FROM personal_vendor_ownership o WHERE o.vendor_id=binding.vendor_id))
                  OR EXISTS(SELECT 1 FROM personal_vendor_ownership o
                      WHERE o.vendor_id=binding.vendor_id AND o.organization_id=p.organization_id))
        ) THEN
            RAISE EXCEPTION 'route pool changed before dispatch' USING ERRCODE='P0024';
        END IF;
    END IF;
    PERFORM id FROM vendors WHERE id=binding.vendor_id FOR SHARE;
    PERFORM alias FROM vendor_models WHERE alias=binding.model_alias FOR SHARE;
    IF NOT EXISTS (
        SELECT 1 FROM vendor_models m JOIN vendors v ON v.id=m.vendor_id
        WHERE m.alias=binding.model_alias AND (binding.pool_alias=NEW.resource_id OR (binding.pool_alias IS NULL AND m.alias=NEW.resource_id))
          AND v.id=binding.vendor_id AND v.enabled AND m.enabled
          AND v.revision=binding.vendor_revision AND m.revision=binding.model_revision
          AND v.adapter=NEW.dispatch_provider
          AND NOT EXISTS (SELECT 1 FROM personal_vendor_ownership o
              WHERE o.vendor_id=v.id AND o.organization_id<>NEW.organization_id)
    ) THEN
        RAISE EXCEPTION 'managed route changed before dispatch' USING ERRCODE='P0024';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_personal_attempt_route() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'personal attempt route is immutable' USING ERRCODE='P0008';
    END IF;
    -- Lock the credential before the model, matching model configuration writes.
    PERFORM id FROM vendors WHERE id=NEW.vendor_id FOR SHARE;
    PERFORM m.alias FROM vendor_models m JOIN attempts a ON COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=a.id),a.resource_id)=m.alias
        WHERE a.id=NEW.attempt_id FOR SHARE OF m;
    PERFORM id FROM attempts WHERE id=NEW.attempt_id FOR UPDATE;
    IF NOT EXISTS (
        SELECT 1 FROM attempts a
        JOIN vendor_models m ON m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=a.id),a.resource_id)
        JOIN vendors v ON v.id=m.vendor_id
        JOIN personal_vendor_ownership o ON o.vendor_id=v.id
        WHERE a.id=NEW.attempt_id AND a.execution='not_sent'
            AND o.organization_id=a.organization_id AND v.id=NEW.vendor_id
            AND v.enabled AND m.enabled
            AND v.revision=NEW.vendor_revision AND m.revision=NEW.model_revision
    ) THEN
        RAISE EXCEPTION 'personal route ownership or revision changed' USING ERRCODE='P0008';
    END IF;
    IF EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=NEW.attempt_id)
        OR EXISTS (SELECT 1 FROM provider_attempt_offers WHERE attempt_id=NEW.attempt_id)
        OR EXISTS (SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id=NEW.attempt_id) THEN
        RAISE EXCEPTION 'personal route already has commercial accounting' USING ERRCODE='P0008';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION require_customer_balance_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    END IF;
    -- Funding/account activation takes an organization update lock. Admission
    -- holds a shared lock until commit so activation cannot race this check.
    PERFORM id FROM organizations WHERE id=NEW.organization_id FOR SHARE;
    IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id=NEW.id) THEN
        -- Recheck under locks at the dispatch boundary, not merely at resolution.
        PERFORM v.id FROM vendors v JOIN personal_attempt_routes b ON b.vendor_id=v.id
            WHERE b.attempt_id=NEW.id FOR SHARE OF v;
        PERFORM m.alias FROM vendor_models m WHERE m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id) FOR SHARE;
        IF NOT EXISTS (
            SELECT 1 FROM personal_attempt_routes b
            JOIN personal_vendor_ownership o ON o.vendor_id=b.vendor_id
            JOIN vendors v ON v.id=b.vendor_id
            JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id)
            JOIN api_keys k ON k.id=NEW.api_key_id
            JOIN inspected_guardrail_bindings g ON g.attempt_id=NEW.id AND g.key_id=k.id
            WHERE b.attempt_id=NEW.id AND o.organization_id=NEW.organization_id
                AND v.enabled AND m.enabled
                AND v.revision=b.vendor_revision AND m.revision=b.model_revision
                AND NEW.dispatch_provider=v.adapter
                AND k.organization_id=NEW.organization_id AND k.project_id=NEW.project_id
                AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp()
                AND ('*'=ANY(k.allowed_models) OR NEW.resource_id=ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION 'personal dispatch ownership, policy or route changed' USING ERRCODE='P0011';
        END IF;
        IF EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM provider_attempt_offers WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM account_assignments WHERE attempt_id=NEW.id) THEN
            RAISE EXCEPTION 'personal dispatch has incompatible accounting' USING ERRCODE='P0011';
        END IF;
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM customer_balance_accounts WHERE organization_id=NEW.organization_id)
        AND NOT EXISTS (SELECT 1 FROM customer_balance_reservations
            WHERE attempt_id=NEW.id AND organization_id=NEW.organization_id AND released_at IS NULL)
        AND NOT EXISTS (
            SELECT 1 FROM customer_attempt_tariffs t
            JOIN customer_tariff_revisions r ON r.id=t.revision_id
            JOIN customer_attempt_balance_accounts b ON b.attempt_id=t.attempt_id AND b.currency=r.currency
            WHERE t.attempt_id=NEW.id AND b.organization_id=NEW.organization_id
                AND r.prompt_rate=0 AND r.completion_rate=0
        ) THEN
        RAISE EXCEPTION 'prepaid dispatch requires a funded retail reservation' USING ERRCODE='P0009';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0214_unsettled_media_spending_commitments.sql 2551
-- Count known unsettled media overruns in workspace and key commitments.
-- Original reservations remain immutable; posted charges and refunds retain
-- their existing exactly-once contribution.

CREATE OR REPLACE FUNCTION niu_customer_workspace_committed(p_organization UUID,p_project UUID,p_account UUID)
RETURNS NUMERIC LANGUAGE sql VOLATILE AS $$
    SELECT COALESCE((SELECT -SUM(e.amount_nanos) FROM customer_balance_entries e
        WHERE e.organization_id=p_organization AND e.project_id=p_project
          AND e.account_id=p_account AND e.kind='charge'),0)
        - COALESCE((SELECT SUM(r.amount_nanos) FROM customer_balance_entries r
            JOIN customer_balance_entries c ON c.id=r.reverses_entry_id
            WHERE r.account_id=p_account AND r.kind='refund'
              AND c.organization_id=p_organization AND c.project_id=p_project AND c.kind='charge'),0)
        + COALESCE((SELECT SUM(GREATEST(r.amount_nanos, COALESCE(m.amount_nanos, 0))) FROM customer_balance_reservations r
            LEFT JOIN customer_media_charges m ON m.attempt_id=r.attempt_id
            JOIN customer_attempt_balance_accounts b ON b.attempt_id=r.attempt_id
            WHERE b.organization_id=p_organization AND b.project_id=p_project
              AND r.account_id=p_account AND r.released_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM customer_balance_entries e
                  WHERE e.attempt_id=r.attempt_id AND e.kind='charge')),0)
$$;

CREATE OR REPLACE FUNCTION niu_customer_key_committed(p_root UUID,p_account UUID)
RETURNS NUMERIC LANGUAGE sql VOLATILE AS $$
    SELECT COALESCE((SELECT -SUM(e.amount_nanos) FROM customer_balance_entries e
        WHERE e.account_id=p_account AND e.kind='charge'
          AND niu_customer_attempt_spending_root(e.attempt_id)=p_root),0)
      - COALESCE((SELECT SUM(r.amount_nanos) FROM customer_balance_entries r
        JOIN customer_balance_entries c ON c.id=r.reverses_entry_id
        WHERE r.account_id=p_account AND r.kind='refund' AND c.kind='charge'
          AND niu_customer_attempt_spending_root(c.attempt_id)=p_root),0)
      + COALESCE((SELECT SUM(GREATEST(r.amount_nanos, COALESCE(m.amount_nanos, 0))) FROM customer_balance_reservations r
            LEFT JOIN customer_media_charges m ON m.attempt_id=r.attempt_id
        WHERE r.account_id=p_account AND r.released_at IS NULL
          AND niu_customer_attempt_spending_root(r.attempt_id)=p_root
          AND NOT EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.attempt_id=r.attempt_id AND e.kind='charge')),0)
$$;


-- @niu-legacy-migration 0215_company_outstanding_liability.sql 1478
-- Outstanding customer liability can exceed its original immutable hold.
CREATE FUNCTION niu_customer_account_outstanding(p_account UUID, p_exclude_attempt UUID DEFAULT NULL)
RETURNS NUMERIC LANGUAGE sql VOLATILE AS $$
    SELECT COALESCE(SUM(GREATEST(r.amount_nanos, COALESCE(m.amount_nanos, 0))),0)
    FROM customer_balance_reservations r
    LEFT JOIN customer_media_charges m ON m.attempt_id=r.attempt_id
    WHERE r.account_id=p_account AND r.released_at IS NULL
      AND (p_exclude_attempt IS NULL OR r.attempt_id<>p_exclude_attempt)
      AND NOT EXISTS (SELECT 1 FROM customer_balance_entries e
          WHERE e.attempt_id=r.attempt_id AND e.kind='charge')
$$;

CREATE OR REPLACE FUNCTION enforce_customer_media_debit_capacity() RETURNS TRIGGER AS $$
DECLARE funded BOOLEAN;
BEGIN
    IF NEW.kind<>'charge' OR NOT EXISTS (SELECT 1 FROM customer_media_charges WHERE attempt_id=NEW.attempt_id) THEN RETURN NEW; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR UPDATE;
    SELECT COALESCE((SELECT SUM(amount_nanos) FROM customer_balance_entries WHERE account_id=a.id),0)
        +a.credit_limit_nanos-niu_customer_account_outstanding(a.id, NEW.attempt_id)
        >=-NEW.amount_nanos INTO funded FROM customer_balance_accounts a WHERE a.id=NEW.account_id;
    IF funded IS DISTINCT FROM true THEN RAISE EXCEPTION 'media debit exceeds available approved capacity' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- @niu-legacy-migration 0216_customer_cached_prompt_rates.sql 3929
-- Optional customer cache-read pricing; null preserves the flat input tariff.
ALTER TABLE customer_tariff_revisions ADD COLUMN cached_prompt_rate BIGINT
    CHECK (cached_prompt_rate BETWEEN 0 AND 1000000000000000);
ALTER TABLE customer_charges ADD COLUMN cached_prompt_tokens BIGINT
    CHECK (cached_prompt_tokens >= 0 AND cached_prompt_tokens <= prompt_tokens);

-- A zero base rate is not free dispatch when cached input has a price.
CREATE OR REPLACE FUNCTION require_customer_balance_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    END IF;
    -- Funding/account activation takes an organization update lock. Admission
    -- holds a shared lock until commit so activation cannot race this check.
    PERFORM id FROM organizations WHERE id=NEW.organization_id FOR SHARE;
    IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id=NEW.id) THEN
        -- Recheck under locks at the dispatch boundary, not merely at resolution.
        PERFORM v.id FROM vendors v JOIN personal_attempt_routes b ON b.vendor_id=v.id
            WHERE b.attempt_id=NEW.id FOR SHARE OF v;
        PERFORM m.alias FROM vendor_models m WHERE m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id) FOR SHARE;
        IF NOT EXISTS (
            SELECT 1 FROM personal_attempt_routes b
            JOIN personal_vendor_ownership o ON o.vendor_id=b.vendor_id
            JOIN vendors v ON v.id=b.vendor_id
            JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id)
            JOIN api_keys k ON k.id=NEW.api_key_id
            JOIN inspected_guardrail_bindings g ON g.attempt_id=NEW.id AND g.key_id=k.id
            WHERE b.attempt_id=NEW.id AND o.organization_id=NEW.organization_id
                AND v.enabled AND m.enabled
                AND v.revision=b.vendor_revision AND m.revision=b.model_revision
                AND NEW.dispatch_provider=v.adapter
                AND k.organization_id=NEW.organization_id AND k.project_id=NEW.project_id
                AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp()
                AND ('*'=ANY(k.allowed_models) OR NEW.resource_id=ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION 'personal dispatch ownership, policy or route changed' USING ERRCODE='P0011';
        END IF;
        IF EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM provider_attempt_offers WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM account_assignments WHERE attempt_id=NEW.id) THEN
            RAISE EXCEPTION 'personal dispatch has incompatible accounting' USING ERRCODE='P0011';
        END IF;
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM customer_balance_accounts WHERE organization_id=NEW.organization_id)
        AND NOT EXISTS (SELECT 1 FROM customer_balance_reservations
            WHERE attempt_id=NEW.id AND organization_id=NEW.organization_id AND released_at IS NULL)
        AND NOT EXISTS (
            SELECT 1 FROM customer_attempt_tariffs t
            JOIN customer_tariff_revisions r ON r.id=t.revision_id
            JOIN customer_attempt_balance_accounts b ON b.attempt_id=t.attempt_id AND b.currency=r.currency
            WHERE t.attempt_id=NEW.id AND b.organization_id=NEW.organization_id
                AND r.prompt_rate=0 AND r.completion_rate=0 AND COALESCE(r.cached_prompt_rate,0)=0
        ) THEN
        RAISE EXCEPTION 'prepaid dispatch requires a funded retail reservation' USING ERRCODE='P0009';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0217_supplier_cached_prompt_rates.sql 556
-- Supplier payout rates are independent from customer tariffs and route budgets.
ALTER TABLE provider_offer_revisions ADD COLUMN cached_prompt_rate BIGINT
    CHECK (cached_prompt_rate BETWEEN 0 AND 1000000000000000);
ALTER TABLE provider_offer_revisions ADD CONSTRAINT supplier_cached_rate_text_only
    CHECK (cached_prompt_rate IS NULL OR rate_kind = 'text');
ALTER TABLE provider_earnings ADD COLUMN cached_prompt_tokens BIGINT
    CHECK (cached_prompt_tokens >= 0 AND cached_prompt_tokens <= prompt_tokens
        AND billing_meter = 'text_tokens');

-- @niu-legacy-migration 0218_financial_recovery_progress.sql 475
-- Durable keyset traversal; no financial evidence or ledger rows are changed.
CREATE TABLE financial_recovery_progress (
    stage TEXT PRIMARY KEY CHECK (stage IN (
        'balance_release', 'customer_charge', 'supplier_earning', 'upstream_cost'
    )),
    after_attempt UUID,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO financial_recovery_progress(stage) VALUES
    ('balance_release'), ('customer_charge'), ('supplier_earning'), ('upstream_cost');

-- @niu-legacy-migration 0219_customer_media_invoices.sql 2010
-- A common read boundary over independent immutable retail ledgers.
CREATE VIEW customer_invoice_charge_sources AS
SELECT organization_id, project_id, attempt_id, currency, amount_nanos
FROM customer_charges
UNION ALL
SELECT organization_id, project_id, attempt_id, currency, amount_nanos
FROM customer_media_charges;

-- Preserve historical entries. New entries may reference either customer meter;
-- the scoped attempt FK and source check replace the text-only charge FK.
DO $$
DECLARE old_constraint TEXT;
BEGIN
    SELECT conname INTO STRICT old_constraint FROM pg_constraint
        WHERE conrelid='customer_invoice_entries'::regclass
        AND confrelid='customer_charges'::regclass AND contype='f';
    EXECUTE format('ALTER TABLE customer_invoice_entries DROP CONSTRAINT %I',old_constraint);
END;
$$;
ALTER TABLE customer_invoice_entries ADD FOREIGN KEY (organization_id,project_id,attempt_id)
    REFERENCES attempts(organization_id,project_id,id);

CREATE FUNCTION validate_customer_invoice_charge_source() RETURNS TRIGGER AS $$
DECLARE sources BIGINT;
BEGIN
    SELECT count(*) INTO sources
    FROM customer_invoice_charge_sources c
    JOIN customer_invoices i ON i.id=NEW.invoice_id
        AND i.organization_id=c.organization_id AND i.project_id=c.project_id
        AND i.currency=c.currency
    JOIN attempts a ON a.id=c.attempt_id
    WHERE c.organization_id=NEW.organization_id AND c.project_id=NEW.project_id
        AND c.attempt_id=NEW.attempt_id
        AND a.dispatched_at>=to_timestamp(i.from_ms::double precision/1000)
        AND a.dispatched_at<to_timestamp(i.to_ms::double precision/1000);
    IF sources <> 1 THEN
        RAISE EXCEPTION 'invoice entry requires one scoped charge within its currency and period'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER validate_customer_invoice_charge_source BEFORE INSERT ON customer_invoice_entries
    FOR EACH ROW EXECUTE FUNCTION validate_customer_invoice_charge_source();

-- @niu-legacy-migration 0220_customer_account_guard_locks.sql 5671
-- Keep account serialization compatible with immutable foreign-key pins.
-- The application reservation lock and every account-guard trigger must use
-- the same non-key-changing mode; a later FOR UPDATE upgrade recreates the
-- admission deadlock even when the application already uses NO KEY UPDATE.
-- Financial predicates, revisions and error behavior are unchanged.


CREATE OR REPLACE FUNCTION protect_customer_workspace_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'spending limits cannot be deleted'; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR NO KEY UPDATE;
    IF TG_OP='UPDATE' AND (ROW(NEW.organization_id,NEW.project_id,NEW.account_id,NEW.currency)
        IS DISTINCT FROM ROW(OLD.organization_id,OLD.project_id,OLD.account_id,OLD.currency)
        OR NEW.revision<>OLD.revision+1) THEN
        RAISE EXCEPTION 'invalid spending limit revision' USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' AND NEW.revision<>1 THEN
        RAISE EXCEPTION 'invalid initial spending limit revision' USING ERRCODE='23514';
    END IF;
    IF niu_customer_workspace_committed(NEW.organization_id,NEW.project_id,NEW.account_id)>NEW.limit_nanos THEN
        RAISE EXCEPTION 'spending limit below committed customer liability' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_customer_workspace_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE workspace UUID; maximum BIGINT;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR NO KEY UPDATE;
    SELECT project_id INTO workspace FROM customer_attempt_balance_accounts
        WHERE attempt_id=NEW.attempt_id AND organization_id=NEW.organization_id
          AND account_id=NEW.account_id AND currency=NEW.currency;
    SELECT limit_nanos INTO maximum FROM customer_workspace_spending_limits
        WHERE organization_id=NEW.organization_id AND project_id=workspace
          AND account_id=NEW.account_id AND currency=NEW.currency;
    IF maximum IS NOT NULL AND
        niu_customer_workspace_committed(NEW.organization_id,workspace,NEW.account_id)+NEW.amount_nanos>maximum THEN
        RAISE EXCEPTION 'customer workspace spending limit exceeded' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION protect_customer_key_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'key limits cannot be deleted'; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR NO KEY UPDATE;
    IF (TG_OP='INSERT' AND NEW.revision<>1) OR
       (TG_OP='UPDATE' AND (NEW.revision<>OLD.revision+1 OR
        ROW(NEW.organization_id,NEW.project_id,NEW.spending_root_id,NEW.account_id,NEW.currency)
        IS DISTINCT FROM ROW(OLD.organization_id,OLD.project_id,OLD.spending_root_id,OLD.account_id,OLD.currency))) THEN
        RAISE EXCEPTION 'invalid key limit revision' USING ERRCODE='23514';
    END IF;
    IF NEW.limit_nanos IS NOT NULL AND EXISTS (
        SELECT 1 FROM customer_balance_reservations r JOIN attempts a ON a.id=r.attempt_id
        WHERE r.account_id=NEW.account_id AND a.project_id=NEW.project_id
          AND r.released_at IS NULL AND niu_customer_attempt_spending_root(r.attempt_id) IS NULL
    ) THEN
        RAISE EXCEPTION 'unattributed liabilities require reconciliation before setting a key limit' USING ERRCODE='23514';
    END IF;
    IF NEW.limit_nanos IS NOT NULL AND niu_customer_key_committed(NEW.spending_root_id,NEW.account_id)>NEW.limit_nanos THEN
        RAISE EXCEPTION 'key limit below committed liability' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_customer_key_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root UUID; maximum BIGINT; workspace UUID;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR NO KEY UPDATE;
    root := niu_customer_attempt_spending_root(NEW.attempt_id);
    SELECT project_id INTO workspace FROM attempts WHERE id=NEW.attempt_id;
    IF root IS NULL AND EXISTS(SELECT 1 FROM customer_key_spending_limits
        WHERE organization_id=NEW.organization_id AND project_id=workspace
          AND account_id=NEW.account_id AND limit_nanos IS NOT NULL) THEN
        RAISE EXCEPTION 'key attribution required for bounded spending' USING ERRCODE='23514';
    END IF;
    SELECT limit_nanos INTO maximum FROM customer_key_spending_limits
        WHERE organization_id=NEW.organization_id AND spending_root_id=root AND account_id=NEW.account_id;
    IF maximum IS NOT NULL AND niu_customer_key_committed(root,NEW.account_id)+NEW.amount_nanos>maximum THEN
        RAISE EXCEPTION 'customer key spending limit exceeded' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_customer_media_debit_capacity() RETURNS TRIGGER AS $$
DECLARE funded BOOLEAN;
BEGIN
    IF NEW.kind<>'charge' OR NOT EXISTS (SELECT 1 FROM customer_media_charges WHERE attempt_id=NEW.attempt_id) THEN RETURN NEW; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR NO KEY UPDATE;
    SELECT COALESCE((SELECT SUM(amount_nanos) FROM customer_balance_entries WHERE account_id=a.id),0)
        +a.credit_limit_nanos-niu_customer_account_outstanding(a.id, NEW.attempt_id)
        >=-NEW.amount_nanos INTO funded FROM customer_balance_accounts a WHERE a.id=NEW.account_id;
    IF funded IS DISTINCT FROM true THEN RAISE EXCEPTION 'media debit exceeds available approved capacity' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- @niu-legacy-migration 0221_video_submission_intents.sql 2411
-- Actor-owned restore content is separate from immutable dispatch identities.
CREATE TABLE video_submission_intents (
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    owner text NOT NULL CHECK (length(owner) BETWEEN 1 AND 200),
    id uuid NOT NULL,
    key_id uuid NOT NULL REFERENCES api_keys(id),
    model text NOT NULL CHECK (length(model) BETWEEN 1 AND 200),
    owner_funded boolean NOT NULL,
    submission_key uuid NOT NULL UNIQUE,
    request_digest bytea NOT NULL CHECK (octet_length(request_digest)=32),
    request jsonb CHECK (request IS NULL OR (jsonb_typeof(request)='object' AND octet_length(request::text)<=131072)),
    revision bigint NOT NULL DEFAULT 1 CHECK (revision>0),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
    deleted_at timestamptz,
    PRIMARY KEY (organization_id,project_id,owner,id),
    FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
    CHECK (expires_at=created_at+interval '30 days'),
    CHECK (deleted_at IS NULL OR request IS NULL)
);
CREATE INDEX video_intent_actor_history ON video_submission_intents
    (organization_id,project_id,owner,created_at DESC,id DESC);
CREATE INDEX video_intent_content_expiry ON video_submission_intents(expires_at)
    WHERE request IS NOT NULL;
CREATE FUNCTION protect_video_submission_intent() RETURNS trigger AS $$
BEGIN
    IF (NEW.organization_id,NEW.project_id,NEW.owner,NEW.id,NEW.key_id,NEW.model,
        NEW.owner_funded,NEW.submission_key,NEW.request_digest,NEW.created_at,NEW.expires_at)
       IS DISTINCT FROM
       (OLD.organization_id,OLD.project_id,OLD.owner,OLD.id,OLD.key_id,OLD.model,
        OLD.owner_funded,OLD.submission_key,OLD.request_digest,OLD.created_at,OLD.expires_at)
       OR NEW.request IS NOT NULL
       OR OLD.request IS NULL
       OR NEW.revision<>OLD.revision+1
       OR NEW.deleted_at IS NULL THEN
        RAISE EXCEPTION 'video intent identity is immutable; only content deletion is allowed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER protect_video_submission_intent BEFORE UPDATE ON video_submission_intents
    FOR EACH ROW EXECUTE FUNCTION protect_video_submission_intent();
CREATE TRIGGER retain_video_submission_intent BEFORE DELETE ON video_submission_intents
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0222_personal_procurement_budget_exclusion.sql 2410
-- Personal upstream bills belong to the credential owner, not platform procurement.
-- The existing require_customer_balance_dispatch trigger still validates personal
-- ownership, current credential/model revisions, key grants and guardrail binding
-- under locks. A route marker does not bypass those dispatch-time checks.
-- Shared routes retain the existing held procurement-reservation requirement.
-- Keep guardrail rejection auditing and its subtransaction boundary unchanged.
CREATE OR REPLACE FUNCTION niu_mark_dispatched_with_guardrail_audit(UUID,UUID,UUID,UUID)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
    changed BIGINT;
    rejection TEXT;
    metadata JSONB;
BEGIN
    BEGIN
        UPDATE attempts a
        SET execution = 'may_have_executed', dispatched_at = clock_timestamp(), api_key_id = $4
        FROM operations o, api_keys k
        WHERE a.organization_id = $1 AND a.project_id = $2 AND a.id = $3
            AND a.execution = 'not_sent' AND o.id = a.operation_id AND k.id = $4
            AND ('*' = ANY(k.allowed_models) OR o.model_alias = ANY(k.allowed_models))
            AND k.expires_at > clock_timestamp()
            AND NOT EXISTS (
                SELECT 1 FROM account_assignments s
                WHERE s.attempt_id=a.id AND s.state <> 'held'
            )
            AND (
                NOT EXISTS (
                    SELECT 1 FROM project_budgets b
                    WHERE b.organization_id=$1 AND b.project_id=$2
                )
                OR EXISTS (
                    SELECT 1 FROM cost_reservations r
                    WHERE r.attempt_id=a.id AND r.state='held'
                )
                OR EXISTS (
                    SELECT 1 FROM personal_attempt_routes personal
                    WHERE personal.attempt_id=a.id
                )
            );
        GET DIAGNOSTICS changed = ROW_COUNT;
        RETURN changed;
    EXCEPTION WHEN SQLSTATE 'P0010' THEN
        GET STACKED DIAGNOSTICS rejection = PG_EXCEPTION_DETAIL;
    END;
    metadata := rejection::jsonb;
    INSERT INTO dispatch_guardrail_rejections(organization_id,project_id,attempt_id,key_id,reason,workspace_revision,key_policy_revision,key_assignment_revision)
    VALUES($1,$2,$3,$4,metadata->>'reason',(metadata->>'workspace_revision')::BIGINT,(metadata->>'key_policy_revision')::BIGINT,(metadata->>'key_assignment_revision')::BIGINT);
    RETURN -1;
END;
$$;

-- @niu-legacy-migration 0223_operation_customer_tariff.sql 1698
-- A customer operation keeps one retail tariff across its future attempts.
-- This does not authorize retries or change any existing charge.
CREATE TABLE customer_operation_tariffs (
    operation_id UUID PRIMARY KEY REFERENCES operations(id),
    revision_id UUID NOT NULL REFERENCES customer_tariff_revisions(id)
);

-- Preserve existing bindings exactly. Conflicting historical revisions abort
-- migration rather than selecting a winner or rewriting financial history.
INSERT INTO customer_operation_tariffs(operation_id, revision_id)
SELECT DISTINCT a.operation_id, t.revision_id
FROM customer_attempt_tariffs t JOIN attempts a ON a.id=t.attempt_id;

CREATE TRIGGER immutable_customer_operation_tariff
BEFORE UPDATE OR DELETE ON customer_operation_tariffs
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION bind_operation_customer_tariff() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    operation UUID;
    pinned UUID;
BEGIN
    SELECT o.id INTO STRICT operation
    FROM operations o JOIN attempts a ON a.operation_id=o.id
    WHERE a.id=NEW.attempt_id
    FOR UPDATE OF o;

    INSERT INTO customer_operation_tariffs(operation_id, revision_id)
    VALUES(operation, NEW.revision_id)
    ON CONFLICT(operation_id) DO NOTHING;

    SELECT revision_id INTO STRICT pinned
    FROM customer_operation_tariffs WHERE operation_id=operation;
    IF pinned <> NEW.revision_id THEN
        RAISE EXCEPTION 'Customer operation tariff cannot change' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER bind_customer_attempt_operation_tariff
BEFORE INSERT ON customer_attempt_tariffs
FOR EACH ROW EXECUTE FUNCTION bind_operation_customer_tariff();

-- @niu-legacy-migration 0224_customer_minimum_charge.sql 3891
-- Minimum retail charge for a completed request with known billable usage.
-- Existing tariff revisions keep their historical zero minimum.
ALTER TABLE customer_tariff_revisions ADD COLUMN minimum_charge_nanos BIGINT NOT NULL DEFAULT 0
    CHECK (minimum_charge_nanos >= 0);

-- Zero token rates alone do not authorize unreserved minimum-charge dispatch.
CREATE OR REPLACE FUNCTION require_customer_balance_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    END IF;
    -- Funding/account activation takes an organization update lock. Admission
    -- holds a shared lock until commit so activation cannot race this check.
    PERFORM id FROM organizations WHERE id=NEW.organization_id FOR SHARE;
    IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id=NEW.id) THEN
        -- Recheck under locks at the dispatch boundary, not merely at resolution.
        PERFORM v.id FROM vendors v JOIN personal_attempt_routes b ON b.vendor_id=v.id
            WHERE b.attempt_id=NEW.id FOR SHARE OF v;
        PERFORM m.alias FROM vendor_models m WHERE m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id) FOR SHARE;
        IF NOT EXISTS (
            SELECT 1 FROM personal_attempt_routes b
            JOIN personal_vendor_ownership o ON o.vendor_id=b.vendor_id
            JOIN vendors v ON v.id=b.vendor_id
            JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id)
            JOIN api_keys k ON k.id=NEW.api_key_id
            JOIN inspected_guardrail_bindings g ON g.attempt_id=NEW.id AND g.key_id=k.id
            WHERE b.attempt_id=NEW.id AND o.organization_id=NEW.organization_id
                AND v.enabled AND m.enabled
                AND v.revision=b.vendor_revision AND m.revision=b.model_revision
                AND NEW.dispatch_provider=v.adapter
                AND k.organization_id=NEW.organization_id AND k.project_id=NEW.project_id
                AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp()
                AND ('*'=ANY(k.allowed_models) OR NEW.resource_id=ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION 'personal dispatch ownership, policy or route changed' USING ERRCODE='P0011';
        END IF;
        IF EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM provider_attempt_offers WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM account_assignments WHERE attempt_id=NEW.id) THEN
            RAISE EXCEPTION 'personal dispatch has incompatible accounting' USING ERRCODE='P0011';
        END IF;
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM customer_balance_accounts WHERE organization_id=NEW.organization_id)
        AND NOT EXISTS (SELECT 1 FROM customer_balance_reservations
            WHERE attempt_id=NEW.id AND organization_id=NEW.organization_id AND released_at IS NULL)
        AND NOT EXISTS (
            SELECT 1 FROM customer_attempt_tariffs t
            JOIN customer_tariff_revisions r ON r.id=t.revision_id
            JOIN customer_attempt_balance_accounts b ON b.attempt_id=t.attempt_id AND b.currency=r.currency
            WHERE t.attempt_id=NEW.id AND b.organization_id=NEW.organization_id
                AND r.prompt_rate=0 AND r.completion_rate=0 AND COALESCE(r.cached_prompt_rate,0)=0
                AND r.minimum_charge_nanos=0
        ) THEN
        RAISE EXCEPTION 'prepaid dispatch requires a funded retail reservation' USING ERRCODE='P0009';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0225_operation_funding_source.sql 2109
-- Pin funding independently of candidate selection. Retrying a customer-priced
-- operation must never consume an owner's personal credential, or vice versa.
-- Unpriced shared operations are not covered and remain ineligible for failover.
CREATE TABLE operation_funding_sources (
    operation_id UUID PRIMARY KEY REFERENCES operations(id),
    funding_source TEXT NOT NULL CHECK (funding_source IN ('personal', 'customer'))
);

-- Exact historical backfill: mixed funding within an operation aborts migration
-- via the primary key instead of silently choosing or rewriting either source.
INSERT INTO operation_funding_sources(operation_id, funding_source)
SELECT DISTINCT a.operation_id, 'personal'
FROM personal_attempt_routes p JOIN attempts a ON a.id=p.attempt_id
UNION
SELECT DISTINCT a.operation_id, 'customer'
FROM customer_attempt_tariffs t JOIN attempts a ON a.id=t.attempt_id;

CREATE TRIGGER immutable_operation_funding_source
BEFORE UPDATE OR DELETE ON operation_funding_sources
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION bind_operation_funding_source() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    operation UUID;
    source TEXT := TG_ARGV[0];
    pinned TEXT;
BEGIN
    SELECT o.id INTO STRICT operation
    FROM operations o JOIN attempts a ON a.operation_id=o.id
    WHERE a.id=NEW.attempt_id
    FOR UPDATE OF o;

    INSERT INTO operation_funding_sources(operation_id, funding_source)
    VALUES(operation, source)
    ON CONFLICT(operation_id) DO NOTHING;

    SELECT funding_source INTO STRICT pinned
    FROM operation_funding_sources WHERE operation_id=operation;
    IF pinned <> source THEN
        RAISE EXCEPTION 'Operation funding source cannot change' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER bind_personal_operation_funding
BEFORE INSERT ON personal_attempt_routes
FOR EACH ROW EXECUTE FUNCTION bind_operation_funding_source('personal');

CREATE TRIGGER bind_customer_operation_funding
BEFORE INSERT ON customer_attempt_tariffs
FOR EACH ROW EXECUTE FUNCTION bind_operation_funding_source('customer');

-- @niu-legacy-migration 0226_gateway_retry_chain.sql 2239
-- Opted-in gateway operations pin a bounded, versioned retry policy. Existing
-- operations do not acquire retry permission from this migration.
CREATE TABLE gateway_retry_policies (
    operation_id UUID PRIMARY KEY REFERENCES operations(id),
    key_id UUID NOT NULL REFERENCES api_keys(id),
    policy_revision TEXT NOT NULL CHECK (policy_revision='openrouter-chat-auth-rejection-v1'),
    maximum_attempts SMALLINT NOT NULL CHECK (maximum_attempts=2),
    deadline TIMESTAMPTZ NOT NULL
);
ALTER TABLE attempts ADD UNIQUE(id,operation_id);
CREATE TABLE gateway_retry_attempts (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    operation_id UUID NOT NULL REFERENCES gateway_retry_policies(operation_id),
    ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 2),
    predecessor_id UUID UNIQUE REFERENCES attempts(id),
    UNIQUE(operation_id,ordinal),
    UNIQUE(attempt_id,operation_id),
    FOREIGN KEY(attempt_id,operation_id) REFERENCES attempts(id,operation_id),
    FOREIGN KEY(predecessor_id,operation_id) REFERENCES gateway_retry_attempts(attempt_id,operation_id),
    CHECK ((ordinal=1 AND predecessor_id IS NULL) OR (ordinal=2 AND predecessor_id IS NOT NULL))
);
CREATE TRIGGER immutable_gateway_retry_policy BEFORE UPDATE OR DELETE ON gateway_retry_policies
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_gateway_retry_attempt BEFORE UPDATE OR DELETE ON gateway_retry_attempts
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- Recheck the persisted overall deadline at dispatch, including the gap after
-- personal preparation commits. An expired preparation cannot authorize a send.
CREATE FUNCTION require_gateway_retry_deadline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution='may_have_executed' AND OLD.execution='not_sent' AND EXISTS (
        SELECT 1 FROM gateway_retry_policies p
        WHERE p.operation_id=NEW.operation_id AND p.deadline<=clock_timestamp()
    ) THEN
        RAISE EXCEPTION 'Gateway operation deadline expired' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_gateway_retry_deadline BEFORE UPDATE ON attempts
FOR EACH ROW EXECUTE FUNCTION require_gateway_retry_deadline();

-- @niu-legacy-migration 0227_media_operation_funding_source.sql 1191
-- Customer video uses a separate immutable pricing snapshot. It must pin the
-- same operation funding source as customer text, including historical attempts.
-- Hold inserts until both the backfill and future-write trigger are installed.
LOCK TABLE customer_media_attempt_pricing IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO operation_funding_sources(operation_id, funding_source)
SELECT DISTINCT a.operation_id, 'customer'
FROM customer_media_attempt_pricing p JOIN attempts a ON a.id=p.attempt_id
ON CONFLICT(operation_id) DO NOTHING;

-- Never silently adopt a historical operation that also used personal funding.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM customer_media_attempt_pricing p
        JOIN attempts a ON a.id=p.attempt_id
        JOIN operation_funding_sources f ON f.operation_id=a.operation_id
        WHERE f.funding_source <> 'customer'
    ) THEN
        RAISE EXCEPTION 'Historical media operation has conflicting funding sources'
            USING ERRCODE='23514';
    END IF;
END;
$$;

CREATE TRIGGER bind_customer_media_operation_funding
BEFORE INSERT ON customer_media_attempt_pricing
FOR EACH ROW EXECUTE FUNCTION bind_operation_funding_source('customer');

-- @niu-legacy-migration 0228_media_transport_http_status.sql 430
-- Safe per-transport diagnostics, independent of generation/billing state.
-- Historical rows and transport/decoding failures retain unknown HTTP status.
ALTER TABLE media_transport_timings ADD COLUMN upstream_http_status INTEGER
    CHECK (upstream_http_status BETWEEN 100 AND 599);
ALTER TABLE media_transport_timings ADD CONSTRAINT media_http_failure_outcome
    CHECK (upstream_http_status IS NULL OR outcome='unavailable');

-- @niu-legacy-migration 0229_customer_request_fee.sql 3773
-- Fixed retail fee for known completed text requests; historical fees stay zero.
ALTER TABLE customer_tariff_revisions ADD COLUMN request_fee_nanos BIGINT NOT NULL DEFAULT 0
    CHECK (request_fee_nanos >= 0);

CREATE OR REPLACE FUNCTION require_customer_balance_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    END IF;
    -- Funding/account activation takes an organization update lock. Admission
    -- holds a shared lock until commit so activation cannot race this check.
    PERFORM id FROM organizations WHERE id=NEW.organization_id FOR SHARE;
    IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id=NEW.id) THEN
        -- Recheck under locks at the dispatch boundary, not merely at resolution.
        PERFORM v.id FROM vendors v JOIN personal_attempt_routes b ON b.vendor_id=v.id
            WHERE b.attempt_id=NEW.id FOR SHARE OF v;
        PERFORM m.alias FROM vendor_models m WHERE m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id) FOR SHARE;
        IF NOT EXISTS (
            SELECT 1 FROM personal_attempt_routes b
            JOIN personal_vendor_ownership o ON o.vendor_id=b.vendor_id
            JOIN vendors v ON v.id=b.vendor_id
            JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id)
            JOIN api_keys k ON k.id=NEW.api_key_id
            JOIN inspected_guardrail_bindings g ON g.attempt_id=NEW.id AND g.key_id=k.id
            WHERE b.attempt_id=NEW.id AND o.organization_id=NEW.organization_id
                AND v.enabled AND m.enabled
                AND v.revision=b.vendor_revision AND m.revision=b.model_revision
                AND NEW.dispatch_provider=v.adapter
                AND k.organization_id=NEW.organization_id AND k.project_id=NEW.project_id
                AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp()
                AND ('*'=ANY(k.allowed_models) OR NEW.resource_id=ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION 'personal dispatch ownership, policy or route changed' USING ERRCODE='P0011';
        END IF;
        IF EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM provider_attempt_offers WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM account_assignments WHERE attempt_id=NEW.id) THEN
            RAISE EXCEPTION 'personal dispatch has incompatible accounting' USING ERRCODE='P0011';
        END IF;
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM customer_balance_accounts WHERE organization_id=NEW.organization_id)
        AND NOT EXISTS (SELECT 1 FROM customer_balance_reservations
            WHERE attempt_id=NEW.id AND organization_id=NEW.organization_id AND released_at IS NULL)
        AND NOT EXISTS (
            SELECT 1 FROM customer_attempt_tariffs t
            JOIN customer_tariff_revisions r ON r.id=t.revision_id
            JOIN customer_attempt_balance_accounts b ON b.attempt_id=t.attempt_id AND b.currency=r.currency
            WHERE t.attempt_id=NEW.id AND b.organization_id=NEW.organization_id
                AND r.prompt_rate=0 AND r.completion_rate=0 AND COALESCE(r.cached_prompt_rate,0)=0
                AND r.minimum_charge_nanos=0 AND r.request_fee_nanos=0
        ) THEN
        RAISE EXCEPTION 'prepaid dispatch requires a funded retail reservation' USING ERRCODE='P0009';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0230_customer_tariff_history_index.sql 196
-- Scoped reverse-chronological history and keyset continuation, including ties.
CREATE INDEX customer_tariff_revision_history
    ON customer_tariff_revisions(tariff_id,created_at DESC,id DESC);

-- @niu-legacy-migration 0231_provider_offer_history_index.sql 195
-- Supplier-scoped reverse chronological quote history and exclusive cursor reads.
CREATE INDEX provider_offer_revision_history
    ON provider_offer_revisions(offer_id,created_at DESC,id DESC);

-- @niu-legacy-migration 0232_vendor_request_rate_limits.sql 4303
-- One durable rolling window per saved upstream credential, independent of customer keys.
CREATE TABLE vendor_request_rate_limits (
    vendor_id UUID PRIMARY KEY REFERENCES vendors(id),
    requests_per_minute BIGINT CHECK(requests_per_minute BETWEEN 0 AND 1000000),
    revision BIGINT NOT NULL DEFAULT 0 CHECK(revision >= 0)
);
INSERT INTO vendor_request_rate_limits(vendor_id) SELECT id FROM vendors;
CREATE FUNCTION initialize_vendor_request_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO vendor_request_rate_limits(vendor_id) VALUES(NEW.id);
    RETURN NEW;
END;
$$;
CREATE TRIGGER initialize_vendor_request_rate AFTER INSERT ON vendors
    FOR EACH ROW EXECUTE FUNCTION initialize_vendor_request_rate();
CREATE TABLE vendor_request_rate_history (
    vendor_id UUID NOT NULL REFERENCES vendor_request_rate_limits(vendor_id),
    revision BIGINT NOT NULL CHECK(revision > 0),
    requests_per_minute BIGINT CHECK(requests_per_minute BETWEEN 0 AND 1000000),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    actor_operator_id UUID REFERENCES admin_operators(id),
    actor_name TEXT NOT NULL,
    PRIMARY KEY(vendor_id,revision)
);
CREATE TRIGGER immutable_vendor_request_rate_history BEFORE UPDATE OR DELETE ON vendor_request_rate_history
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE vendor_request_rate_admissions (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    vendor_id UUID NOT NULL REFERENCES vendor_request_rate_limits(vendor_id),
    admitted_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX vendor_request_rate_admissions_window ON vendor_request_rate_admissions(vendor_id,admitted_at);
-- Preserve already dispatched mapped requests in the current window on upgrade.
INSERT INTO vendor_request_rate_admissions(attempt_id,vendor_id,admitted_at)
SELECT b.attempt_id,b.vendor_id,a.dispatched_at FROM (
    SELECT attempt_id,vendor_id FROM managed_attempt_routes
    UNION SELECT attempt_id,vendor_id FROM personal_attempt_routes
    UNION SELECT attempt_id,vendor_id FROM media_recovery_routes
) b JOIN attempts a ON a.id=b.attempt_id
WHERE a.dispatched_at > clock_timestamp()-INTERVAL '60 seconds';

CREATE FUNCTION niu_enforce_vendor_request_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    credential UUID;
    credentials UUID[];
    rpm BIGINT;
    checked_at TIMESTAMPTZ;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN
        RETURN NEW;
    END IF;
    -- The immutable attempt bindings identify the actual credential, never the current alias.
    SELECT array_agg(vendor_id) INTO credentials FROM (
        SELECT vendor_id FROM managed_attempt_routes WHERE attempt_id=NEW.id
        UNION SELECT vendor_id FROM personal_attempt_routes WHERE attempt_id=NEW.id
        UNION SELECT vendor_id FROM media_recovery_routes WHERE attempt_id=NEW.id
    ) bound;
    IF cardinality(credentials) > 1 THEN
        RAISE EXCEPTION 'Conflicting credential bindings' USING ERRCODE='P0024';
    END IF;
    credential := credentials[1];
    IF credential IS NULL THEN RETURN NEW; END IF;
    -- Serialize policy edits and admissions without upgrading vendor SHARE locks.
    SELECT requests_per_minute INTO rpm FROM vendor_request_rate_limits
        WHERE vendor_id=credential FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credential rate policy missing' USING ERRCODE='P0024'; END IF;
    checked_at := clock_timestamp();
    DELETE FROM vendor_request_rate_admissions WHERE vendor_id=credential
        AND admitted_at <= checked_at - INTERVAL '60 seconds';
    IF rpm IS NOT NULL AND (SELECT count(*) FROM vendor_request_rate_admissions
        WHERE vendor_id=credential AND admitted_at > checked_at - INTERVAL '60 seconds') >= rpm THEN
        RAISE EXCEPTION 'Upstream credential request rate exhausted' USING ERRCODE='P0025';
    END IF;
    -- Count even unlimited dispatches so applying a cap cannot forget the current window.
    INSERT INTO vendor_request_rate_admissions(attempt_id,vendor_id,admitted_at)
        VALUES(NEW.id,credential,checked_at);
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_vendor_request_rate AFTER INSERT OR UPDATE OF dispatched_at ON attempts
    FOR EACH ROW EXECUTE FUNCTION niu_enforce_vendor_request_rate();

-- @niu-legacy-migration 0233_managed_nonexecution_policy.sql 301
-- Admission pins a qualified failure policy, never an endpoint inferred later
-- from a mutable credential. Historical routes have no invented qualification.
ALTER TABLE managed_attempt_routes ADD COLUMN nonexecution_policy TEXT
    CHECK (nonexecution_policy = 'openrouter-text-auth-rejection-v1');

-- @niu-legacy-migration 0234_vendor_cooldowns.sql 2232
-- Only new, independently qualified nonexecution observations count. No backfill.
CREATE TABLE vendor_cooldowns (
    vendor_id UUID PRIMARY KEY REFERENCES vendors(id),
    cooldown_until TIMESTAMPTZ
);
CREATE TABLE vendor_cooldown_failures (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    vendor_id UUID NOT NULL REFERENCES vendor_cooldowns(vendor_id),
    recorded_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX vendor_cooldown_failures_window ON vendor_cooldown_failures(vendor_id,recorded_at);

-- Versioned fixed policy: three qualified authentication refusals within sixty
-- seconds pause new selection for sixty seconds. Unknown execution never counts.
CREATE FUNCTION niu_record_vendor_safe_failure(failed_attempt UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE credential UUID; observed TIMESTAMPTZ;
BEGIN
    SELECT r.vendor_id INTO credential FROM managed_attempt_routes r
      JOIN attempts a ON a.id=r.attempt_id JOIN request_failures f ON f.attempt_id=a.id
      WHERE a.id=failed_attempt AND a.execution='confirmed_not_executed'
        AND a.dispatched_at IS NOT NULL AND a.usage_confidence='unknown'
        AND r.nonexecution_policy='openrouter-text-auth-rejection-v1'
        AND f.kind='upstream_http_error' AND f.upstream_http_status=401
        AND NOT EXISTS(SELECT 1 FROM media_recovery_routes m WHERE m.attempt_id=a.id);
    IF credential IS NULL THEN RETURN; END IF;
    INSERT INTO vendor_cooldowns(vendor_id) VALUES(credential) ON CONFLICT DO NOTHING;
    PERFORM vendor_id FROM vendor_cooldowns WHERE vendor_id=credential FOR UPDATE;
    observed := clock_timestamp();
    DELETE FROM vendor_cooldown_failures WHERE vendor_id=credential
      AND recorded_at<=observed-INTERVAL '60 seconds';
    INSERT INTO vendor_cooldown_failures(attempt_id,vendor_id,recorded_at)
      VALUES(failed_attempt,credential,observed) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN; END IF;
    IF (SELECT count(*) FROM vendor_cooldown_failures WHERE vendor_id=credential
          AND recorded_at>observed-INTERVAL '60 seconds')>=3 THEN
        UPDATE vendor_cooldowns SET cooldown_until=GREATEST(cooldown_until,observed+INTERVAL '60 seconds')
          WHERE vendor_id=credential;
    END IF;
END;
$$;

-- @niu-legacy-migration 0235_supplier_settlement_history.sql 179
-- Keyset payment history is scoped before ordering; no global ledger scan.
CREATE INDEX provider_settlement_history ON provider_settlements(provider_id,created_at DESC,id DESC);

-- @niu-legacy-migration 0236_customer_invoice_history.sql 112
CREATE INDEX customer_invoice_history ON customer_invoices(organization_id,project_id,created_at DESC,id DESC);

-- @niu-legacy-migration 0237_response_stream_cancellation.sql 1064
-- Cancellation is delivery evidence only, never proof of upstream nonexecution.
ALTER TABLE request_failures DROP CONSTRAINT request_failures_kind_check;
ALTER TABLE request_failures DROP CONSTRAINT request_failures_check;
ALTER TABLE request_failures ADD CONSTRAINT request_failures_kind_check CHECK (kind IN (
    'upstream_http_error','upstream_region_unavailable','upstream_timeout',
    'upstream_connection_error','upstream_transport_error','upstream_invalid_response',
    'response_stream_cancelled'
));
ALTER TABLE request_failures ADD CONSTRAINT request_failures_check CHECK (
    (kind='upstream_region_unavailable' AND upstream_http_status IS NOT NULL AND upstream_http_status=403)
    OR (kind='upstream_http_error' AND upstream_http_status IS NOT NULL
        AND upstream_http_status BETWEEN 100 AND 599 AND upstream_http_status NOT BETWEEN 200 AND 299)
    OR (kind IN ('upstream_timeout','upstream_connection_error','upstream_transport_error',
        'upstream_invalid_response','response_stream_cancelled') AND upstream_http_status IS NULL)
);

-- @niu-legacy-migration 0238_request_payload_cleanup_retries.sql 1754
-- Retry metadata contains no request content or database error messages.
-- Successful or explicit payload deletion removes the corresponding retry state.
CREATE TABLE request_payload_cleanup_retries (
    attempt_id UUID PRIMARY KEY REFERENCES request_payloads(attempt_id) ON DELETE CASCADE,
    retry_after TIMESTAMPTZ NOT NULL
);

-- Each exception block is a PostgreSQL subtransaction. A malformed/poisoned
-- row cannot roll back successful neighbors. Infrastructure failures and the
-- caller's statement deadline still abort the bounded maintenance transaction.
CREATE FUNCTION niu_purge_request_payload_page() RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    candidate UUID;
    removed BIGINT := 0;
    affected BIGINT;
BEGIN
    FOR candidate IN
        SELECT p.attempt_id FROM request_payloads p
        LEFT JOIN request_payload_cleanup_retries r USING (attempt_id)
        WHERE p.expires_at <= clock_timestamp()
          AND (r.retry_after IS NULL OR r.retry_after <= clock_timestamp())
        ORDER BY p.expires_at, p.attempt_id
        LIMIT 64
        FOR UPDATE OF p SKIP LOCKED
    LOOP
        BEGIN
            DELETE FROM request_payloads
             WHERE attempt_id = candidate AND expires_at <= clock_timestamp();
            GET DIAGNOSTICS affected = ROW_COUNT;
            removed := removed + affected;
        EXCEPTION
            WHEN integrity_constraint_violation OR data_exception OR raise_exception THEN
                INSERT INTO request_payload_cleanup_retries(attempt_id, retry_after)
                VALUES(candidate, clock_timestamp() + interval '60 seconds')
                ON CONFLICT(attempt_id) DO UPDATE SET retry_after = EXCLUDED.retry_after;
        END;
    END LOOP;
    RETURN removed;
END;
$$;

-- @niu-legacy-migration 0239_media_result_cleanup_retries.sql 2208
-- Tombstones remain permanent; this table stores only retry eligibility.
CREATE TABLE media_result_cleanup_retries (
    attempt_id UUID NOT NULL,
    kind TEXT NOT NULL,
    retry_after TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(attempt_id, kind),
    FOREIGN KEY(attempt_id, kind) REFERENCES media_result_references(attempt_id, kind)
);

-- Explicit erasure must also retire any previous cleanup failure marker.
CREATE FUNCTION clear_media_result_cleanup_retry() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM media_result_cleanup_retries
     WHERE attempt_id = NEW.attempt_id AND kind = NEW.kind;
    RETURN NEW;
END;
$$;
CREATE TRIGGER clear_media_result_cleanup_retry
AFTER UPDATE OF deleted_at ON media_result_references
FOR EACH ROW WHEN (NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION clear_media_result_cleanup_retry();

CREATE FUNCTION niu_purge_media_result_page() RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    candidate RECORD;
    removed BIGINT := 0;
    affected BIGINT;
BEGIN
    FOR candidate IN
        SELECT m.attempt_id, m.kind FROM media_result_references m
        LEFT JOIN media_result_cleanup_retries r USING (attempt_id, kind)
        WHERE m.ciphertext IS NOT NULL AND m.expires_at <= now()
          AND (r.retry_after IS NULL OR r.retry_after <= now())
        ORDER BY m.expires_at, m.attempt_id, m.kind
        LIMIT 64
        FOR UPDATE OF m SKIP LOCKED
    LOOP
        BEGIN
            UPDATE media_result_references SET ciphertext = NULL, deleted_at = clock_timestamp()
             WHERE attempt_id = candidate.attempt_id AND kind = candidate.kind
               AND deleted_at IS NULL AND expires_at <= now();
            GET DIAGNOSTICS affected = ROW_COUNT;
            removed := removed + affected;
        EXCEPTION
            WHEN integrity_constraint_violation OR data_exception OR raise_exception THEN
                INSERT INTO media_result_cleanup_retries(attempt_id, kind, retry_after)
                VALUES(candidate.attempt_id, candidate.kind, clock_timestamp() + interval '60 seconds')
                ON CONFLICT(attempt_id, kind) DO UPDATE SET retry_after = EXCLUDED.retry_after;
        END;
    END LOOP;
    RETURN removed;
END;
$$;

-- @niu-legacy-migration 0240_inspected_image_cleanup_retries.sql 1815
-- Retry metadata contains no image bytes, inspection result or error message.
-- Explicit erasure of retained content also removes its pending retry.
CREATE TABLE inspected_image_cleanup_retries (
    source_id UUID PRIMARY KEY REFERENCES inspected_image_source_content(source_id) ON DELETE CASCADE,
    retry_after TIMESTAMPTZ NOT NULL
);

CREATE FUNCTION niu_purge_inspected_image_page() RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    candidate RECORD;
    removed BIGINT := 0;
    affected BIGINT;
BEGIN
    FOR candidate IN
        SELECT s.id FROM inspected_image_sources s
        JOIN inspected_image_source_content c ON c.source_id = s.id
        LEFT JOIN inspected_image_cleanup_retries r ON r.source_id = s.id
        WHERE s.expires_at <= now()
          AND (r.retry_after IS NULL OR r.retry_after <= now())
        ORDER BY s.expires_at, s.id
        LIMIT 16
        FOR UPDATE OF s SKIP LOCKED
    LOOP
        BEGIN
            -- Both mutations roll back together if either fails. Never retain
            -- an erasure marker while the corresponding deletion has failed.
            INSERT INTO inspected_image_source_erasures(source_id)
            VALUES(candidate.id) ON CONFLICT DO NOTHING;
            DELETE FROM inspected_image_source_content WHERE source_id = candidate.id;
            GET DIAGNOSTICS affected = ROW_COUNT;
            removed := removed + affected;
        EXCEPTION
            WHEN integrity_constraint_violation OR data_exception OR raise_exception THEN
                INSERT INTO inspected_image_cleanup_retries(source_id, retry_after)
                VALUES(candidate.id, clock_timestamp() + interval '60 seconds')
                ON CONFLICT(source_id) DO UPDATE SET retry_after = EXCLUDED.retry_after;
        END;
    END LOOP;
    RETURN removed;
END;
$$;

-- @niu-legacy-migration 0241_asset_content_cleanup_retries.sql 4757
-- Each retry has a real foreign key to its own immutable content identity.
-- No retained content, upstream identifier or database error enters retry state.
CREATE TABLE asset_group_read_cleanup_retries (
    record_id UUID PRIMARY KEY REFERENCES asset_group_read_results(read_id) ON DELETE CASCADE,
    retry_after TIMESTAMPTZ NOT NULL
);
CREATE TABLE asset_group_update_cleanup_retries (
    record_id UUID PRIMARY KEY REFERENCES asset_group_update_patches(update_id) ON DELETE CASCADE,
    retry_after TIMESTAMPTZ NOT NULL
);
CREATE TABLE asset_listing_cleanup_retries (
    record_id UUID PRIMARY KEY REFERENCES asset_listing_results(listing_id) ON DELETE CASCADE,
    retry_after TIMESTAMPTZ NOT NULL
);
CREATE TABLE asset_lookup_cleanup_retries (
    record_id UUID PRIMARY KEY REFERENCES asset_lookup_results(lookup_id) ON DELETE CASCADE,
    retry_after TIMESTAMPTZ NOT NULL
);

-- Trigger arguments below are installation-owned constants, not request inputs.
CREATE FUNCTION clear_asset_content_cleanup_retry() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    EXECUTE format('DELETE FROM %I WHERE record_id = $1', TG_ARGV[0])
        USING (to_jsonb(NEW)->>TG_ARGV[1])::uuid;
    RETURN NEW;
END;
$$;
CREATE TRIGGER clear_asset_group_read_cleanup_retry
AFTER UPDATE OF deleted_at ON asset_group_read_results
FOR EACH ROW WHEN (NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION clear_asset_content_cleanup_retry('asset_group_read_cleanup_retries', 'read_id');
CREATE TRIGGER clear_asset_group_update_cleanup_retry
AFTER UPDATE OF deleted_at ON asset_group_update_patches
FOR EACH ROW WHEN (NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION clear_asset_content_cleanup_retry('asset_group_update_cleanup_retries', 'update_id');
CREATE TRIGGER clear_asset_listing_cleanup_retry
AFTER UPDATE OF deleted_at ON asset_listing_results
FOR EACH ROW WHEN (NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION clear_asset_content_cleanup_retry('asset_listing_cleanup_retries', 'listing_id');
CREATE TRIGGER clear_asset_lookup_cleanup_retry
AFTER UPDATE OF deleted_at ON asset_lookup_results
FOR EACH ROW WHEN (NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION clear_asset_content_cleanup_retry('asset_lookup_cleanup_retries', 'lookup_id');

-- These four domains share the same retention/erasure contract. Keep one
-- bounded implementation, with an explicit closed mapping of identifiers.
-- This is not SECURITY DEFINER and does not accept SQL or table names.
CREATE FUNCTION niu_purge_asset_content_page(content_kind TEXT) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    content_table TEXT;
    key_column TEXT;
    retry_table TEXT;
    candidate RECORD;
    removed BIGINT := 0;
    affected BIGINT;
BEGIN
    CASE content_kind
        WHEN 'group_read' THEN
            content_table := 'asset_group_read_results';
            key_column := 'read_id';
            retry_table := 'asset_group_read_cleanup_retries';
        WHEN 'group_update' THEN
            content_table := 'asset_group_update_patches';
            key_column := 'update_id';
            retry_table := 'asset_group_update_cleanup_retries';
        WHEN 'listing' THEN
            content_table := 'asset_listing_results';
            key_column := 'listing_id';
            retry_table := 'asset_listing_cleanup_retries';
        WHEN 'lookup' THEN
            content_table := 'asset_lookup_results';
            key_column := 'lookup_id';
            retry_table := 'asset_lookup_cleanup_retries';
        ELSE
            RAISE EXCEPTION 'unsupported asset retention domain' USING ERRCODE = '22023';
    END CASE;
    FOR candidate IN EXECUTE format(
        'SELECT c.%1$I AS id FROM %2$I c LEFT JOIN %3$I r ON r.record_id=c.%1$I
         WHERE c.ciphertext IS NOT NULL AND c.expires_at<=now()
           AND (r.retry_after IS NULL OR r.retry_after<=now())
         ORDER BY c.expires_at,c.%1$I LIMIT 64 FOR UPDATE OF c SKIP LOCKED',
        key_column, content_table, retry_table)
    LOOP
        BEGIN
            EXECUTE format(
                'UPDATE %I SET ciphertext=NULL,deleted_at=clock_timestamp()
                 WHERE %I=$1 AND ciphertext IS NOT NULL AND expires_at<=now()',
                content_table, key_column) USING candidate.id;
            GET DIAGNOSTICS affected = ROW_COUNT;
            removed := removed + affected;
        EXCEPTION
            WHEN integrity_constraint_violation OR data_exception OR raise_exception THEN
                EXECUTE format(
                    'INSERT INTO %I(record_id,retry_after) VALUES($1,clock_timestamp()+interval ''60 seconds'')
                     ON CONFLICT(record_id) DO UPDATE SET retry_after=EXCLUDED.retry_after',
                    retry_table) USING candidate.id;
        END;
    END LOOP;
    RETURN removed;
END;
$$;

-- @niu-legacy-migration 0242_supplier_offer_directory.sql 161
-- Scope and canonical alias order for bounded current-offer traversal.
CREATE INDEX provider_offers_supplier_alias ON provider_offers(provider_id,model_alias);

-- @niu-legacy-migration 0243_customer_reasoning_rates.sql 4028
-- Reasoning is a reported subset of total completion tokens, never additive.
ALTER TABLE customer_tariff_revisions ADD COLUMN reasoning_completion_rate BIGINT
    CHECK (reasoning_completion_rate BETWEEN 0 AND 1000000000000000);
ALTER TABLE customer_charges ADD COLUMN reasoning_completion_tokens BIGINT
    CHECK (reasoning_completion_tokens >= 0 AND reasoning_completion_tokens <= completion_tokens);

CREATE OR REPLACE FUNCTION require_customer_balance_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    END IF;
    -- Funding/account activation takes an organization update lock. Admission
    -- holds a shared lock until commit so activation cannot race this check.
    PERFORM id FROM organizations WHERE id=NEW.organization_id FOR SHARE;
    IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id=NEW.id) THEN
        -- Recheck under locks at the dispatch boundary, not merely at resolution.
        PERFORM v.id FROM vendors v JOIN personal_attempt_routes b ON b.vendor_id=v.id
            WHERE b.attempt_id=NEW.id FOR SHARE OF v;
        PERFORM m.alias FROM vendor_models m WHERE m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id) FOR SHARE;
        IF NOT EXISTS (
            SELECT 1 FROM personal_attempt_routes b
            JOIN personal_vendor_ownership o ON o.vendor_id=b.vendor_id
            JOIN vendors v ON v.id=b.vendor_id
            JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id)
            JOIN api_keys k ON k.id=NEW.api_key_id
            JOIN inspected_guardrail_bindings g ON g.attempt_id=NEW.id AND g.key_id=k.id
            WHERE b.attempt_id=NEW.id AND o.organization_id=NEW.organization_id
                AND v.enabled AND m.enabled
                AND v.revision=b.vendor_revision AND m.revision=b.model_revision
                AND NEW.dispatch_provider=v.adapter
                AND k.organization_id=NEW.organization_id AND k.project_id=NEW.project_id
                AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp()
                AND ('*'=ANY(k.allowed_models) OR NEW.resource_id=ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION 'personal dispatch ownership, policy or route changed' USING ERRCODE='P0011';
        END IF;
        IF EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM provider_attempt_offers WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM account_assignments WHERE attempt_id=NEW.id) THEN
            RAISE EXCEPTION 'personal dispatch has incompatible accounting' USING ERRCODE='P0011';
        END IF;
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM customer_balance_accounts WHERE organization_id=NEW.organization_id)
        AND NOT EXISTS (SELECT 1 FROM customer_balance_reservations
            WHERE attempt_id=NEW.id AND organization_id=NEW.organization_id AND released_at IS NULL)
        AND NOT EXISTS (
            SELECT 1 FROM customer_attempt_tariffs t
            JOIN customer_tariff_revisions r ON r.id=t.revision_id
            JOIN customer_attempt_balance_accounts b ON b.attempt_id=t.attempt_id AND b.currency=r.currency
            WHERE t.attempt_id=NEW.id AND b.organization_id=NEW.organization_id
                AND r.prompt_rate=0 AND r.completion_rate=0 AND COALESCE(r.cached_prompt_rate,0)=0
                AND COALESCE(r.reasoning_completion_rate,0)=0
                AND r.minimum_charge_nanos=0 AND r.request_fee_nanos=0
        ) THEN
        RAISE EXCEPTION 'prepaid dispatch requires a funded retail reservation' USING ERRCODE='P0009';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0244_supplier_reasoning_rates.sql 401
-- Independent Supplier rates; reasoning remains a subset of total output.
ALTER TABLE provider_offer_revisions ADD COLUMN reasoning_completion_rate BIGINT
    CHECK (reasoning_completion_rate BETWEEN 0 AND 1000000000000000);
ALTER TABLE provider_earnings ADD COLUMN reasoning_completion_tokens BIGINT
    CHECK (reasoning_completion_tokens >= 0 AND reasoning_completion_tokens <= completion_tokens);

-- @niu-legacy-migration 0245_request_cache_write_tokens.sql 489
-- Native Messages reports cache creation separately from ordinary input.
ALTER TABLE request_token_categories ADD COLUMN cache_write_input_tokens BIGINT
    CHECK (cache_write_input_tokens >= 0);
ALTER TABLE request_token_categories DROP CONSTRAINT request_token_categories_check;
ALTER TABLE request_token_categories ADD CONSTRAINT request_token_categories_check
    CHECK (cached_input_tokens IS NOT NULL OR reasoning_output_tokens IS NOT NULL OR cache_write_input_tokens IS NOT NULL);

-- @niu-legacy-migration 0246_customer_cache_write_rates.sql 4015
ALTER TABLE customer_tariff_revisions ADD COLUMN cache_write_prompt_rate BIGINT
    CHECK (cache_write_prompt_rate BETWEEN 0 AND 1000000000000000);
ALTER TABLE customer_charges ADD COLUMN cache_write_prompt_tokens BIGINT
    CHECK (cache_write_prompt_tokens >= 0 AND cache_write_prompt_tokens <= prompt_tokens - COALESCE(cached_prompt_tokens,0));

CREATE OR REPLACE FUNCTION require_customer_balance_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    END IF;
    -- Funding/account activation takes an organization update lock. Admission
    -- holds a shared lock until commit so activation cannot race this check.
    PERFORM id FROM organizations WHERE id=NEW.organization_id FOR SHARE;
    IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id=NEW.id) THEN
        -- Recheck under locks at the dispatch boundary, not merely at resolution.
        PERFORM v.id FROM vendors v JOIN personal_attempt_routes b ON b.vendor_id=v.id
            WHERE b.attempt_id=NEW.id FOR SHARE OF v;
        PERFORM m.alias FROM vendor_models m WHERE m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id) FOR SHARE;
        IF NOT EXISTS (
            SELECT 1 FROM personal_attempt_routes b
            JOIN personal_vendor_ownership o ON o.vendor_id=b.vendor_id
            JOIN vendors v ON v.id=b.vendor_id
            JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id)
            JOIN api_keys k ON k.id=NEW.api_key_id
            JOIN inspected_guardrail_bindings g ON g.attempt_id=NEW.id AND g.key_id=k.id
            WHERE b.attempt_id=NEW.id AND o.organization_id=NEW.organization_id
                AND v.enabled AND m.enabled
                AND v.revision=b.vendor_revision AND m.revision=b.model_revision
                AND NEW.dispatch_provider=v.adapter
                AND k.organization_id=NEW.organization_id AND k.project_id=NEW.project_id
                AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp()
                AND ('*'=ANY(k.allowed_models) OR NEW.resource_id=ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION 'personal dispatch ownership, policy or route changed' USING ERRCODE='P0011';
        END IF;
        IF EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM provider_attempt_offers WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM account_assignments WHERE attempt_id=NEW.id) THEN
            RAISE EXCEPTION 'personal dispatch has incompatible accounting' USING ERRCODE='P0011';
        END IF;
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM customer_balance_accounts WHERE organization_id=NEW.organization_id)
        AND NOT EXISTS (SELECT 1 FROM customer_balance_reservations
            WHERE attempt_id=NEW.id AND organization_id=NEW.organization_id AND released_at IS NULL)
        AND NOT EXISTS (
            SELECT 1 FROM customer_attempt_tariffs t
            JOIN customer_tariff_revisions r ON r.id=t.revision_id
            JOIN customer_attempt_balance_accounts b ON b.attempt_id=t.attempt_id AND b.currency=r.currency
            WHERE t.attempt_id=NEW.id AND b.organization_id=NEW.organization_id
                AND r.prompt_rate=0 AND r.completion_rate=0 AND COALESCE(r.cached_prompt_rate,0)=0
                AND COALESCE(r.reasoning_completion_rate,0)=0 AND COALESCE(r.cache_write_prompt_rate,0)=0
                AND r.minimum_charge_nanos=0 AND r.request_fee_nanos=0
        ) THEN
        RAISE EXCEPTION 'prepaid dispatch requires a funded retail reservation' USING ERRCODE='P0009';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0247_supplier_cache_write_rates.sql 347
ALTER TABLE provider_offer_revisions ADD COLUMN cache_write_prompt_rate BIGINT
    CHECK (cache_write_prompt_rate BETWEEN 0 AND 1000000000000000);
ALTER TABLE provider_earnings ADD COLUMN cache_write_prompt_tokens BIGINT
    CHECK (cache_write_prompt_tokens >= 0 AND cache_write_prompt_tokens <= prompt_tokens - COALESCE(cached_prompt_tokens,0));

-- @niu-legacy-migration 0248_customer_context_tiers.sql 4832
-- Tier schedules live inside the already immutable retail revision.
-- Historical flat revisions retain an empty schedule, with no invented tier.
ALTER TABLE customer_tariff_revisions ADD COLUMN context_tiers JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(context_tiers) = 'array' AND jsonb_array_length(context_tiers) <= 32);
ALTER TABLE customer_charges ADD COLUMN context_minimum_input_tokens BIGINT
    CHECK (context_minimum_input_tokens > 0 AND context_minimum_input_tokens <= prompt_tokens);

CREATE OR REPLACE FUNCTION require_customer_balance_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    END IF;
    -- Funding/account activation takes an organization update lock. Admission
    -- holds a shared lock until commit so activation cannot race this check.
    PERFORM id FROM organizations WHERE id=NEW.organization_id FOR SHARE;
    IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id=NEW.id) THEN
        -- Recheck under locks at the dispatch boundary, not merely at resolution.
        PERFORM v.id FROM vendors v JOIN personal_attempt_routes b ON b.vendor_id=v.id
            WHERE b.attempt_id=NEW.id FOR SHARE OF v;
        PERFORM m.alias FROM vendor_models m WHERE m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id) FOR SHARE;
        IF NOT EXISTS (
            SELECT 1 FROM personal_attempt_routes b
            JOIN personal_vendor_ownership o ON o.vendor_id=b.vendor_id
            JOIN vendors v ON v.id=b.vendor_id
            JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id)
            JOIN api_keys k ON k.id=NEW.api_key_id
            JOIN inspected_guardrail_bindings g ON g.attempt_id=NEW.id AND g.key_id=k.id
            WHERE b.attempt_id=NEW.id AND o.organization_id=NEW.organization_id
                AND v.enabled AND m.enabled
                AND v.revision=b.vendor_revision AND m.revision=b.model_revision
                AND NEW.dispatch_provider=v.adapter
                AND k.organization_id=NEW.organization_id AND k.project_id=NEW.project_id
                AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp()
                AND ('*'=ANY(k.allowed_models) OR NEW.resource_id=ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION 'personal dispatch ownership, policy or route changed' USING ERRCODE='P0011';
        END IF;
        IF EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM provider_attempt_offers WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM account_assignments WHERE attempt_id=NEW.id) THEN
            RAISE EXCEPTION 'personal dispatch has incompatible accounting' USING ERRCODE='P0011';
        END IF;
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM customer_balance_accounts WHERE organization_id=NEW.organization_id)
        AND NOT EXISTS (SELECT 1 FROM customer_balance_reservations
            WHERE attempt_id=NEW.id AND organization_id=NEW.organization_id AND released_at IS NULL)
        AND NOT EXISTS (
            SELECT 1 FROM customer_attempt_tariffs t
            JOIN customer_tariff_revisions r ON r.id=t.revision_id
            JOIN customer_attempt_balance_accounts b ON b.attempt_id=t.attempt_id AND b.currency=r.currency
            WHERE t.attempt_id=NEW.id AND b.organization_id=NEW.organization_id
                AND r.prompt_rate=0 AND r.completion_rate=0 AND COALESCE(r.cached_prompt_rate,0)=0
                AND COALESCE(r.reasoning_completion_rate,0)=0 AND COALESCE(r.cache_write_prompt_rate,0)=0
                AND r.minimum_charge_nanos=0 AND r.request_fee_nanos=0
                AND NOT EXISTS (
                    SELECT 1 FROM jsonb_array_elements(r.context_tiers) tier
                    JOIN cost_reservations bound ON bound.attempt_id=NEW.id
                    WHERE (tier->>'minimum_input_tokens')::bigint <= bound.prompt_bound
                      AND ((tier->>'prompt_rate')::bigint > 0 OR (tier->>'completion_rate')::bigint > 0
                        OR COALESCE((tier->>'cached_prompt_rate')::bigint,0) > 0
                        OR COALESCE((tier->>'cache_write_prompt_rate')::bigint,0) > 0
                        OR COALESCE((tier->>'reasoning_completion_rate')::bigint,0) > 0)
                )
        ) THEN
        RAISE EXCEPTION 'prepaid dispatch requires a funded retail reservation' USING ERRCODE='P0009';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0249_supplier_context_tiers.sql 448
-- Keep Supplier schedules and selections attached to immutable financial records.
ALTER TABLE provider_offer_revisions ADD COLUMN context_tiers JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(context_tiers) = 'array' AND jsonb_array_length(context_tiers) <= 32);
ALTER TABLE provider_earnings ADD COLUMN context_minimum_input_tokens BIGINT
    CHECK (context_minimum_input_tokens > 0 AND context_minimum_input_tokens <= prompt_tokens);

-- @niu-legacy-migration 0250_customer_media_financial_recovery.sql 578
-- Media settlement uses the existing bounded financial worker, independently
-- of optional upstream video polling. No ledger or reservation is rewritten.
ALTER TABLE financial_recovery_progress
    DROP CONSTRAINT financial_recovery_progress_stage_check;
ALTER TABLE financial_recovery_progress
    ADD CONSTRAINT financial_recovery_progress_stage_check CHECK (stage IN (
        'balance_release', 'customer_charge', 'customer_media_charge',
        'supplier_earning', 'upstream_cost'
    ));
INSERT INTO financial_recovery_progress(stage) VALUES ('customer_media_charge');

-- @niu-legacy-migration 0251_media_completion_recovery.sql 588
-- Recover the gap between durable success observation and completion marking.
-- This stage performs no egress and does not establish billable usage.
ALTER TABLE financial_recovery_progress
    DROP CONSTRAINT financial_recovery_progress_stage_check;
ALTER TABLE financial_recovery_progress
    ADD CONSTRAINT financial_recovery_progress_stage_check CHECK (stage IN (
        'media_completion', 'balance_release', 'customer_charge',
        'customer_media_charge', 'supplier_earning', 'upstream_cost'
    ));
INSERT INTO financial_recovery_progress(stage) VALUES ('media_completion');

-- @niu-legacy-migration 0252_anthropic_vendor_adapter.sql 342
-- Native Messages already supports Anthropic transport; allow managed credentials
-- to select that adapter without relabeling it as an OpenAI-compatible service.
ALTER TABLE vendors DROP CONSTRAINT vendors_adapter_check;
ALTER TABLE vendors ADD CONSTRAINT vendors_adapter_check
    CHECK (adapter IN ('openrouter', 'openai', 'anthropic'));

-- @niu-legacy-migration 0253_gemini_vendor_adapter.sql 275
-- Native GenerateContent credentials share the existing encrypted Supplier lifecycle.
ALTER TABLE vendors DROP CONSTRAINT vendors_adapter_check;
ALTER TABLE vendors ADD CONSTRAINT vendors_adapter_check
    CHECK (adapter IN ('openrouter', 'openai', 'anthropic', 'gemini'));

-- @niu-legacy-migration 0254_customer_reservation_directory.sql 325
-- Company-wide keyset inspection of open customer holds. Released cursor lookup
-- continues to use the existing attempt primary key after settlement.
CREATE INDEX customer_balance_reservations_company_open
    ON customer_balance_reservations(organization_id,created_at DESC,attempt_id DESC)
    WHERE released_at IS NULL;

-- @niu-legacy-migration 0255_openrouter_generation_references.sql 674
-- Server-only correlation evidence, separate from customer payload retention.
-- An upstream reference is not usage, a charge, or proof of nonexecution.
CREATE TABLE openrouter_generation_references (
    attempt_id UUID PRIMARY KEY REFERENCES managed_attempt_routes(attempt_id),
    generation_id TEXT NOT NULL UNIQUE
        CHECK (length(generation_id) BETWEEN 5 AND 200 AND generation_id ~ '^gen-[A-Za-z0-9_-]+$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);
CREATE TRIGGER immutable_openrouter_generation_reference
    BEFORE UPDATE OR DELETE ON openrouter_generation_references
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0256_openrouter_usage_reconciliation.sql 1062
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

-- @niu-legacy-migration 0257_generation_completion_evidence.sql 896
-- Older receipts did not retain these terminal fields. Never invent their values.
ALTER TABLE openrouter_usage_reconciliations
    ADD COLUMN upstream_finish_reason TEXT,
    ADD COLUMN upstream_cancelled BOOLEAN;
ALTER TABLE openrouter_usage_reconciliations
    DROP CONSTRAINT openrouter_usage_reconciliations_source_version_check;
ALTER TABLE openrouter_usage_reconciliations
    ADD CONSTRAINT openrouter_usage_reconciliation_evidence_version CHECK (
        (source_version='openrouter-native-generation-v1'
            AND upstream_finish_reason IS NULL AND upstream_cancelled IS NULL)
        OR (source_version='openrouter-native-generation-v2'
            AND upstream_finish_reason IS NOT NULL
            AND upstream_finish_reason IN ('stop','length')
            AND upstream_cancelled IS FALSE)
    );
-- Keep the old default for older writers; new writers explicitly identify v2.

-- @niu-legacy-migration 0258_generation_model_binding.sql 325
-- Capture the dispatched upstream identity, not a later editable model mapping.
-- Historical references lack this evidence and retain their strict revision check.
ALTER TABLE openrouter_generation_references
    ADD COLUMN upstream_model TEXT
    CHECK (upstream_model IS NULL OR length(upstream_model) BETWEEN 1 AND 200);

-- @niu-legacy-migration 0259_generation_tool_completion.sql 621
-- A completed client-tool turn is terminal provider work, not task completion.
ALTER TABLE openrouter_usage_reconciliations DROP CONSTRAINT openrouter_usage_reconciliation_evidence_version;
ALTER TABLE openrouter_usage_reconciliations ADD CONSTRAINT openrouter_usage_reconciliation_evidence_version CHECK (
 (source_version='openrouter-native-generation-v1' AND upstream_finish_reason IS NULL AND upstream_cancelled IS NULL)
 OR (source_version='openrouter-native-generation-v2' AND upstream_finish_reason IS NOT NULL
     AND upstream_finish_reason IN ('stop','length','tool_calls') AND upstream_cancelled IS FALSE)
);

-- @niu-legacy-migration 0260_zero_request_rate.sql 3618
-- Distinguish a configured dispatch prohibition from a rolling-window denial.
CREATE OR REPLACE FUNCTION niu_enforce_key_request_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    root UUID;
    rpm BIGINT;
    admitted BIGINT;
    checked_at TIMESTAMPTZ;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN
        RETURN NEW;
    END IF;
    SELECT spending_root_id INTO root FROM api_keys WHERE id=NEW.api_key_id;
    IF root IS NULL THEN RETURN NEW; END IF;
    -- Lock the configured policy, not the key row: dispatch already holds key SHARE locks.
    SELECT requests_per_minute INTO rpm FROM key_request_rate_limits
        WHERE spending_root_id=root FOR UPDATE;
    IF NOT FOUND THEN RETURN NEW; END IF;
    IF rpm = 0 THEN
        RAISE EXCEPTION 'API key request rate is disabled' USING ERRCODE='P0026';
    END IF;
    checked_at := clock_timestamp();
    DELETE FROM key_request_rate_admissions WHERE spending_root_id=root AND admitted_at <= checked_at - INTERVAL '60 seconds';
    IF rpm IS NOT NULL THEN
        SELECT count(*) INTO admitted FROM key_request_rate_admissions
            WHERE spending_root_id=root AND admitted_at > checked_at - INTERVAL '60 seconds';
        IF admitted >= rpm THEN
            RAISE EXCEPTION 'API key request rate exhausted' USING ERRCODE='P0020';
        END IF;
    END IF;
    INSERT INTO key_request_rate_admissions(attempt_id,spending_root_id,admitted_at)
        VALUES(NEW.id,root,checked_at);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION niu_enforce_vendor_request_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    credential UUID;
    credentials UUID[];
    rpm BIGINT;
    checked_at TIMESTAMPTZ;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN
        RETURN NEW;
    END IF;
    -- The immutable attempt bindings identify the actual credential, never the current alias.
    SELECT array_agg(vendor_id) INTO credentials FROM (
        SELECT vendor_id FROM managed_attempt_routes WHERE attempt_id=NEW.id
        UNION SELECT vendor_id FROM personal_attempt_routes WHERE attempt_id=NEW.id
        UNION SELECT vendor_id FROM media_recovery_routes WHERE attempt_id=NEW.id
    ) bound;
    IF cardinality(credentials) > 1 THEN
        RAISE EXCEPTION 'Conflicting credential bindings' USING ERRCODE='P0024';
    END IF;
    credential := credentials[1];
    IF credential IS NULL THEN RETURN NEW; END IF;
    -- Serialize policy edits and admissions without upgrading vendor SHARE locks.
    SELECT requests_per_minute INTO rpm FROM vendor_request_rate_limits
        WHERE vendor_id=credential FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credential rate policy missing' USING ERRCODE='P0024'; END IF;
    IF rpm = 0 THEN
        RAISE EXCEPTION 'Upstream credential request rate is disabled' USING ERRCODE='P0027';
    END IF;
    checked_at := clock_timestamp();
    DELETE FROM vendor_request_rate_admissions WHERE vendor_id=credential
        AND admitted_at <= checked_at - INTERVAL '60 seconds';
    IF rpm IS NOT NULL AND (SELECT count(*) FROM vendor_request_rate_admissions
        WHERE vendor_id=credential AND admitted_at > checked_at - INTERVAL '60 seconds') >= rpm THEN
        RAISE EXCEPTION 'Upstream credential request rate exhausted' USING ERRCODE='P0025';
    END IF;
    -- Count even unlimited dispatches so applying a cap cannot forget the current window.
    INSERT INTO vendor_request_rate_admissions(attempt_id,vendor_id,admitted_at)
        VALUES(NEW.id,credential,checked_at);
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0261_workspace_route_slug.sql 1475
-- A routing reference, never a display label or authorization grant. The full
-- existing UUID suffix makes duplicate names collision-safe without changing IDs.
ALTER TABLE projects ADD COLUMN route_slug TEXT;

CREATE FUNCTION niu_initial_workspace_route_slug(workspace_name TEXT, workspace_id UUID)
RETURNS TEXT LANGUAGE SQL IMMUTABLE STRICT AS $$
    SELECT COALESCE(NULLIF(trim(both '-' FROM left(
        regexp_replace(lower(workspace_name COLLATE "C"), '[^a-z0-9]+', '-', 'g'), 48)), ''), 'workspace')
        || '-' || replace(workspace_id::text, '-', '');
$$;

UPDATE projects SET route_slug = niu_initial_workspace_route_slug(name, id);
ALTER TABLE projects ALTER COLUMN route_slug SET NOT NULL;
ALTER TABLE projects ADD CONSTRAINT workspace_route_slug_unique UNIQUE (route_slug);
ALTER TABLE projects ADD CONSTRAINT workspace_route_slug_format
    CHECK (route_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(route_slug) <= 81);

CREATE FUNCTION preserve_workspace_route_slug() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.route_slug := niu_initial_workspace_route_slug(NEW.name, NEW.id);
    ELSIF NEW.route_slug IS DISTINCT FROM OLD.route_slug THEN
        RAISE EXCEPTION 'workspace route identity is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_workspace_route_slug BEFORE INSERT OR UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION preserve_workspace_route_slug();

-- @niu-legacy-migration 0262_media_result_transport_timing.sql 309
-- Result retrieval is transport evidence, never another generation or charge.
ALTER TABLE media_transport_timings DROP CONSTRAINT media_transport_timings_phase_check;
ALTER TABLE media_transport_timings ADD CONSTRAINT media_transport_timings_phase_check
    CHECK (phase IN ('submission','query','result'));

-- @niu-legacy-migration 0263_workspace_creation_receipts.sql 885
-- Actor-scoped creation identity survives workspace deletion; replay never
-- recreates a deleted workspace. Store hashes, not client keys or request names.
CREATE TABLE workspace_creation_receipts (
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','member')),
    actor_id UUID NOT NULL,
    key_sha256 BYTEA NOT NULL CHECK (octet_length(key_sha256)=32),
    request_sha256 BYTEA NOT NULL CHECK (octet_length(request_sha256)=32),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (actor_kind,actor_id,key_sha256),
    CHECK ((actor_kind='installation')=(actor_id='00000000-0000-0000-0000-000000000000'::uuid))
);
CREATE TRIGGER immutable_workspace_creation_receipt BEFORE UPDATE OR DELETE
    ON workspace_creation_receipts FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0264_customer_ledger_idempotency_namespaces.sql 2269
-- Caller-controlled reversal keys must not consume the namespace used by
-- automatic attempt debits. Preserve all historical entries and their keys.
ALTER TABLE customer_balance_entries
    DROP CONSTRAINT customer_balance_entries_account_id_idempotency_key_key;
CREATE UNIQUE INDEX customer_balance_noncharge_idempotency
    ON customer_balance_entries(account_id,idempotency_key) WHERE kind<>'charge';
-- customer_balance_charge_once already enforces one debit per attempt.

CREATE OR REPLACE FUNCTION protect_customer_balance_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'customer reservations cannot be deleted'; END IF;
    IF ROW(NEW.attempt_id,NEW.organization_id,NEW.account_id,NEW.currency,NEW.amount_nanos,NEW.created_at)
        IS DISTINCT FROM ROW(OLD.attempt_id,OLD.organization_id,OLD.account_id,OLD.currency,OLD.amount_nanos,OLD.created_at)
        OR OLD.released_at IS NOT NULL OR NEW.released_at IS NULL THEN
        RAISE EXCEPTION 'only a terminal reservation release is permitted';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM attempts a WHERE a.id=OLD.attempt_id
        AND (a.execution IN ('not_sent','confirmed_not_executed')
            OR EXISTS (
                SELECT 1 FROM (
                    SELECT organization_id,project_id,attempt_id,currency,amount_nanos FROM customer_charges
                    UNION ALL
                    SELECT organization_id,project_id,attempt_id,currency,amount_nanos FROM customer_media_charges
                ) c WHERE c.attempt_id=a.id AND c.organization_id=OLD.organization_id
                    AND c.project_id=a.project_id AND c.currency=OLD.currency
                    AND (c.amount_nanos=0 OR EXISTS (
                        SELECT 1 FROM customer_balance_entries e
                        WHERE e.attempt_id=c.attempt_id AND e.kind='charge'
                            AND e.organization_id=c.organization_id AND e.project_id=c.project_id
                            AND e.account_id=OLD.account_id AND e.currency=c.currency
                            AND e.amount_nanos=-c.amount_nanos
                    ))))) THEN
        RAISE EXCEPTION 'unposted customer liability cannot be released';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0265_pending_upstream_cost_recovery.sql 271
-- Recovery traverses pending procurement reservations by attempt. Settled and
-- released history must not enlarge this index; no financial row is rewritten.
CREATE INDEX cost_reservations_pending_recovery
    ON cost_reservations (attempt_id)
    WHERE state = 'held';

-- @niu-legacy-migration 0266_company_creation_receipts.sql 600
-- Installation-scoped creation identity. Keep the receipt after company deletion
-- so a retry cannot silently create a new company or a new balance account.
CREATE TABLE company_creation_receipts (
    key_sha256 BYTEA PRIMARY KEY CHECK (octet_length(key_sha256)=32),
    request_sha256 BYTEA NOT NULL CHECK (octet_length(request_sha256)=32),
    organization_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_company_creation_receipt BEFORE UPDATE OR DELETE
    ON company_creation_receipts FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0267_company_directory_order.sql 143
-- Support stable keyset traversal as the company directory grows.
CREATE INDEX organizations_directory_order ON organizations(created_at,id);

-- @niu-legacy-migration 0268_pending_customer_balance_recovery.sql 295
-- Recovery walks pending reservations globally by attempt, independently of
-- account-scoped admission and company-scoped reservation directory indexes.
CREATE INDEX customer_balance_reservations_pending_recovery
    ON customer_balance_reservations(attempt_id)
    WHERE released_at IS NULL;

-- @niu-legacy-migration 0269_financial_recovery_diagnostics.sql 745
-- NULL means no durable worker step has committed since diagnostics were added.
-- A committed step is traversal evidence, not proof that liabilities are settled.
ALTER TABLE financial_recovery_progress
    ADD COLUMN last_step_at TIMESTAMPTZ,
    ADD COLUMN last_candidate_count INTEGER,
    ADD COLUMN last_failure_count INTEGER,
    ADD CONSTRAINT financial_recovery_diagnostics_consistent CHECK (
        (last_step_at IS NULL AND last_candidate_count IS NULL AND last_failure_count IS NULL)
        OR
        (last_step_at IS NOT NULL AND last_candidate_count IS NOT NULL
         AND last_failure_count IS NOT NULL AND last_candidate_count >= 0
         AND last_failure_count >= 0 AND last_failure_count <= last_candidate_count)
    );

-- @niu-legacy-migration 0270_encryption_rotation_maintenance.sql 1128
-- Offline rotation coordination. No key, ciphertext or plaintext belongs here.
-- The command remains unavailable until all encrypted domains are implemented.
CREATE TABLE encryption_rotation_operations (
    id UUID PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    completed_at TIMESTAMPTZ,
    CHECK (completed_at IS NULL OR completed_at >= started_at)
);
CREATE UNIQUE INDEX one_active_encryption_rotation
    ON encryption_rotation_operations ((TRUE)) WHERE completed_at IS NULL;

CREATE FUNCTION preserve_encryption_rotation_operation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL
       AND ROW(NEW.id, NEW.started_at) IS NOT DISTINCT FROM ROW(OLD.id, OLD.started_at)
    THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'encryption rotation history permits completion only' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_encryption_rotation_operation
    BEFORE UPDATE OR DELETE ON encryption_rotation_operations
    FOR EACH ROW EXECUTE FUNCTION preserve_encryption_rotation_operation();

-- @niu-legacy-migration 0271_encryption_rewrap_authorizations.sql 6811
-- Narrow per-row authority for the future offline rotation command. The command
-- must authenticate plaintext equivalence; PostgreSQL enforces metadata equality,
-- exact before/after representations, active operation and transaction ownership.
-- No plaintext, ciphertext or encryption keys are stored in this audit table.
CREATE TABLE encryption_rewrap_authorizations (
    operation_id UUID NOT NULL REFERENCES encryption_rotation_operations(id),
    transaction_id BIGINT NOT NULL DEFAULT txid_current(),
    table_name TEXT NOT NULL CHECK (table_name IN (
        'vendors', 'vendor_asset_management_credentials', 'codex_connections',
        'payment_gateway_configuration', 'media_result_references',
        'asset_listing_results', 'asset_lookup_results', 'asset_group_read_results',
        'asset_group_update_patches', 'inspected_image_source_content'
    )),
    old_record_sha256 BYTEA NOT NULL CHECK (octet_length(old_record_sha256)=32),
    new_record_sha256 BYTEA NOT NULL CHECK (octet_length(new_record_sha256)=32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (operation_id, transaction_id, table_name, old_record_sha256)
);
CREATE TRIGGER immutable_encryption_rewrap_authorization
    BEFORE UPDATE OR DELETE ON encryption_rewrap_authorizations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION niu_authorized_encryption_rewrap(
    relation_name TEXT, cipher_column TEXT, old_record JSONB, new_record JSONB
) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        old_record->>cipher_column IS NOT NULL
        AND new_record->>cipher_column IS NOT NULL
        AND (old_record-cipher_column)=(new_record-cipher_column)
        AND EXISTS (
            SELECT 1 FROM encryption_rewrap_authorizations a
            JOIN encryption_rotation_operations o ON o.id=a.operation_id
            WHERE o.completed_at IS NULL
              AND a.transaction_id=txid_current()
              AND a.table_name=relation_name
              AND a.old_record_sha256=sha256(convert_to(old_record::TEXT,'UTF8'))
              AND a.new_record_sha256=sha256(convert_to(new_record::TEXT,'UTF8'))
        ), FALSE)
$$;

CREATE OR REPLACE FUNCTION preserve_asset_management_credential_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND niu_authorized_encryption_rewrap(
        TG_TABLE_NAME, 'credential_ciphertext', to_jsonb(OLD), to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE'
       AND OLD.credential_ciphertext IS NOT NULL AND NEW.credential_ciphertext IS NULL
       AND ROW(NEW.vendor_id,NEW.revision,NEW.upstream_project,NEW.created_at,NEW.actor_kind)
           IS NOT DISTINCT FROM ROW(OLD.vendor_id,OLD.revision,OLD.upstream_project,OLD.created_at,OLD.actor_kind)
       AND EXISTS (SELECT 1 FROM vendor_asset_management_revocations r
                   WHERE r.vendor_id=OLD.vendor_id AND r.through_revision>=OLD.revision)
    THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'asset management credential revisions are immutable except revoked-secret erasure' USING ERRCODE='23514';
END;
$$;

CREATE OR REPLACE FUNCTION preserve_asset_listing_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND niu_authorized_encryption_rewrap(
        TG_TABLE_NAME, 'ciphertext', to_jsonb(OLD), to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS NULL
       AND NEW.deleted_at IS NOT NULL AND NEW.listing_id=OLD.listing_id AND NEW.expires_at=OLD.expires_at THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'asset listing results permit erasure only' USING ERRCODE='23514';
END;
$$;

CREATE OR REPLACE FUNCTION preserve_asset_lookup_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND niu_authorized_encryption_rewrap(
        TG_TABLE_NAME, 'ciphertext', to_jsonb(OLD), to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS NULL
       AND NEW.deleted_at IS NOT NULL AND NEW.lookup_id=OLD.lookup_id AND NEW.expires_at=OLD.expires_at THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'asset lookup results permit erasure only' USING ERRCODE='23514';
END;
$$;

CREATE OR REPLACE FUNCTION preserve_asset_group_read_result() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND niu_authorized_encryption_rewrap(
        TG_TABLE_NAME, 'ciphertext', to_jsonb(OLD), to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS NULL
       AND NEW.deleted_at IS NOT NULL AND NEW.read_id=OLD.read_id AND NEW.expires_at=OLD.expires_at THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'asset read results permit erasure only' USING ERRCODE='23514';
END;
$$;

CREATE OR REPLACE FUNCTION preserve_asset_group_update_patch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND niu_authorized_encryption_rewrap(
        TG_TABLE_NAME, 'ciphertext', to_jsonb(OLD), to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS NULL
       AND NEW.deleted_at IS NOT NULL AND NEW.update_id=OLD.update_id AND NEW.expires_at=OLD.expires_at THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'asset group update patch permits erasure only' USING ERRCODE='23514';
END;
$$;

CREATE FUNCTION preserve_inspected_image_envelope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF niu_authorized_encryption_rewrap(
        TG_TABLE_NAME, 'ciphertext', to_jsonb(OLD), to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'inspected image content is immutable outside authorized re-encryption' USING ERRCODE='23514';
END;
$$;
DROP TRIGGER immutable_inspected_image_source_bytes ON inspected_image_source_content;
CREATE TRIGGER immutable_inspected_image_source_bytes BEFORE UPDATE ON inspected_image_source_content
    FOR EACH ROW EXECUTE FUNCTION preserve_inspected_image_envelope();

CREATE OR REPLACE FUNCTION niu_invalidate_supplier_route_qualification() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    affected RECORD;
BEGIN
    IF niu_authorized_encryption_rewrap(
        TG_TABLE_NAME, 'credential_ciphertext', to_jsonb(OLD), to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
    FOR affected IN
        UPDATE provider_offers
           SET active = FALSE, current_qualification_review = NULL
         WHERE vendor_id = OLD.id
           AND current_qualification_review IS NOT NULL
        RETURNING provider_id, id
    LOOP
        INSERT INTO provider_audit_events(provider_id, action, resource_id)
        VALUES (affected.provider_id, 'route_qualification_invalidated', affected.id);
    END LOOP;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0272_encryption_rotation_key_binding.sql 1930
-- Keyed, operation-specific verification values are computed outside PostgreSQL.
-- Legacy maintenance records remain unbound and cannot be resumed by the writer.
ALTER TABLE encryption_rotation_operations
    ADD COLUMN source_key_check BYTEA,
    ADD COLUMN target_key_check BYTEA,
    ADD CONSTRAINT encryption_rotation_key_binding_complete CHECK (
        (source_key_check IS NULL AND target_key_check IS NULL)
        OR (source_key_check IS NOT NULL AND target_key_check IS NOT NULL
            AND octet_length(source_key_check)=32 AND octet_length(target_key_check)=32)
    );
CREATE OR REPLACE FUNCTION preserve_encryption_rotation_operation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE'
       AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL
       AND (to_jsonb(NEW)-'completed_at')=(to_jsonb(OLD)-'completed_at')
    THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'encryption rotation history permits completion only' USING ERRCODE='23514';
END;
$$;

CREATE OR REPLACE FUNCTION niu_authorized_encryption_rewrap(
    relation_name TEXT, cipher_column TEXT, old_record JSONB, new_record JSONB
) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT COALESCE(
        old_record->>cipher_column IS NOT NULL
        AND new_record->>cipher_column IS NOT NULL
        AND (old_record-cipher_column)=(new_record-cipher_column)
        AND EXISTS (
            SELECT 1 FROM encryption_rewrap_authorizations a
            JOIN encryption_rotation_operations o ON o.id=a.operation_id
            WHERE o.completed_at IS NULL
              AND o.source_key_check IS NOT NULL AND o.target_key_check IS NOT NULL
              AND a.transaction_id=txid_current()
              AND a.table_name=relation_name
              AND a.old_record_sha256=sha256(convert_to(old_record::TEXT,'UTF8'))
              AND a.new_record_sha256=sha256(convert_to(new_record::TEXT,'UTF8'))
        ), FALSE)
$$;

-- @niu-legacy-migration 0273_supplier_configuration_usage_indexes.sql 282
-- Read-side operational Supplier statistics; no commercial qualification backfill.
CREATE INDEX managed_attempt_routes_vendor_attempt ON managed_attempt_routes(vendor_id,attempt_id);
CREATE INDEX media_recovery_routes_vendor_attempt ON media_recovery_routes(vendor_id,attempt_id);

-- @niu-legacy-migration 0274_responses_retry_policy.sql 371
-- Existing operations retain their immutable protocol-specific policy.
ALTER TABLE gateway_retry_policies DROP CONSTRAINT gateway_retry_policies_policy_revision_check;
ALTER TABLE gateway_retry_policies ADD CONSTRAINT gateway_retry_policies_policy_revision_check CHECK (policy_revision IN ('openrouter-chat-auth-rejection-v1','openrouter-responses-auth-rejection-v1'));

-- @niu-legacy-migration 0275_asset_group_request_cleanup.sql 1940
-- Local retry eligibility only: no request content or database error text.
CREATE TABLE asset_group_request_cleanup_retries (
    record_id UUID PRIMARY KEY REFERENCES asset_group_create_intents(id),
    retry_after TIMESTAMPTZ NOT NULL
);

CREATE TRIGGER clear_asset_group_request_cleanup_retry
AFTER UPDATE OF request_body ON asset_group_create_intents
FOR EACH ROW WHEN (NEW.request_body IS NULL)
EXECUTE FUNCTION clear_asset_content_cleanup_retry('asset_group_request_cleanup_retries', 'id');

-- Preserve the original retention predicate and immutable intent provenance.
-- Each row is a subtransaction; infrastructure failures still abort the page.
CREATE FUNCTION niu_purge_asset_group_request_page() RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    candidate UUID;
    removed BIGINT := 0;
    affected BIGINT;
BEGIN
    FOR candidate IN
        SELECT i.id FROM asset_group_create_intents i
        LEFT JOIN asset_group_request_cleanup_retries r ON r.record_id=i.id
        WHERE i.request_body IS NOT NULL AND i.request_expires_at<=clock_timestamp()
          AND (r.retry_after IS NULL OR r.retry_after<=clock_timestamp())
        ORDER BY i.request_expires_at,i.id
        LIMIT 64 FOR UPDATE OF i SKIP LOCKED
    LOOP
        BEGIN
            UPDATE asset_group_create_intents SET request_body=NULL
             WHERE id=candidate AND request_body IS NOT NULL
               AND request_expires_at<=clock_timestamp();
            GET DIAGNOSTICS affected = ROW_COUNT;
            removed := removed + affected;
        EXCEPTION
            WHEN integrity_constraint_violation OR data_exception OR raise_exception THEN
                INSERT INTO asset_group_request_cleanup_retries(record_id,retry_after)
                VALUES(candidate,clock_timestamp()+interval '60 seconds')
                ON CONFLICT(record_id) DO UPDATE SET retry_after=EXCLUDED.retry_after;
        END;
    END LOOP;
    RETURN removed;
END;
$$;

-- @niu-legacy-migration 0276_gateway_deadline_error.sql 609
-- Preserve the dispatch predicate; give this known pre-dispatch denial its own
-- SQLSTATE so callers do not report it as a database outage or upstream failure.
CREATE OR REPLACE FUNCTION require_gateway_retry_deadline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution='may_have_executed' AND OLD.execution='not_sent' AND EXISTS (
        SELECT 1 FROM gateway_retry_policies p
        WHERE p.operation_id=NEW.operation_id AND p.deadline<=clock_timestamp()
    ) THEN
        RAISE EXCEPTION 'Gateway operation deadline expired' USING ERRCODE='P0028';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0277_routing_registry_publications.sql 6877
-- Server-only immutable routing publications. Never store API key material here.
CREATE TABLE routing_registry_generations (
    generation BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    static_identity TEXT NOT NULL CHECK(length(static_identity)=64),
    compiled JSONB NOT NULL CHECK(jsonb_typeof(compiled)='object'),
    source_transaction TEXT NOT NULL DEFAULT pg_current_xact_id()::text,
    published_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_routing_registry_generations
    BEFORE UPDATE OR DELETE ON routing_registry_generations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE routing_registry_active (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK(singleton),
    generation BIGINT NOT NULL REFERENCES routing_registry_generations(generation)
);

-- Serialization precedes domain row locks, including an older process's writes.
-- Ciphertext-only offline re-encryption is not a configuration revision change.
CREATE FUNCTION niu_require_registry_writer() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(716554);
    IF EXISTS(SELECT 1 FROM routing_registry_active)
       AND current_setting('niu.registry_writer',true) IS DISTINCT FROM 'v1' THEN
        RAISE EXCEPTION 'Routing publication writer required' USING ERRCODE='P0029';
    END IF;
    PERFORM set_config('niu.registry_dirty','1',true);
    RETURN NULL;
END;
$$;
CREATE FUNCTION niu_require_registry_publication() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS(SELECT 1 FROM routing_registry_active) AND (
        current_setting('niu.registry_dirty',true) IS DISTINCT FROM '0'
        OR NOT EXISTS(
            SELECT 1 FROM routing_registry_active a
            JOIN routing_registry_generations g ON g.generation=a.generation
            WHERE g.source_transaction=pg_current_xact_id()::text
        )
    ) THEN
        RAISE EXCEPTION 'Routing configuration was not published' USING ERRCODE='P0029';
    END IF;
    RETURN NULL;
END;
$$;
CREATE TRIGGER registry_writer_vendor_models BEFORE INSERT OR UPDATE OR DELETE ON vendor_models
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_vendor_models AFTER INSERT OR UPDATE OR DELETE ON vendor_models
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_model_route_pools BEFORE INSERT OR UPDATE OR DELETE ON model_route_pools
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_model_route_pools AFTER INSERT OR UPDATE OR DELETE ON model_route_pools
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_personal_vendor_ownership BEFORE INSERT OR UPDATE OR DELETE ON personal_vendor_ownership
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_personal_vendor_ownership AFTER INSERT OR UPDATE OR DELETE ON personal_vendor_ownership
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_vendor_supplier_ownership BEFORE INSERT OR UPDATE OR DELETE ON vendor_supplier_ownership
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_vendor_supplier_ownership AFTER INSERT OR UPDATE OR DELETE ON vendor_supplier_ownership
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_provider_offers BEFORE INSERT OR UPDATE OR DELETE ON provider_offers
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_provider_offers AFTER INSERT OR UPDATE OR DELETE ON provider_offers
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_provider_qualification_reviews BEFORE INSERT OR UPDATE OR DELETE ON provider_qualification_reviews
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_provider_qualification_reviews AFTER INSERT OR UPDATE OR DELETE ON provider_qualification_reviews
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_provider_qualification_revocations BEFORE INSERT OR UPDATE OR DELETE ON provider_qualification_revocations
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_provider_qualification_revocations AFTER INSERT OR UPDATE OR DELETE ON provider_qualification_revocations
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_provider_offer_qualification_reviews BEFORE INSERT OR UPDATE OR DELETE ON provider_offer_qualification_reviews
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_provider_offer_qualification_reviews AFTER INSERT OR UPDATE OR DELETE ON provider_offer_qualification_reviews
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_vendors BEFORE INSERT OR DELETE OR UPDATE OF name,adapter,api_base,enabled,revision,bootstrap_name ON vendors
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_vendors AFTER INSERT OR DELETE OR UPDATE OF name,adapter,api_base,enabled,revision,bootstrap_name ON vendors
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();
CREATE TRIGGER registry_writer_supplier_review BEFORE UPDATE OF current_qualification_review ON provider_businesses
    FOR EACH STATEMENT EXECUTE FUNCTION niu_require_registry_writer();
CREATE CONSTRAINT TRIGGER registry_publication_supplier_review AFTER UPDATE OF current_qualification_review ON provider_businesses
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION niu_require_registry_publication();

-- Historical attempts remain explicitly unattributed; never infer from current state.
CREATE TABLE attempt_route_generations (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id) DEFERRABLE INITIALLY DEFERRED,
    generation BIGINT NOT NULL REFERENCES routing_registry_generations(generation)
);
CREATE INDEX attempt_route_generations_by_generation ON attempt_route_generations(generation);
CREATE TRIGGER immutable_attempt_route_generations BEFORE UPDATE OR DELETE ON attempt_route_generations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0278_media_posted_account_binding.sql 1284
-- One posted-media predicate for reporting, recovery and invoice issuance.
-- Keep the original attempt account binding; a different account cannot settle it.
CREATE OR REPLACE VIEW customer_activity_charges AS
SELECT organization_id, project_id, attempt_id, currency, amount_nanos
FROM customer_charges
UNION ALL
SELECT m.organization_id, m.project_id, m.attempt_id, m.currency, m.amount_nanos
FROM customer_media_charges m
JOIN customer_attempt_balance_accounts b
    ON b.attempt_id=m.attempt_id AND b.organization_id=m.organization_id
    AND b.project_id=m.project_id AND b.currency=m.currency
WHERE NOT EXISTS (SELECT 1 FROM customer_charges t WHERE t.attempt_id=m.attempt_id)
AND (
    (m.amount_nanos>0 AND EXISTS (
        SELECT 1 FROM customer_balance_entries e
        WHERE e.account_id=b.account_id AND e.organization_id=m.organization_id
          AND e.project_id=m.project_id AND e.attempt_id=m.attempt_id
          AND e.currency=m.currency AND e.kind='charge'
          AND e.amount_nanos=-m.amount_nanos
    ))
    OR (m.amount_nanos=0 AND EXISTS (
        SELECT 1 FROM customer_balance_reservations r
        WHERE r.account_id=b.account_id AND r.organization_id=m.organization_id
          AND r.attempt_id=m.attempt_id AND r.released_at IS NOT NULL
    ))
);

-- @niu-legacy-migration 0279_workspace_key_directory_order.sql 262
-- Match tenant equality and the stable keyset order used by key metadata pages.
-- Preserve expired/revoked records: both remain part of the saved directory.
CREATE INDEX api_keys_workspace_created
    ON api_keys (organization_id, project_id, created_at, id);

-- @niu-legacy-migration 0280_chat_session_write_revision.sql 286
-- Global revisions prevent stale writes and delete/recreate ABA within an owner.
CREATE SEQUENCE chat_session_write_revisions AS BIGINT;
ALTER TABLE chat_sessions ADD COLUMN write_revision BIGINT NOT NULL
    DEFAULT nextval('chat_session_write_revisions') CHECK (write_revision > 0);

-- @niu-legacy-migration 0281_chat_session_guarded_writes.sql 169
-- Once an owner opts into guarded writes, compatibility clients cannot bypass them.
ALTER TABLE chat_sessions ADD COLUMN guarded_writes BOOLEAN NOT NULL DEFAULT false;

-- @niu-legacy-migration 0282_chat_session_guarded_keys.sql 577
-- Retain guard identity without content so old autosaves cannot resurrect deletions.
CREATE TABLE chat_session_guarded_keys (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    owner TEXT NOT NULL,
    session_id UUID NOT NULL,
    PRIMARY KEY (organization_id, project_id, owner, session_id),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id)
);
INSERT INTO chat_session_guarded_keys (organization_id, project_id, owner, session_id)
SELECT organization_id, project_id, owner, id FROM chat_sessions WHERE guarded_writes;

-- @niu-legacy-migration 0283_chat_guard_scope_cleanup.sql 576
-- Guard identities protect references only while their workspace exists.
-- They contain no conversation or accounting data and must not block deleting
-- an otherwise empty workspace. Other business-record foreign keys still block.
ALTER TABLE chat_session_guarded_keys
    DROP CONSTRAINT chat_session_guarded_keys_organization_id_project_id_fkey;
ALTER TABLE chat_session_guarded_keys
    ADD CONSTRAINT chat_session_guarded_keys_organization_id_project_id_fkey
    FOREIGN KEY (organization_id, project_id)
    REFERENCES projects(organization_id, id) ON DELETE CASCADE;

-- @niu-legacy-migration 0284_ingested_video_request_bindings.sql 3478
-- Private immutable reference metadata; no upstream URI or image content.
CREATE TABLE ingested_video_request_bindings (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    content_position INTEGER NOT NULL CHECK(content_position BETWEEN 0 AND 31),
    ingestion_id UUID NOT NULL REFERENCES asset_image_ingestion_consents(id),
    readiness_id UUID NOT NULL REFERENCES ingested_image_readiness_claims(id),
    body_sha256 TEXT NOT NULL CHECK(body_sha256 ~ '^[a-f0-9]{64}$'),
    binding_sha256 TEXT NOT NULL CHECK(binding_sha256 ~ '^[a-f0-9]{64}$'),
    schema_revision TEXT NOT NULL,
    expires_at_ms BIGINT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(attempt_id,content_position),
    FOREIGN KEY(organization_id,project_id,attempt_id) REFERENCES media_recovery_routes(organization_id,project_id,attempt_id),
    FOREIGN KEY(organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id)
);
CREATE FUNCTION require_prepared_ingested_video_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM attempts a
      JOIN media_recovery_routes route ON route.attempt_id=a.id
      JOIN inspected_guardrail_bindings policy ON policy.attempt_id=a.id
      JOIN asset_image_ingestion_consents consent ON consent.id=NEW.ingestion_id
      JOIN inspected_image_sources source ON source.id=consent.source_id
      JOIN asset_group_create_intents destination ON destination.id=consent.group_intent_id
      JOIN ingested_image_readiness_claims readiness ON readiness.id=NEW.readiness_id AND readiness.consent_id=consent.id
      WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.id=NEW.attempt_id
        AND a.execution='not_sent' AND a.dispatched_at IS NULL
        AND route.schema_revision=NEW.schema_revision AND policy.key_id=NEW.key_id
        AND source.organization_id=NEW.organization_id AND source.project_id=NEW.project_id AND source.key_id=NEW.key_id
        AND route.vendor_id=destination.vendor_id AND route.vendor_revision=destination.vendor_revision
        AND NEW.expires_at_ms>floor(extract(epoch FROM clock_timestamp())*1000)::bigint
      FOR UPDATE OF a;
    IF NOT FOUND THEN RAISE EXCEPTION 'ingested image requires prepared scoped video request'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_prepared_ingested_video_reference BEFORE INSERT ON ingested_video_request_bindings
FOR EACH ROW EXECUTE FUNCTION require_prepared_ingested_video_reference();
CREATE TRIGGER immutable_ingested_video_reference BEFORE UPDATE OR DELETE ON ingested_video_request_bindings
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
-- Time advances even under authorization locks. Recheck at the dispatch update.
CREATE FUNCTION require_current_ingested_video_deadline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.dispatched_at IS NOT NULL AND OLD.dispatched_at IS NULL AND EXISTS(
        SELECT 1 FROM ingested_video_request_bindings binding
        WHERE binding.attempt_id=NEW.id
          AND binding.expires_at_ms<=floor(extract(epoch FROM clock_timestamp())*1000)::bigint
    ) THEN RAISE EXCEPTION 'ingested image dispatch deadline elapsed'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_current_ingested_video_deadline BEFORE UPDATE OF dispatched_at ON attempts
FOR EACH ROW EXECUTE FUNCTION require_current_ingested_video_deadline();

-- @niu-legacy-migration 0285_workspace_asset_library.sql 5193
-- Durable customer workspace content, independent of short-lived inspection.
CREATE TABLE workspace_asset_library (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    name TEXT NOT NULL CHECK (octet_length(name) BETWEEN 1 AND 200),
    media_kind TEXT NOT NULL CHECK (media_kind IN ('image','video','audio')),
    content_type TEXT NOT NULL CHECK (content_type IN ('image/png','image/jpeg','image/webp','video/mp4','video/webm','audio/wav','audio/mpeg','audio/ogg')),
    content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
    byte_length BIGINT NOT NULL CHECK (byte_length BETWEEN 1 AND 8388608),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    deleted_at TIMESTAMPTZ,
    UNIQUE (organization_id,project_id,id),
    FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id),
    CHECK ((media_kind='image' AND content_type IN ('image/png','image/jpeg','image/webp'))
        OR (media_kind='video' AND content_type IN ('video/mp4','video/webm'))
        OR (media_kind='audio' AND content_type IN ('audio/wav','audio/mpeg','audio/ogg')))
);
CREATE INDEX workspace_asset_library_directory ON workspace_asset_library(organization_id,project_id,created_at,id) WHERE deleted_at IS NULL;
CREATE TABLE workspace_asset_library_content (
    asset_id UUID PRIMARY KEY REFERENCES workspace_asset_library(id),
    ciphertext BYTEA NOT NULL CHECK (octet_length(ciphertext) BETWEEN 29 AND 8388736)
);
CREATE FUNCTION preserve_workspace_asset_bytes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND niu_authorized_encryption_rewrap(
        TG_TABLE_NAME,'ciphertext',to_jsonb(OLD),to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
    IF TG_OP='DELETE' AND EXISTS (
        SELECT 1 FROM workspace_asset_library WHERE id=OLD.asset_id AND deleted_at IS NOT NULL
    ) THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'workspace asset content permits authorized rotation or deletion only' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_workspace_asset_bytes BEFORE UPDATE OR DELETE ON workspace_asset_library_content
FOR EACH ROW EXECUTE FUNCTION preserve_workspace_asset_bytes();
CREATE TABLE workspace_asset_library_events (
    asset_id UUID NOT NULL REFERENCES workspace_asset_library(id),
    revision BIGINT NOT NULL CHECK (revision > 0),
    actor TEXT NOT NULL CHECK (octet_length(actor) BETWEEN 1 AND 200),
    operation TEXT NOT NULL CHECK (operation IN ('created','renamed','deleted')),
    name TEXT NOT NULL CHECK (octet_length(name) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (asset_id,revision)
);
CREATE TRIGGER immutable_workspace_asset_event BEFORE UPDATE OR DELETE ON workspace_asset_library_events
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
-- Rotation needs a narrowly reviewed maintenance bypass for encrypted-byte
-- UPDATE, as with existing immutable encrypted-content domains. Ordinary
-- application rename/delete never updates immutable content bytes or identity.

-- Protect content identity and irreversible tombstones independently of handlers.
CREATE FUNCTION preserve_workspace_asset_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='UPDATE' AND OLD.deleted_at IS NULL
       AND ROW(NEW.id,NEW.organization_id,NEW.project_id,NEW.media_kind,NEW.content_type,NEW.content_sha256,NEW.byte_length,NEW.created_at)
           IS NOT DISTINCT FROM ROW(OLD.id,OLD.organization_id,OLD.project_id,OLD.media_kind,OLD.content_type,OLD.content_sha256,OLD.byte_length,OLD.created_at)
       AND NEW.revision=OLD.revision+1 AND NEW.updated_at>=OLD.updated_at
    THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'workspace asset identity and tombstones are immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_workspace_asset_identity BEFORE UPDATE OR DELETE ON workspace_asset_library
FOR EACH ROW EXECUTE FUNCTION preserve_workspace_asset_identity();
ALTER TABLE encryption_rewrap_authorizations DROP CONSTRAINT encryption_rewrap_authorizations_table_name_check;
ALTER TABLE encryption_rewrap_authorizations ADD CONSTRAINT encryption_rewrap_authorizations_table_name_check CHECK (table_name IN (
    'vendors','vendor_asset_management_credentials','codex_connections','payment_gateway_configuration',
    'media_result_references','asset_listing_results','asset_lookup_results','asset_group_read_results',
    'asset_group_update_patches','inspected_image_source_content','workspace_asset_library_content'
));

CREATE FUNCTION require_live_workspace_asset_content() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM workspace_asset_library WHERE id=NEW.asset_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'workspace asset content requires a live identity' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_live_workspace_asset_content BEFORE INSERT ON workspace_asset_library_content
FOR EACH ROW EXECUTE FUNCTION require_live_workspace_asset_content();

-- @niu-legacy-migration 0286_workspace_asset_video_bindings.sql 2914
-- Immutable local material identity, never bytes or Provider asset references.
CREATE TABLE workspace_asset_video_request_bindings (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    content_position INTEGER NOT NULL CHECK (content_position BETWEEN 0 AND 31),
    asset_id UUID NOT NULL,
    content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
    observed_revision BIGINT NOT NULL CHECK (observed_revision > 0),
    body_sha256 TEXT NOT NULL CHECK (body_sha256 ~ '^[a-f0-9]{64}$'),
    schema_revision TEXT NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (attempt_id,content_position),
    FOREIGN KEY (organization_id,project_id,asset_id) REFERENCES workspace_asset_library(organization_id,project_id,id),
    FOREIGN KEY (organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
    FOREIGN KEY (organization_id,project_id,attempt_id) REFERENCES media_recovery_routes(organization_id,project_id,attempt_id)
);
CREATE FUNCTION require_prepared_workspace_asset_video() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM attempts a
      JOIN media_recovery_routes route ON route.attempt_id=a.id
      JOIN image_request_bindings inspection ON inspection.attempt_id=a.id
      JOIN workspace_asset_library material ON material.id=NEW.asset_id
      JOIN workspace_asset_library_content content ON content.asset_id=material.id
      WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id
        AND a.id=NEW.attempt_id AND a.api_key_id=NEW.key_id
        AND a.execution='not_sent' AND a.dispatched_at IS NULL
        AND route.schema_revision=NEW.schema_revision
        AND inspection.organization_id=NEW.organization_id AND inspection.project_id=NEW.project_id
        AND inspection.key_id=NEW.key_id AND inspection.schema_revision=NEW.schema_revision
        AND inspection.body_sha256=NEW.body_sha256
        AND NEW.content_position=ANY(inspection.image_positions)
        AND material.organization_id=NEW.organization_id AND material.project_id=NEW.project_id
        AND material.deleted_at IS NULL AND material.media_kind='image'
        AND material.content_sha256=NEW.content_sha256 AND material.revision>=NEW.observed_revision
      FOR UPDATE OF a FOR SHARE OF material,content;
    IF NOT FOUND THEN RAISE EXCEPTION 'workspace material requires a prepared scoped image request' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_prepared_workspace_asset_video BEFORE INSERT ON workspace_asset_video_request_bindings
FOR EACH ROW EXECUTE FUNCTION require_prepared_workspace_asset_video();
CREATE TRIGGER immutable_workspace_asset_video_binding BEFORE UPDATE OR DELETE ON workspace_asset_video_request_bindings
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0287_request_transport_phase.sql 464
-- Historical observations remain unknown; never infer phase from duration/kind.
ALTER TABLE request_failures ADD COLUMN transport_phase TEXT
CHECK (transport_phase IN ('connection','request'));
ALTER TABLE request_failures ADD CONSTRAINT valid_request_transport_phase CHECK (
    transport_phase IS NULL
    OR (kind='upstream_timeout' AND transport_phase IN ('connection','request'))
    OR (kind='upstream_connection_error' AND transport_phase='connection')
);

-- @niu-legacy-migration 0288_media_processing_approvals.sql 1946
-- Actual MediaV3 approval metadata only. No source bytes, encoded media,
-- service response, endpoint, credential or inferred financial quantity.
CREATE TABLE media_processing_approvals (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    detector_name TEXT NOT NULL CHECK (detector_name ~ '^[a-zA-Z0-9_-]{1,200}$'),
    detector_revision TEXT NOT NULL CHECK (length(detector_revision) BETWEEN 1 AND 256),
    configuration_fingerprint TEXT NOT NULL CHECK (configuration_fingerprint ~ '^[a-f0-9]{64}$'),
    kind TEXT NOT NULL CHECK (kind IN ('audio','video')),
    content_type TEXT NOT NULL,
    byte_length BIGINT NOT NULL CHECK (byte_length BETWEEN 1 AND 8388608),
    content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
    content_position INTEGER NOT NULL CHECK (content_position BETWEEN 0 AND 255),
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    elapsed_ms BIGINT NOT NULL CHECK (elapsed_ms BETWEEN 0 AND 60000),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((kind='audio' AND content_type IN ('audio/wav','audio/mpeg'))
        OR (kind='video' AND content_type='video/mp4')),
    FOREIGN KEY (organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
    FOREIGN KEY (organization_id,project_id,workspace_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision),
    FOREIGN KEY (organization_id,project_id,key_policy_revision) REFERENCES workspace_guardrail_revisions(organization_id,project_id,revision)
);
CREATE INDEX media_processing_approval_scope_time ON media_processing_approvals(organization_id,project_id,recorded_at DESC);
CREATE TRIGGER immutable_media_processing_approval BEFORE UPDATE OR DELETE ON media_processing_approvals
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0289_media_request_bindings.sql 5025
-- Exact prepared media request identity. Source content and private delivery
-- capabilities never belong in these immutable metadata bindings.
ALTER TABLE media_processing_approvals ADD CONSTRAINT media_approval_scope_key_identity
    UNIQUE (organization_id,project_id,key_id,id);

CREATE TABLE media_request_bindings (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    body_sha256 TEXT NOT NULL CHECK (body_sha256 ~ '^[a-f0-9]{64}$'),
    schema_revision TEXT NOT NULL CHECK (length(schema_revision) BETWEEN 1 AND 256),
    media_positions INTEGER[] NOT NULL CHECK (
        cardinality(media_positions) BETWEEN 1 AND 32
        AND 0 <= ALL(media_positions) AND 31 >= ALL(media_positions)),
    workspace_revision BIGINT,
    key_policy_revision BIGINT,
    key_assignment_revision BIGINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (organization_id,project_id,key_id,attempt_id),
    FOREIGN KEY (organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
    FOREIGN KEY (organization_id,project_id,attempt_id) REFERENCES media_recovery_routes(organization_id,project_id,attempt_id)
);

CREATE TABLE media_request_approval_bindings (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    key_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    approval_id UUID NOT NULL UNIQUE,
    PRIMARY KEY (organization_id,project_id,key_id,attempt_id,approval_id),
    FOREIGN KEY (organization_id,project_id,key_id,attempt_id)
        REFERENCES media_request_bindings(organization_id,project_id,key_id,attempt_id),
    FOREIGN KEY (organization_id,project_id,key_id,approval_id)
        REFERENCES media_processing_approvals(organization_id,project_id,key_id,id)
);

CREATE FUNCTION require_prepared_media_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM attempts attempt
      JOIN media_recovery_routes route ON route.attempt_id=attempt.id
      JOIN inspected_guardrail_bindings policy ON policy.attempt_id=attempt.id
      WHERE attempt.organization_id=NEW.organization_id
        AND attempt.project_id=NEW.project_id AND attempt.id=NEW.attempt_id
        AND attempt.api_key_id=NEW.key_id
        AND attempt.execution='not_sent' AND attempt.dispatched_at IS NULL
        AND route.schema_revision=NEW.schema_revision AND policy.key_id=NEW.key_id
        AND policy.workspace_revision IS NOT DISTINCT FROM NEW.workspace_revision
        AND policy.key_policy_revision IS NOT DISTINCT FROM NEW.key_policy_revision
        AND policy.key_assignment_revision IS NOT DISTINCT FROM NEW.key_assignment_revision
      FOR UPDATE OF attempt;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'media request requires prepared scoped route and policy binding' USING ERRCODE='23514';
    END IF;
    IF (SELECT count(DISTINCT position) FROM unnest(NEW.media_positions) position)
        <> cardinality(NEW.media_positions) THEN
        RAISE EXCEPTION 'media request positions must be unique' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION require_scoped_media_request_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM media_request_bindings request
      JOIN media_processing_approvals approval ON approval.id=NEW.approval_id
      JOIN attempts attempt ON attempt.id=request.attempt_id
      WHERE request.organization_id=NEW.organization_id
        AND request.project_id=NEW.project_id AND request.key_id=NEW.key_id
        AND request.attempt_id=NEW.attempt_id
        AND approval.organization_id=NEW.organization_id
        AND approval.project_id=NEW.project_id AND approval.key_id=NEW.key_id
        AND approval.content_position=ANY(request.media_positions)
        AND approval.workspace_revision IS NOT DISTINCT FROM request.workspace_revision
        AND approval.key_policy_revision IS NOT DISTINCT FROM request.key_policy_revision
        AND approval.key_assignment_revision IS NOT DISTINCT FROM request.key_assignment_revision
        AND attempt.execution='not_sent' AND attempt.dispatched_at IS NULL
      FOR UPDATE OF attempt;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'media approval requires matching prepared scope and policy epochs' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER require_prepared_media_request BEFORE INSERT ON media_request_bindings
FOR EACH ROW EXECUTE FUNCTION require_prepared_media_request();
CREATE TRIGGER require_scoped_media_request_approval BEFORE INSERT ON media_request_approval_bindings
FOR EACH ROW EXECUTE FUNCTION require_scoped_media_request_approval();
CREATE TRIGGER immutable_media_request_binding BEFORE UPDATE OR DELETE ON media_request_bindings
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_media_request_approval_binding BEFORE UPDATE OR DELETE ON media_request_approval_bindings
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0290_ark_vendor_adapter.sql 354
-- The existing direct video adapter must also be configurable through Supplier
-- management. This does not qualify offers, publish prices or grant dispatch.
ALTER TABLE vendors DROP CONSTRAINT vendors_adapter_check;
ALTER TABLE vendors ADD CONSTRAINT vendors_adapter_check
    CHECK (adapter IN ('openrouter', 'openai', 'anthropic', 'gemini', 'ark'));

-- @niu-legacy-migration 0291_media_failure_diagnostics.sql 908
-- Preserve observed safe diagnostics without changing historic uncertainty,
-- financial identity or immutable timing records. No body/message is stored.
ALTER TABLE media_transport_timings
    ADD COLUMN upstream_error_code TEXT,
    ADD COLUMN upstream_request_id TEXT,
    ADD CONSTRAINT media_failure_error_code CHECK (
        upstream_error_code IS NULL OR (
            upstream_error_code ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'
            AND upstream_error_code !~* '^sk-')),
    ADD CONSTRAINT media_failure_request_id CHECK (
        upstream_request_id IS NULL OR (
            upstream_request_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$'
            AND upstream_request_id !~* '^sk-')),
    ADD CONSTRAINT media_failure_diagnostic_response CHECK (
        (upstream_error_code IS NULL AND upstream_request_id IS NULL)
        OR (outcome='unavailable' AND upstream_http_status IS NOT NULL));

-- @niu-legacy-migration 0292_workspace_provider_assets.sql 6562
-- NIU workspace-owned Provider identities. Never account-wide object discovery,
-- raw requests, Source URLs, Bearer credentials or biometric session tokens.
CREATE TABLE workspace_provider_asset_groups (
 id UUID PRIMARY KEY,organization_id UUID NOT NULL,project_id UUID NOT NULL,
 vendor_id UUID NOT NULL REFERENCES vendors(id),vendor_revision BIGINT NOT NULL CHECK(vendor_revision>0),
 model_alias TEXT NOT NULL REFERENCES vendor_models(alias),model_revision BIGINT NOT NULL CHECK(model_revision>0),
 upstream_model TEXT NOT NULL,provider_ref TEXT CHECK(length(provider_ref) BETWEEN 1 AND 256),
 name TEXT NOT NULL CHECK(char_length(name) BETWEEN 1 AND 64),description TEXT CHECK(char_length(description)<=300),
 kind TEXT NOT NULL CHECK(kind IN ('generated','person')),
 status TEXT NOT NULL CHECK(status IN ('pending','ready','unknown','failed','deleted')),
 revision BIGINT NOT NULL DEFAULT 1 CHECK(revision>0),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE workspace_provider_assets (
 id UUID PRIMARY KEY,organization_id UUID NOT NULL,project_id UUID NOT NULL,group_id UUID NOT NULL,
 provider_ref TEXT CHECK(length(provider_ref) BETWEEN 1 AND 256),name TEXT CHECK(char_length(name)<=64),
 kind TEXT NOT NULL CHECK(kind IN ('image','video','audio')),
 status TEXT NOT NULL CHECK(status IN ('pending','processing','active','failed','unknown','deleted')),
 revision BIGINT NOT NULL DEFAULT 1 CHECK(revision>0),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(organization_id,project_id,id),UNIQUE(organization_id,project_id,group_id,id),FOREIGN KEY(organization_id,project_id,group_id) REFERENCES workspace_provider_asset_groups(organization_id,project_id,id)
);
CREATE TABLE workspace_provider_asset_operations (
 id UUID PRIMARY KEY,organization_id UUID NOT NULL,project_id UUID NOT NULL,key_id UUID NOT NULL,
 group_id UUID NOT NULL,asset_id UUID, idempotency_key UUID NOT NULL,request_sha256 BYTEA NOT NULL CHECK(octet_length(request_sha256)=32),
 action TEXT NOT NULL CHECK(action IN ('create_group','update_group','delete_group','create_asset','rename_asset','delete_asset')),
 status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','unknown','acknowledged','not_sent')),
 prior_status TEXT NOT NULL,requested_name TEXT CHECK(char_length(requested_name)<=64),requested_description TEXT CHECK(char_length(requested_description)<=300),
 http_status INTEGER CHECK(http_status BETWEEN 100 AND 599),request_id TEXT CHECK(length(request_id)<=256),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(organization_id,project_id,idempotency_key),
 CHECK ((action IN ('create_group','update_group','delete_group') AND asset_id IS NULL)
     OR (action IN ('create_asset','rename_asset','delete_asset') AND asset_id IS NOT NULL)),
 FOREIGN KEY(organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,group_id) REFERENCES workspace_provider_asset_groups(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,group_id,asset_id) REFERENCES workspace_provider_assets(organization_id,project_id,group_id,id)
);
CREATE UNIQUE INDEX workspace_provider_group_mutation ON workspace_provider_asset_operations(group_id)
 WHERE asset_id IS NULL AND status IN ('prepared','unknown');
CREATE UNIQUE INDEX workspace_provider_asset_mutation ON workspace_provider_asset_operations(asset_id)
 WHERE asset_id IS NOT NULL AND status IN ('prepared','unknown');
CREATE INDEX workspace_provider_group_scope ON workspace_provider_asset_groups(organization_id,project_id,model_alias,id);
CREATE INDEX workspace_provider_asset_scope ON workspace_provider_assets(organization_id,project_id,group_id,id);
CREATE FUNCTION preserve_workspace_provider_asset_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Provider object history is durable' USING ERRCODE='23514'; END IF;
 IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.project_id<>OLD.project_id
    OR NEW.created_at<>OLD.created_at OR (OLD.status='deleted' AND NEW.status<>'deleted') THEN
   RAISE EXCEPTION 'Provider object identity is immutable' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='workspace_provider_asset_groups' THEN
   IF NEW.vendor_id<>OLD.vendor_id OR NEW.vendor_revision<>OLD.vendor_revision
      OR NEW.model_alias<>OLD.model_alias OR NEW.model_revision<>OLD.model_revision
      OR NEW.upstream_model<>OLD.upstream_model OR NEW.kind<>OLD.kind THEN
     RAISE EXCEPTION 'Provider group route is immutable' USING ERRCODE='23514'; END IF;
 ELSE
   IF NEW.group_id<>OLD.group_id OR NEW.kind<>OLD.kind THEN
     RAISE EXCEPTION 'Provider asset parent is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 IF OLD.provider_ref IS NOT NULL AND NEW.provider_ref IS DISTINCT FROM OLD.provider_ref THEN
   RAISE EXCEPTION 'Provider reference cannot be replaced' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER preserve_workspace_provider_group BEFORE UPDATE OR DELETE ON workspace_provider_asset_groups
 FOR EACH ROW EXECUTE FUNCTION preserve_workspace_provider_asset_identity();
CREATE TRIGGER preserve_workspace_provider_asset BEFORE UPDATE OR DELETE ON workspace_provider_assets
 FOR EACH ROW EXECUTE FUNCTION preserve_workspace_provider_asset_identity();
CREATE FUNCTION preserve_workspace_provider_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'http_status'-'request_id'-'updated_at')
    IS DISTINCT FROM (to_jsonb(OLD)-'status'-'http_status'-'request_id'-'updated_at') THEN
    RAISE EXCEPTION 'Provider mutation identity is immutable' USING ERRCODE='23514'; END IF;
 IF NOT ((OLD.status='prepared' AND NEW.status='unknown') OR
         (OLD.status='unknown' AND NEW.status IN ('unknown','acknowledged','not_sent')) OR
         (NEW.status=OLD.status AND NEW.http_status IS NOT DISTINCT FROM OLD.http_status AND NEW.request_id IS NOT DISTINCT FROM OLD.request_id)) THEN
    RAISE EXCEPTION 'Provider mutation outcome cannot be replayed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER preserve_workspace_provider_operation BEFORE UPDATE OR DELETE ON workspace_provider_asset_operations
 FOR EACH ROW EXECUTE FUNCTION preserve_workspace_provider_operation();

-- @niu-legacy-migration 0293_workspace_provider_verification.sql 5402
-- Scoped upstream H5 verification: no local biometric detector or approval.
CREATE TABLE workspace_provider_verification_sessions (
 id UUID PRIMARY KEY, organization_id UUID NOT NULL, project_id UUID NOT NULL,
 key_id UUID NOT NULL, vendor_id UUID NOT NULL REFERENCES vendors(id),
 vendor_revision BIGINT NOT NULL CHECK(vendor_revision>0),
 model_alias TEXT NOT NULL REFERENCES vendor_models(alias), model_revision BIGINT NOT NULL CHECK(model_revision>0),
 upstream_model TEXT NOT NULL, idempotency_key UUID NOT NULL,
 request_sha256 BYTEA NOT NULL CHECK(octet_length(request_sha256)=32),
 subject_name TEXT CHECK(char_length(subject_name) BETWEEN 1 AND 32),
 status TEXT NOT NULL CHECK(status IN ('prepared','unknown','not_sent','waiting_user','processing','resolving','verified','failed','expired')),
 ciphertext BYTEA CHECK(octet_length(ciphertext) BETWEEN 30 AND 32800),
 expires_at TIMESTAMPTZ, group_id UUID,
 query_previous_status TEXT CHECK(query_previous_status IN ('waiting_user','processing')),
 CHECK((status='resolving')=(query_previous_status IS NOT NULL)),
 http_status INTEGER CHECK(http_status BETWEEN 100 AND 599), request_id TEXT CHECK(length(request_id)<=256),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(organization_id,project_id,idempotency_key),
 FOREIGN KEY(organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,group_id) REFERENCES workspace_provider_asset_groups(organization_id,project_id,id),
 CHECK(status<>'verified' OR group_id IS NOT NULL),
 CHECK(status NOT IN ('waiting_user','processing','resolving') OR ciphertext IS NOT NULL)
);
CREATE INDEX workspace_provider_verification_scope ON workspace_provider_verification_sessions(organization_id,project_id,model_alias,id);
CREATE FUNCTION preserve_workspace_provider_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.status<>'prepared' OR NEW.ciphertext IS NOT NULL OR NEW.group_id IS NOT NULL OR NEW.expires_at IS NOT NULL THEN
     RAISE EXCEPTION 'Verification starts as an unsubmitted intent' USING ERRCODE='23514'; END IF;
   RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Verification history is durable' USING ERRCODE='23514'; END IF;
 IF niu_authorized_encryption_rewrap(TG_TABLE_NAME,'ciphertext',to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
 IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.project_id<>OLD.project_id
    OR NEW.key_id<>OLD.key_id OR NEW.vendor_id<>OLD.vendor_id OR NEW.vendor_revision<>OLD.vendor_revision
    OR NEW.model_alias<>OLD.model_alias OR NEW.model_revision<>OLD.model_revision OR NEW.upstream_model<>OLD.upstream_model
    OR NEW.idempotency_key<>OLD.idempotency_key OR NEW.request_sha256<>OLD.request_sha256
    OR NEW.subject_name IS DISTINCT FROM OLD.subject_name OR NEW.created_at<>OLD.created_at
    OR NEW.updated_at<OLD.updated_at THEN RAISE EXCEPTION 'Verification identity is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS DISTINCT FROM OLD.ciphertext THEN
   RAISE EXCEPTION 'Verification envelope permits authorized rotation only' USING ERRCODE='23514'; END IF;
 IF OLD.expires_at IS NOT NULL AND NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
   RAISE EXCEPTION 'Verification expiry is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.group_id IS NOT NULL AND NEW.group_id IS DISTINCT FROM OLD.group_id THEN
   RAISE EXCEPTION 'Verified group binding is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status IN ('verified','failed','expired','not_sent') AND NEW.status<>OLD.status THEN
   RAISE EXCEPTION 'Terminal verification cannot be revived' USING ERRCODE='23514'; END IF;
 IF OLD.status='prepared' AND NEW.status NOT IN ('prepared','unknown') THEN
   RAISE EXCEPTION 'Verification must claim before dispatch' USING ERRCODE='23514'; END IF;
 IF NEW.status='verified' AND NOT EXISTS(SELECT 1 FROM workspace_provider_asset_groups g
    WHERE g.id=NEW.group_id AND g.organization_id=NEW.organization_id AND g.project_id=NEW.project_id
      AND g.vendor_id=NEW.vendor_id AND g.vendor_revision=NEW.vendor_revision AND g.model_alias=NEW.model_alias
      AND g.model_revision=NEW.model_revision AND g.upstream_model=NEW.upstream_model AND g.kind='person' AND g.provider_ref IS NOT NULL) THEN
   RAISE EXCEPTION 'Verified group must retain original scope and account' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER preserve_workspace_provider_verification BEFORE INSERT OR UPDATE OR DELETE ON workspace_provider_verification_sessions
 FOR EACH ROW EXECUTE FUNCTION preserve_workspace_provider_verification();
-- Extend the existing closed offline-rotation target inventory.
ALTER TABLE encryption_rewrap_authorizations DROP CONSTRAINT encryption_rewrap_authorizations_table_name_check;
ALTER TABLE encryption_rewrap_authorizations ADD CONSTRAINT encryption_rewrap_authorizations_table_name_check CHECK (table_name IN (
 'vendors','vendor_asset_management_credentials','codex_connections','payment_gateway_configuration',
 'media_result_references','asset_listing_results','asset_lookup_results','asset_group_read_results',
 'asset_group_update_patches','inspected_image_source_content','workspace_asset_library_content',
 'workspace_provider_verification_sessions'
));

-- @niu-legacy-migration 0294_platform_audit.sql 1731
-- Distinguish verified password login from administrator-issued sessions.
ALTER TABLE operator_audit_events DROP CONSTRAINT operator_audit_events_action_check;
ALTER TABLE operator_audit_events ADD CONSTRAINT operator_audit_events_action_check CHECK (
 action IN ('operator_created','session_created','session_revoked','operator_revoked','password_changed','password_login_succeeded')
);
ALTER TABLE operator_audit_events DROP CONSTRAINT operator_audit_events_check1;
ALTER TABLE operator_audit_events ADD CONSTRAINT operator_audit_events_check1 CHECK (
 (action IN ('session_created','session_revoked','password_login_succeeded') AND target_session_id IS NOT NULL)
 OR (action IN ('operator_created','operator_revoked','password_changed') AND target_session_id IS NULL)
);
-- The aggregate reads a bounded page from each journal using the same tie-breaker.
CREATE INDEX operator_audit_platform_cursor ON operator_audit_events(created_at DESC,(id::text) DESC);
CREATE INDEX vendor_audit_platform_cursor ON vendor_audit_events(created_at DESC,(id::text) DESC);
CREATE INDEX supplier_audit_platform_cursor ON provider_audit_events(created_at DESC,(id::text) DESC);
CREATE INDEX branding_audit_platform_cursor ON branding_configuration_events(created_at DESC,(revision::text) DESC);
CREATE INDEX payment_audit_platform_cursor ON payment_gateway_configuration_events(created_at DESC,(id::text) DESC);
CREATE INDEX access_audit_platform_cursor ON platform_admin_events(created_at DESC,(id::text) DESC);
-- Preserve journal rows from now on; no historical completeness is inferred.
CREATE TRIGGER immutable_vendor_audit_events
 BEFORE UPDATE OR DELETE ON vendor_audit_events
 FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0295_generations_sessions.sql 2394
-- Actor-private conversation identity. Task evidence and outputs are never cascaded.
CREATE TABLE generations_sessions (
 organization_id UUID NOT NULL, project_id UUID NOT NULL, owner TEXT NOT NULL,
 id UUID NOT NULL, title TEXT NOT NULL CHECK(octet_length(title) BETWEEN 1 AND 800),
 revision BIGINT NOT NULL DEFAULT 1 CHECK(revision>0), archived BOOLEAN NOT NULL DEFAULT false,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,project_id,owner,id),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE INDEX generations_session_cursor ON generations_sessions(organization_id,project_id,owner,created_at DESC,id DESC);
CREATE TABLE generations_turns (
 organization_id UUID NOT NULL,project_id UUID NOT NULL,owner TEXT NOT NULL,session_id UUID NOT NULL,id UUID NOT NULL,
 sequence BIGINT NOT NULL CHECK(sequence>0),instruction JSONB, instruction_digest BYTEA NOT NULL CHECK(octet_length(instruction_digest)=32),
 content_deleted_at TIMESTAMPTZ,content_expires_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()+interval '30 days',
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,project_id,owner,session_id,id),UNIQUE(organization_id,project_id,owner,session_id,sequence),
 FOREIGN KEY(organization_id,project_id,owner,session_id) REFERENCES generations_sessions(organization_id,project_id,owner,id),
 CHECK(instruction IS NULL OR octet_length(instruction::text)<=65536)
);
CREATE TABLE generations_turn_tasks (
 organization_id UUID NOT NULL,project_id UUID NOT NULL,owner TEXT NOT NULL,session_id UUID NOT NULL,turn_id UUID NOT NULL,
 task_id UUID PRIMARY KEY,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,project_id,owner,session_id,turn_id),
 FOREIGN KEY(organization_id,project_id,owner,session_id,turn_id) REFERENCES generations_turns(organization_id,project_id,owner,session_id,id),
 FOREIGN KEY(organization_id,project_id,task_id) REFERENCES attempts(organization_id,project_id,id)
);
CREATE TRIGGER immutable_generations_task_association BEFORE UPDATE OR DELETE ON generations_turn_tasks
 FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE INDEX generations_instruction_expiry ON generations_turns(content_expires_at,id) WHERE instruction IS NOT NULL;

-- @niu-legacy-migration 0296_generations_inventory.sql 363
-- Historical pages follow immutable record creation and identity, never mutable status.
CREATE INDEX generations_video_history ON attempts(organization_id,project_id,created_at DESC,id DESC) WHERE dispatched_at IS NOT NULL;
CREATE INDEX generations_output_history ON media_result_references(organization_id,project_id,created_at DESC,attempt_id DESC,kind DESC);

-- @niu-legacy-migration 0297_generations_artifact_captures.sql 2840
-- An explicit copy into the existing encrypted workspace library, not a task store.
CREATE TABLE generations_artifact_captures (
 id UUID PRIMARY KEY,
 organization_id UUID NOT NULL, project_id UUID NOT NULL,
 task_id UUID NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('video','last_frame')),
 owner TEXT NOT NULL CHECK(octet_length(owner) BETWEEN 1 AND 200),
 name TEXT NOT NULL CHECK(octet_length(name) BETWEEN 1 AND 200),
 mode TEXT NOT NULL CHECK(mode IN ('cached','fresh')), key_id UUID,
 state TEXT NOT NULL CHECK(state IN ('preparing','stored','failed')),
 lease_token UUID, lease_expires_at TIMESTAMPTZ,
 asset_id UUID, failure_category TEXT CHECK(failure_category IN ('delivery_failed','authorization_changed','invalid_media','capacity_exceeded','storage_unavailable','encryption_unavailable')),
 CHECK((mode='cached' AND key_id IS NULL) OR mode='fresh'),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,project_id,task_id) REFERENCES attempts(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,asset_id) REFERENCES workspace_asset_library(organization_id,project_id,id),
 CHECK((state='preparing' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL AND asset_id IS NULL AND failure_category IS NULL)
 OR (state='stored' AND lease_token IS NULL AND lease_expires_at IS NULL AND asset_id IS NOT NULL AND asset_id=id AND failure_category IS NULL)
 OR (state='failed' AND lease_token IS NULL AND lease_expires_at IS NULL AND asset_id IS NULL AND failure_category IS NOT NULL))
);
-- Failed attempts remain diagnosable without monopolizing future explicit requests.
CREATE UNIQUE INDEX generation_capture_active_source ON generations_artifact_captures(organization_id,project_id,task_id,kind)
 WHERE state IN ('preparing','stored');
CREATE INDEX generation_capture_source_history ON generations_artifact_captures(organization_id,project_id,task_id,kind,created_at DESC,id DESC);
CREATE FUNCTION preserve_generation_capture_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (NEW.id,NEW.organization_id,NEW.project_id,NEW.task_id,NEW.kind,NEW.owner,NEW.name,NEW.mode,NEW.key_id,NEW.created_at)
 IS DISTINCT FROM (OLD.id,OLD.organization_id,OLD.project_id,OLD.task_id,OLD.kind,OLD.owner,OLD.name,OLD.mode,OLD.key_id,OLD.created_at)
 OR OLD.state='stored' THEN
  RAISE EXCEPTION 'capture source identity and stored outcome are permanent';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_generation_capture_identity BEFORE UPDATE ON generations_artifact_captures
 FOR EACH ROW EXECUTE FUNCTION preserve_generation_capture_identity();
CREATE TRIGGER preserve_generation_capture_history BEFORE DELETE ON generations_artifact_captures
 FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0298_generations_turn_intents.sql 1959
-- Link restoration identity before dispatch; inference remains owned by Video.
CREATE TABLE generations_turn_intents (
 organization_id UUID NOT NULL,project_id UUID NOT NULL,owner TEXT NOT NULL,
 session_id UUID NOT NULL,turn_id UUID NOT NULL,intent_id UUID NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,project_id,owner,session_id,turn_id),
 UNIQUE(organization_id,project_id,owner,intent_id),
 FOREIGN KEY(organization_id,project_id,owner,session_id,turn_id)
  REFERENCES generations_turns(organization_id,project_id,owner,session_id,id),
 FOREIGN KEY(organization_id,project_id,owner,intent_id)
  REFERENCES video_submission_intents(organization_id,project_id,owner,id)
);
CREATE TRIGGER immutable_generations_turn_intent BEFORE UPDATE OR DELETE ON generations_turn_intents
 FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
-- Session content deletion and ordinary bounded expiry cleanup clear the bound
-- intent's retained copy under the same turn -> intent lock order. Immutable
-- submission identity, original expiry, task evidence and accounting survive.
CREATE FUNCTION clear_generations_bound_intent_content() RETURNS trigger AS $$
BEGIN
 IF NEW.instruction IS NULL THEN
  UPDATE video_submission_intents vi
   SET request=NULL,deleted_at=clock_timestamp(),revision=revision+1
   FROM generations_turn_intents binding
   WHERE binding.organization_id=NEW.organization_id AND binding.project_id=NEW.project_id
    AND binding.owner=NEW.owner AND binding.session_id=NEW.session_id AND binding.turn_id=NEW.id
    AND vi.organization_id=binding.organization_id AND vi.project_id=binding.project_id
    AND vi.owner=binding.owner AND vi.id=binding.intent_id AND vi.request IS NOT NULL;
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER clear_generations_bound_intent AFTER UPDATE ON generations_turns
 FOR EACH ROW EXECUTE FUNCTION clear_generations_bound_intent_content();

-- @niu-legacy-migration 0299_provider_material_observations.sql 962
-- Successful explicit Get metadata is distinct from uncertain write outcomes.
-- No operation is acknowledged or unblocked by these observations.
ALTER TABLE workspace_provider_asset_groups
 ADD COLUMN observed_name TEXT CHECK(char_length(observed_name)<=64),
 ADD COLUMN observed_description TEXT CHECK(char_length(observed_description)<=300),
 ADD COLUMN observed_at TIMESTAMPTZ,
 ADD CONSTRAINT provider_group_observation_complete CHECK(observed_at IS NOT NULL OR (observed_name IS NULL AND observed_description IS NULL));
ALTER TABLE workspace_provider_assets
 ADD COLUMN observed_name TEXT CHECK(char_length(observed_name)<=64),
 ADD COLUMN observed_status TEXT CHECK(observed_status IN ('processing','active','failed')),
 ADD COLUMN observed_at TIMESTAMPTZ,
 ADD CONSTRAINT provider_asset_observation_complete CHECK((observed_at IS NULL AND observed_name IS NULL AND observed_status IS NULL) OR (observed_at IS NOT NULL AND observed_status IS NOT NULL));

-- @niu-legacy-migration 0300_video_composer_drafts.sql 1643
-- One mutable, actor-private Video composer per workspace. No dispatch identity.
CREATE TABLE video_composer_drafts (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    owner TEXT NOT NULL CHECK (length(owner) BETWEEN 1 AND 200),
    payload JSONB CHECK (payload IS NULL OR (jsonb_typeof(payload)='object' AND octet_length(payload::text)<=65536)),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ,
    PRIMARY KEY (organization_id,project_id,owner),
    FOREIGN KEY (organization_id,project_id) REFERENCES projects(organization_id,id) ON DELETE CASCADE,
    CHECK (payload IS NULL OR expires_at IS NOT NULL)
);
-- Cleared/expired content remains a revision tombstone until empty-workspace deletion.
CREATE INDEX video_composer_draft_expiry ON video_composer_drafts(expires_at,organization_id,project_id,owner)
    WHERE payload IS NOT NULL;

-- Backstop empty-workspace deletion: only disposable tombstones/expired content
-- may cascade, even when another caller reaches the project DELETE directly.
CREATE FUNCTION protect_retained_video_composer_draft() RETURNS trigger AS $$
BEGIN
    IF OLD.payload IS NOT NULL AND OLD.expires_at>clock_timestamp() THEN
        RAISE EXCEPTION 'retained Video composer content protects its workspace'
            USING ERRCODE='23503';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER protect_retained_video_composer_draft BEFORE DELETE ON video_composer_drafts
    FOR EACH ROW EXECUTE FUNCTION protect_retained_video_composer_draft();

-- @niu-legacy-migration 0301_native_operation_inventory.sql 300
-- Ordered workspace discovery of durable native operations; no OFFSET scans.
-- Existing workspace/idempotency uniqueness already indexes request lookup.
CREATE INDEX workspace_provider_operation_inventory
 ON workspace_provider_asset_operations(organization_id,project_id,created_at DESC,id DESC);

-- @niu-legacy-migration 0302_branding_audit_actor.sql 633
-- Future Branding writes retain explicit authenticated actor provenance.
-- Never infer installation authorization from historical missing operator IDs.
ALTER TABLE branding_configuration_events
 ADD COLUMN actor_kind TEXT NOT NULL DEFAULT 'unknown'
 CHECK (actor_kind IN ('unknown','installation','operator'));
ALTER TABLE branding_configuration_events
 ADD CONSTRAINT branding_configuration_actor_identity CHECK (
   actor_kind='unknown'
   OR (actor_kind='installation' AND actor_operator_id IS NULL)
   OR (actor_kind='operator' AND actor_operator_id IS NOT NULL)
 );
-- Existing immutable events are not updated or backfilled.

-- @niu-legacy-migration 0303_provider_operation_prepared_cancel.sql 900
-- Explicit cancellation is permitted only before the durable dispatch claim.
CREATE OR REPLACE FUNCTION preserve_workspace_provider_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'http_status'-'request_id'-'updated_at')
    IS DISTINCT FROM (to_jsonb(OLD)-'status'-'http_status'-'request_id'-'updated_at') THEN
    RAISE EXCEPTION 'Provider mutation identity is immutable' USING ERRCODE='23514'; END IF;
 IF NOT ((OLD.status='prepared' AND NEW.status IN ('unknown','not_sent')) OR
         (OLD.status='unknown' AND NEW.status IN ('unknown','acknowledged','not_sent')) OR
         (NEW.status=OLD.status AND NEW.http_status IS NOT DISTINCT FROM OLD.http_status AND NEW.request_id IS NOT DISTINCT FROM OLD.request_id)) THEN
    RAISE EXCEPTION 'Provider mutation outcome cannot be replayed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;

-- @niu-legacy-migration 0304_operator_role_change_audit.sql 1300
-- Record future member role transitions without inferring historical roles.
ALTER TABLE operator_audit_events DROP CONSTRAINT operator_audit_events_action_check;
ALTER TABLE operator_audit_events ADD CONSTRAINT operator_audit_events_action_check CHECK (
 action IN ('operator_created','session_created','session_revoked','operator_revoked','password_changed','password_login_succeeded','role_changed')
);
ALTER TABLE operator_audit_events DROP CONSTRAINT operator_audit_events_check1;
ALTER TABLE operator_audit_events ADD CONSTRAINT operator_audit_events_check1 CHECK (
 (action IN ('session_created','session_revoked','password_login_succeeded') AND target_session_id IS NOT NULL)
 OR (action IN ('operator_created','operator_revoked','password_changed','role_changed') AND target_session_id IS NULL)
);
ALTER TABLE operator_audit_events ADD COLUMN before_role TEXT;
ALTER TABLE operator_audit_events ADD COLUMN after_role TEXT;
ALTER TABLE operator_audit_events ADD CONSTRAINT operator_audit_role_transition CHECK (
 (action='role_changed' AND before_role IS NOT NULL AND after_role IS NOT NULL
  AND before_role IN ('owner','admin','viewer') AND after_role IN ('owner','admin','viewer') AND before_role<>after_role)
 OR (action<>'role_changed' AND before_role IS NULL AND after_role IS NULL)
);

-- @niu-legacy-migration 0305_supplier_audit_actor.sql 560
-- Retain authenticated provenance for future Supplier creation/deletion events.
-- Historical events remain unchanged; recorded operator IDs still identify actors.
ALTER TABLE provider_audit_events
 ADD COLUMN actor_kind TEXT NOT NULL DEFAULT 'unknown'
 CHECK (actor_kind IN ('unknown','installation','operator'));
ALTER TABLE provider_audit_events
 ADD CONSTRAINT provider_audit_actor_identity CHECK (
   actor_kind='unknown'
   OR (actor_kind='installation' AND actor_operator_id IS NULL)
   OR (actor_kind='operator' AND actor_operator_id IS NOT NULL)
 );

-- @niu-legacy-migration 0306_gateway_admission_denials.sql 990
-- Checked gateway admission evidence, separate from upstream failures and billing.
CREATE TABLE gateway_admission_denials (
    attempt_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    requested_key_id UUID NOT NULL,
    requested_key_name TEXT NOT NULL,
    requested_key_revision BIGINT NOT NULL CHECK (requested_key_revision > 0),
    kind TEXT NOT NULL CHECK (kind = 'key_request_rate_disabled'),
    http_status SMALLINT NOT NULL CHECK (http_status = 429),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES attempts (organization_id, project_id, id),
    FOREIGN KEY (organization_id, project_id, requested_key_id)
        REFERENCES api_keys (organization_id, project_id, id)
);
CREATE TRIGGER immutable_gateway_admission_denial
    BEFORE UPDATE OR DELETE ON gateway_admission_denials
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();


-- @niu-legacy-migration 0307_gateway_request_rate_exceeded_denials.sql 319
-- Extend checked request-rate evidence without rewriting historical observations.
ALTER TABLE gateway_admission_denials
    DROP CONSTRAINT gateway_admission_denials_kind_check,
    ADD CONSTRAINT gateway_admission_denials_kind_check
        CHECK (kind IN ('key_request_rate_disabled', 'key_request_rate_exceeded'));

-- @niu-legacy-migration 0308_customer_discount_provenance.sql 2900
-- Explicit retail discounts are new revisions. Existing prices and operation
-- bindings are unchanged; the referenced original revision remains immutable.
ALTER TABLE customer_tariff_revisions ADD COLUMN discount_baseline_revision UUID
    REFERENCES customer_tariff_revisions(id);

-- Shared publication and database-boundary validation. Category and context
-- shapes stay identical, so a discount cannot change usage interpretation or
-- become a price increase for a previously supported token category.
CREATE FUNCTION niu_customer_discount_valid(baseline UUID, model TEXT, currency_code TEXT, rates JSONB)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
SELECT COALESCE((
    SELECT r.discount_baseline_revision IS NULL
       AND t.model_alias=model AND r.currency=currency_code
       AND NOT EXISTS (
           SELECT 1 FROM unnest(ARRAY['prompt_rate','completion_rate','cached_prompt_rate',
               'cache_write_prompt_rate','reasoning_completion_rate',
               'minimum_charge_nanos','request_fee_nanos']) field
           WHERE ((rates->>field) IS NULL) <> ((to_jsonb(r)->>field) IS NULL)
              OR (rates->>field)::numeric > (to_jsonb(r)->>field)::numeric
       )
       AND jsonb_array_length(r.context_tiers)=jsonb_array_length(rates->'context_tiers')
       AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(r.context_tiers) WITH ORDINALITY original(value,idx)
           FULL JOIN jsonb_array_elements(rates->'context_tiers') WITH ORDINALITY discounted(value,idx)
               USING(idx)
           WHERE original.value->>'minimum_input_tokens' IS DISTINCT FROM discounted.value->>'minimum_input_tokens'
              OR EXISTS (
                  SELECT 1 FROM unnest(ARRAY['prompt_rate','completion_rate','cached_prompt_rate',
                      'cache_write_prompt_rate','reasoning_completion_rate']) field
                  WHERE ((original.value->>field) IS NULL) <> ((discounted.value->>field) IS NULL)
                     OR (discounted.value->>field)::numeric > (original.value->>field)::numeric
              )
       )
    FROM customer_tariff_revisions r JOIN customer_tariffs t ON t.id=r.tariff_id
    WHERE r.id=baseline
), FALSE);
$$;

CREATE FUNCTION protect_customer_discount_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE alias TEXT;
BEGIN
    IF NEW.discount_baseline_revision IS NOT NULL THEN
        SELECT model_alias INTO STRICT alias FROM customer_tariffs WHERE id=NEW.tariff_id;
        IF NOT niu_customer_discount_valid(NEW.discount_baseline_revision,alias,NEW.currency,to_jsonb(NEW)) THEN
            RAISE EXCEPTION 'Discount baseline or resulting rates conflict' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_discount_revision BEFORE INSERT ON customer_tariff_revisions
    FOR EACH ROW EXECUTE FUNCTION protect_customer_discount_revision();

-- @niu-legacy-migration 0309_customer_balance_grants.sql 2628
-- Explicit noncash administrator gifts. Never create a funding receipt or
-- rewrite historical adjustments. The opposite signed memorandum
-- records the noncash source of capacity. Issuance recognizes neither revenue
-- nor promotional expense. Gift consumption requires separate sales-allowance
-- allocation; it must reduce reported revenue, never create an expense offset.
CREATE TABLE customer_balance_grants (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    entry_id UUID NOT NULL UNIQUE,
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos > 0),
    noncash_offset_nanos BIGINT NOT NULL CHECK (noncash_offset_nanos < 0),
    idempotency_key UUID NOT NULL,
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500
        AND reason = trim(reason) AND reason !~ '[[:cntrl:]]'),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, idempotency_key),
    FOREIGN KEY (organization_id, account_id, currency, entry_id)
        REFERENCES customer_balance_entries(organization_id, account_id, currency, id),
    CHECK (amount_nanos::numeric + noncash_offset_nanos::numeric = 0),
    CHECK ((actor_kind = 'installation' AND actor_operator_id IS NULL)
        OR (actor_kind = 'operator' AND actor_operator_id IS NOT NULL))
);

CREATE FUNCTION validate_customer_balance_grant() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM customer_balance_entries e
        WHERE e.id = NEW.entry_id AND e.organization_id = NEW.organization_id
          AND e.account_id = NEW.account_id AND e.currency = NEW.currency
          AND e.kind = 'adjustment' AND e.amount_nanos = NEW.amount_nanos
          AND e.idempotency_key = NEW.idempotency_key
          AND e.project_id IS NULL AND e.attempt_id IS NULL
          AND e.reverses_entry_id IS NULL
    ) THEN
        RAISE EXCEPTION 'noncash grant requires an exact positive adjustment'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_balance_grant BEFORE INSERT ON customer_balance_grants
    FOR EACH ROW EXECUTE FUNCTION validate_customer_balance_grant();
CREATE TRIGGER immutable_customer_balance_grant BEFORE UPDATE OR DELETE ON customer_balance_grants
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE INDEX customer_balance_grants_history
    ON customer_balance_grants(organization_id, created_at DESC, id DESC);

-- @niu-legacy-migration 0310_customer_balance_consumption_allocations.sql 8355
-- Source allocation for future balance debits/refunds only. No historical
-- backfill: an absent allocation or unclassified old adjustment is unknown.
-- Non-gift consumption can be prepaid cash or credit-backed receivable; it is
-- not proof of a cash receipt. Gifts reduce consumed revenue, never offset it
-- with a promotional expense. Grant issuance itself recognizes neither.
CREATE TABLE customer_balance_consumption_allocations (
    entry_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('charge', 'refund')),
    nominal_nanos BIGINT NOT NULL CHECK (nominal_nanos > 0),
    -- Always track the explicitly issued gift subset, even if total historical
    -- funding provenance is unknown. Otherwise the same gift could be reused.
    explicit_gift_nanos BIGINT NOT NULL CHECK (explicit_gift_nanos >= 0),
    gift_nanos BIGINT,
    nongift_nanos BIGINT,
    source_coverage TEXT NOT NULL CHECK (source_coverage IN ('known', 'legacy_unknown')),
    source_charge_entry_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, account_id, currency, entry_id),
    FOREIGN KEY (organization_id, account_id, currency, entry_id)
        REFERENCES customer_balance_entries(organization_id, account_id, currency, id),
    FOREIGN KEY (organization_id, account_id, currency, source_charge_entry_id)
        REFERENCES customer_balance_entries(organization_id, account_id, currency, id),
    CHECK (explicit_gift_nanos <= nominal_nanos),
    CHECK ((source_coverage = 'known' AND gift_nanos IS NOT NULL AND nongift_nanos IS NOT NULL
            AND gift_nanos >= 0 AND nongift_nanos >= 0
            AND gift_nanos = explicit_gift_nanos
            AND gift_nanos::numeric + nongift_nanos::numeric = nominal_nanos)
        OR (source_coverage = 'legacy_unknown' AND gift_nanos IS NULL AND nongift_nanos IS NULL)),
    CHECK ((kind = 'charge' AND source_charge_entry_id IS NULL)
        OR (kind = 'refund' AND source_charge_entry_id IS NOT NULL))
);
CREATE INDEX customer_balance_consumption_account
    ON customer_balance_consumption_allocations(account_id, created_at, entry_id);
CREATE INDEX customer_balance_consumption_refunds
    ON customer_balance_consumption_allocations(source_charge_entry_id)
    WHERE kind = 'refund';

CREATE FUNCTION validate_customer_balance_consumption_allocation() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM customer_balance_entries e
        WHERE e.id = NEW.entry_id AND e.organization_id = NEW.organization_id
          AND e.account_id = NEW.account_id AND e.currency = NEW.currency
          AND e.kind = NEW.kind
          AND e.amount_nanos::numeric = CASE WHEN NEW.kind = 'charge'
              THEN -NEW.nominal_nanos::numeric ELSE NEW.nominal_nanos::numeric END
          AND e.reverses_entry_id IS NOT DISTINCT FROM NEW.source_charge_entry_id
    ) THEN
        RAISE EXCEPTION 'consumption allocation requires an exact scoped balance entry'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.kind = 'refund' AND NOT EXISTS (
        SELECT 1 FROM customer_balance_entries e
        WHERE e.id = NEW.source_charge_entry_id AND e.organization_id = NEW.organization_id
          AND e.account_id = NEW.account_id AND e.currency = NEW.currency AND e.kind = 'charge'
    ) THEN
        RAISE EXCEPTION 'refund allocation requires its original scoped charge'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_balance_consumption_allocation
    BEFORE INSERT ON customer_balance_consumption_allocations
    FOR EACH ROW EXECUTE FUNCTION validate_customer_balance_consumption_allocation();
CREATE TRIGGER immutable_customer_balance_consumption_allocation
    BEFORE UPDATE OR DELETE ON customer_balance_consumption_allocations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION allocate_customer_balance_consumption() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    nominal BIGINT;
    explicit_gift BIGINT := 0;
    pool NUMERIC;
    refunded_nominal NUMERIC;
    refunded_gift NUMERIC;
    original_amount NUMERIC;
    original customer_balance_consumption_allocations%ROWTYPE;
    coverage TEXT := 'known';
BEGIN
    IF NEW.kind NOT IN ('charge', 'refund') THEN RETURN NEW; END IF;
    -- This lock serializes gift issuance, debits and refunds for this exact
    -- account. Never upgrade admission's FK-compatible non-key-changing lock.
    PERFORM id FROM customer_balance_accounts
        WHERE id = NEW.account_id AND organization_id = NEW.organization_id
          AND currency = NEW.currency FOR NO KEY UPDATE;
    nominal := abs(NEW.amount_nanos::numeric)::bigint;
    IF NEW.kind = 'charge' THEN
        SELECT COALESCE((SELECT sum(g.amount_nanos::numeric)
                    FROM customer_balance_grants g WHERE g.account_id = NEW.account_id), 0)
            - COALESCE((SELECT sum(CASE WHEN a.kind = 'charge'
                        THEN a.explicit_gift_nanos::numeric ELSE -a.explicit_gift_nanos::numeric END)
                    FROM customer_balance_consumption_allocations a
                    WHERE a.account_id = NEW.account_id), 0)
            INTO pool;
        IF pool < 0 THEN
            RAISE EXCEPTION 'explicit gift pool is inconsistent' USING ERRCODE = '23514';
        END IF;
        explicit_gift := LEAST(nominal::numeric, pool)::bigint;
        IF EXISTS (
            SELECT 1 FROM customer_balance_entries e
            WHERE e.account_id = NEW.account_id AND e.kind = 'adjustment'
              AND e.amount_nanos > 0
              AND NOT EXISTS (SELECT 1 FROM customer_balance_grants g WHERE g.entry_id = e.id)
        ) THEN coverage := 'legacy_unknown'; END IF;
    ELSE
        SELECT -e.amount_nanos::numeric INTO original_amount
            FROM customer_balance_entries e
            WHERE e.id = NEW.reverses_entry_id AND e.organization_id = NEW.organization_id
              AND e.account_id = NEW.account_id AND e.currency = NEW.currency AND e.kind = 'charge';
        SELECT COALESCE(sum(e.amount_nanos::numeric), 0) INTO refunded_nominal
            FROM customer_balance_entries e
            WHERE e.reverses_entry_id = NEW.reverses_entry_id AND e.id <> NEW.id;
        IF original_amount IS NULL OR refunded_nominal + nominal > original_amount THEN
            RAISE EXCEPTION 'refund exceeds original scoped consumption' USING ERRCODE = '23514';
        END IF;
        SELECT * INTO original FROM customer_balance_consumption_allocations a
            WHERE a.entry_id = NEW.reverses_entry_id;
        IF NOT FOUND THEN
            -- Legacy refunds retain their existing semantics. They cannot
            -- manufacture gift restoration from absent historical provenance.
            coverage := 'legacy_unknown';
        ELSE
            SELECT COALESCE(sum(a.explicit_gift_nanos::numeric), 0) INTO refunded_gift
                FROM customer_balance_consumption_allocations a
                WHERE a.kind = 'refund' AND a.source_charge_entry_id = NEW.reverses_entry_id;
            IF refunded_gift > original.explicit_gift_nanos THEN
                RAISE EXCEPTION 'refund gift allocation exceeds its original source'
                    USING ERRCODE = '23514';
            END IF;
            explicit_gift := LEAST(nominal::numeric,
                original.explicit_gift_nanos::numeric - refunded_gift)::bigint;
            coverage := original.source_coverage;
        END IF;
    END IF;
    INSERT INTO customer_balance_consumption_allocations
        (entry_id, organization_id, account_id, currency, kind, nominal_nanos,
         explicit_gift_nanos, gift_nanos, nongift_nanos, source_coverage, source_charge_entry_id)
    VALUES (NEW.id, NEW.organization_id, NEW.account_id, NEW.currency, NEW.kind, nominal,
        explicit_gift, CASE WHEN coverage = 'known' THEN explicit_gift ELSE NULL END,
        CASE WHEN coverage = 'known' THEN nominal - explicit_gift ELSE NULL END,
        coverage, CASE WHEN NEW.kind = 'refund' THEN NEW.reverses_entry_id ELSE NULL END);
    RETURN NEW;
END;
$$;
CREATE TRIGGER allocate_customer_balance_consumption
    AFTER INSERT ON customer_balance_entries
    FOR EACH ROW EXECUTE FUNCTION allocate_customer_balance_consumption();

-- @niu-legacy-migration 0311_platform_retail_prices.sql 10718
-- Platform selling configuration, independent of confidential Supplier quotes.
-- Existing workspace prices, operation bindings and financial entries are untouched.
CREATE TABLE platform_retail_price_heads (
    id UUID PRIMARY KEY,
    model_alias TEXT NOT NULL CHECK (length(model_alias) BETWEEN 1 AND 200 AND model_alias=trim(model_alias)),
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    rate_kind TEXT NOT NULL CHECK (rate_kind IN ('text','media')),
    dimensions JSONB NOT NULL CHECK (jsonb_typeof(dimensions)='object'),
    meter TEXT NOT NULL,
    version BIGINT NOT NULL DEFAULT 0 CHECK (version>=0),
    current_revision UUID,
    UNIQUE(model_alias,currency,rate_kind,dimensions,meter),
    CHECK ((rate_kind='text' AND dimensions='{}'::jsonb AND meter='')
        OR (rate_kind='media' AND dimensions->>'model' IS NOT DISTINCT FROM model_alias AND length(meter) BETWEEN 1 AND 256))
);
CREATE TABLE platform_retail_price_changes (
    id UUID PRIMARY KEY,
    head_id UUID NOT NULL REFERENCES platform_retail_price_heads(id),
    version BIGINT NOT NULL CHECK (version>0),
    action TEXT NOT NULL CHECK (action IN ('standard_published','promotion_published','promotion_retired')),
    idempotency_key UUID NOT NULL UNIQUE,
    intent JSONB NOT NULL CHECK (jsonb_typeof(intent)='object'),
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500 AND reason=trim(reason) AND reason !~ '[[:cntrl:]]'),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(head_id,version),
    UNIQUE(head_id,id),
    CHECK ((actor_kind='installation' AND actor_operator_id IS NULL)
        OR (actor_kind='operator' AND actor_operator_id IS NOT NULL))
);
CREATE TABLE platform_retail_standard_revisions (
    id UUID PRIMARY KEY,
    head_id UUID NOT NULL,
    schedule JSONB NOT NULL CHECK (jsonb_typeof(schedule)='object'),
    FOREIGN KEY(head_id,id) REFERENCES platform_retail_price_changes(head_id,id),
    UNIQUE(head_id,id)
);
ALTER TABLE platform_retail_price_heads ADD FOREIGN KEY(id,current_revision)
    REFERENCES platform_retail_standard_revisions(head_id,id);
CREATE TABLE platform_retail_promotions (
    id UUID PRIMARY KEY,
    head_id UUID NOT NULL,
    baseline_revision UUID NOT NULL,
    customer_organization_id UUID REFERENCES organizations(id),
    effective_from BIGINT NOT NULL CHECK (effective_from BETWEEN 0 AND 253402300799),
    effective_until BIGINT NOT NULL CHECK (effective_until BETWEEN 1 AND 253402300799 AND effective_until>effective_from),
    schedule JSONB NOT NULL CHECK (jsonb_typeof(schedule)='object'),
    FOREIGN KEY(head_id,id) REFERENCES platform_retail_price_changes(head_id,id),
    FOREIGN KEY(head_id,baseline_revision) REFERENCES platform_retail_standard_revisions(head_id,id),
    UNIQUE(head_id,id)
);
CREATE INDEX platform_retail_promotion_selection ON platform_retail_promotions
    (head_id,customer_organization_id,effective_from,effective_until);
CREATE TABLE platform_retail_promotion_retirements (
    id UUID PRIMARY KEY,
    head_id UUID NOT NULL,
    promotion_id UUID NOT NULL UNIQUE,
    effective_until BIGINT NOT NULL CHECK (effective_until BETWEEN 0 AND 253402300799),
    FOREIGN KEY(head_id,id) REFERENCES platform_retail_price_changes(head_id,id),
    FOREIGN KEY(head_id,promotion_id) REFERENCES platform_retail_promotions(head_id,id)
);
-- One publication serialization lock per price identity; retirement never extends
-- published terms, nor changes already materialized request prices.
CREATE FUNCTION protect_platform_retail_price_head() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' OR ROW(NEW.id,NEW.model_alias,NEW.currency,NEW.rate_kind,NEW.dimensions,NEW.meter)
        IS DISTINCT FROM ROW(OLD.id,OLD.model_alias,OLD.currency,OLD.rate_kind,OLD.dimensions,OLD.meter)
        OR NEW.version<>OLD.version+1 THEN
        RAISE EXCEPTION 'Retail identity is immutable; configuration requires a new version' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_platform_retail_price_head BEFORE UPDATE OR DELETE ON platform_retail_price_heads
    FOR EACH ROW EXECUTE FUNCTION protect_platform_retail_price_head();

-- Compare canonical schedules; no floating-point ratios or changed usage meaning.
CREATE FUNCTION niu_retail_discount_valid(original JSONB,result JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE field TEXT; old_tier JSONB; new_tier JSONB; idx INTEGER;
BEGIN
    IF original->>'kind'='media' THEN
        RETURN (result-'amount_units')=(original-'amount_units')
            AND result->>'amount_units' ~ '^[0-9]+$'
            AND (result->>'amount_units')::numeric <= (original->>'amount_units')::numeric;
    END IF;
    IF original->>'kind' IS DISTINCT FROM 'text' OR result->>'kind' IS DISTINCT FROM 'text'
        OR (result-ARRAY['prompt_rate','completion_rate','cached_prompt_rate','cache_write_prompt_rate',
            'reasoning_completion_rate','minimum_charge_nanos','request_fee_nanos','context_tiers'])
            IS DISTINCT FROM (original-ARRAY['prompt_rate','completion_rate','cached_prompt_rate','cache_write_prompt_rate',
            'reasoning_completion_rate','minimum_charge_nanos','request_fee_nanos','context_tiers'])
        OR jsonb_typeof(result->'context_tiers') IS DISTINCT FROM 'array'
        OR jsonb_array_length(result->'context_tiers')<>jsonb_array_length(original->'context_tiers') THEN
        RETURN FALSE;
    END IF;
    FOREACH field IN ARRAY ARRAY['prompt_rate','completion_rate','cached_prompt_rate','cache_write_prompt_rate',
        'reasoning_completion_rate','minimum_charge_nanos','request_fee_nanos'] LOOP
        IF NOT result ? field OR jsonb_typeof(result->field) IS DISTINCT FROM jsonb_typeof(original->field)
            OR ((result->>field) IS NOT NULL AND ((result->>field) !~ '^[0-9]+$'
                OR (result->>field)::numeric>(original->>field)::numeric)) THEN RETURN FALSE; END IF;
    END LOOP;
    FOR idx IN 0..jsonb_array_length(original->'context_tiers')-1 LOOP
        old_tier:=original->'context_tiers'->idx; new_tier:=result->'context_tiers'->idx;
        IF (new_tier-ARRAY['prompt_rate','completion_rate','cached_prompt_rate','cache_write_prompt_rate','reasoning_completion_rate'])
            IS DISTINCT FROM (old_tier-ARRAY['prompt_rate','completion_rate','cached_prompt_rate','cache_write_prompt_rate','reasoning_completion_rate']) THEN RETURN FALSE; END IF;
        FOREACH field IN ARRAY ARRAY['prompt_rate','completion_rate','cached_prompt_rate','cache_write_prompt_rate','reasoning_completion_rate'] LOOP
            IF NOT new_tier ? field OR jsonb_typeof(new_tier->field) IS DISTINCT FROM jsonb_typeof(old_tier->field)
                OR ((new_tier->>field) IS NOT NULL AND ((new_tier->>field) !~ '^[0-9]+$'
                    OR (new_tier->>field)::numeric>(old_tier->>field)::numeric)) THEN RETURN FALSE; END IF;
        END LOOP;
    END LOOP;
    RETURN TRUE;
END;
$$;
CREATE FUNCTION validate_platform_retail_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE identity platform_retail_price_heads%ROWTYPE; event TEXT; baseline JSONB; cutoff BIGINT;
BEGIN
    SELECT * INTO STRICT identity FROM platform_retail_price_heads WHERE id=NEW.head_id FOR NO KEY UPDATE;
    SELECT action INTO STRICT event FROM platform_retail_price_changes WHERE id=NEW.id AND head_id=NEW.head_id;
    IF TG_TABLE_NAME='platform_retail_promotion_retirements' THEN
        SELECT effective_until INTO STRICT cutoff FROM platform_retail_promotions WHERE id=NEW.promotion_id AND head_id=NEW.head_id;
        IF event<>'promotion_retired' OR NEW.effective_until>cutoff THEN
            RAISE EXCEPTION 'Retail retirement must shorten an existing promotion' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.schedule->>'kind' IS DISTINCT FROM identity.rate_kind
        OR (identity.rate_kind='media' AND (NEW.schedule->'dimensions' IS DISTINCT FROM identity.dimensions
            OR NEW.schedule->>'meter' IS DISTINCT FROM identity.meter)) THEN
        RAISE EXCEPTION 'Retail schedule identity conflicts' USING ERRCODE='23514';
    END IF;
    IF TG_TABLE_NAME='platform_retail_standard_revisions' THEN
        IF event<>'standard_published' THEN RAISE EXCEPTION 'Expected standard publication' USING ERRCODE='23514'; END IF;
    ELSE
        SELECT schedule INTO STRICT baseline FROM platform_retail_standard_revisions WHERE id=NEW.baseline_revision AND head_id=NEW.head_id;
        IF event<>'promotion_published' OR NOT COALESCE(niu_retail_discount_valid(baseline,NEW.schedule),FALSE)
            OR EXISTS(SELECT 1 FROM platform_retail_promotions prior
                LEFT JOIN platform_retail_promotion_retirements retired ON retired.promotion_id=prior.id
                WHERE prior.head_id=NEW.head_id AND prior.customer_organization_id IS NOT DISTINCT FROM NEW.customer_organization_id
                    AND prior.effective_from<LEAST(prior.effective_until,COALESCE(retired.effective_until,prior.effective_until))
                    AND NEW.effective_from<LEAST(prior.effective_until,COALESCE(retired.effective_until,prior.effective_until))
                    AND prior.effective_from<NEW.effective_until) THEN
            RAISE EXCEPTION 'Retail discount or effective period conflicts' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_platform_retail_standard BEFORE INSERT ON platform_retail_standard_revisions
    FOR EACH ROW EXECUTE FUNCTION validate_platform_retail_revision();
CREATE TRIGGER validate_platform_retail_promotion BEFORE INSERT ON platform_retail_promotions
    FOR EACH ROW EXECUTE FUNCTION validate_platform_retail_revision();
CREATE TRIGGER validate_platform_retail_retirement BEFORE INSERT ON platform_retail_promotion_retirements
    FOR EACH ROW EXECUTE FUNCTION validate_platform_retail_revision();
CREATE TRIGGER immutable_platform_retail_change BEFORE UPDATE OR DELETE ON platform_retail_price_changes
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_platform_retail_standard BEFORE UPDATE OR DELETE ON platform_retail_standard_revisions
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_platform_retail_promotion BEFORE UPDATE OR DELETE ON platform_retail_promotions
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_platform_retail_retirement BEFORE UPDATE OR DELETE ON platform_retail_promotion_retirements
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0312_retail_text_bindings.sql 9914
-- Explicit enrollment; legacy workspace tariffs are neither replaced nor
-- backfilled. Disabling enrollment changes only future unpinned operations.
CREATE TABLE retail_text_enrollments (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    model_alias TEXT NOT NULL CHECK (length(model_alias) BETWEEN 1 AND 200),
    price_id UUID REFERENCES platform_retail_price_heads(id),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    PRIMARY KEY (organization_id, project_id, model_alias),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id)
);
CREATE TABLE retail_text_enrollment_changes (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    model_alias TEXT NOT NULL,
    price_id UUID REFERENCES platform_retail_price_heads(id),
    version BIGINT NOT NULL CHECK (version > 0),
    idempotency_key UUID NOT NULL,
    intent JSONB NOT NULL CHECK (jsonb_typeof(intent) = 'object'),
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500
        AND reason = trim(reason) AND reason !~ '[[:cntrl:]]'),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, project_id, model_alias, version),
    UNIQUE (organization_id, project_id, idempotency_key),
    FOREIGN KEY (organization_id, project_id, model_alias)
        REFERENCES retail_text_enrollments(organization_id, project_id, model_alias),
    CHECK ((actor_kind = 'installation' AND actor_operator_id IS NULL)
        OR (actor_kind = 'operator' AND actor_operator_id IS NOT NULL))
);
CREATE FUNCTION protect_retail_text_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.version <> 0 OR NEW.price_id IS NOT NULL THEN
            RAISE EXCEPTION 'New retail enrollment must start in legacy mode at version zero'
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' OR ROW(NEW.organization_id, NEW.project_id, NEW.model_alias)
        IS DISTINCT FROM ROW(OLD.organization_id, OLD.project_id, OLD.model_alias)
        OR NEW.version <> OLD.version + 1 THEN
        RAISE EXCEPTION 'Retail enrollment identity is immutable and requires a new version'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.price_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM platform_retail_price_heads h
        WHERE h.id = NEW.price_id AND h.rate_kind = 'text' AND h.model_alias = NEW.model_alias
          AND h.current_revision IS NOT NULL
          AND EXISTS (SELECT 1 FROM customer_balance_accounts account
              WHERE account.organization_id=NEW.organization_id AND account.currency=h.currency)
    ) THEN
        RAISE EXCEPTION 'Retail enrollment requires the matching published text identity'
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM retail_text_enrollment_changes c
        WHERE c.organization_id = NEW.organization_id AND c.project_id = NEW.project_id
          AND c.model_alias = NEW.model_alias AND c.version = NEW.version
          AND c.price_id IS NOT DISTINCT FROM NEW.price_id) THEN
        RAISE EXCEPTION 'Retail enrollment requires its exact publication history'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_retail_text_enrollment BEFORE INSERT OR UPDATE OR DELETE ON retail_text_enrollments
    FOR EACH ROW EXECUTE FUNCTION protect_retail_text_enrollment();
CREATE TRIGGER immutable_retail_text_enrollment_change
    BEFORE UPDATE OR DELETE ON retail_text_enrollment_changes
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- Concrete revisions reuse the existing text arithmetic and baseline FK.
-- Materialization never changes customer_tariffs.current_revision.
CREATE TABLE retail_text_materializations (
    revision_id UUID PRIMARY KEY,
    tariff_id UUID NOT NULL,
    price_id UUID NOT NULL,
    standard_revision UUID NOT NULL,
    promotion_revision UUID,
    FOREIGN KEY (tariff_id, revision_id) REFERENCES customer_tariff_revisions(tariff_id, id),
    FOREIGN KEY (price_id, standard_revision) REFERENCES platform_retail_standard_revisions(head_id, id),
    FOREIGN KEY (price_id, promotion_revision) REFERENCES platform_retail_promotions(head_id, id)
);
CREATE UNIQUE INDEX retail_text_standard_materialization_once
    ON retail_text_materializations(tariff_id, standard_revision) WHERE promotion_revision IS NULL;
CREATE UNIQUE INDEX retail_text_promotion_materialization_once
    ON retail_text_materializations(tariff_id, standard_revision, promotion_revision)
    WHERE promotion_revision IS NOT NULL;
CREATE FUNCTION validate_retail_text_materialization() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE schedule JSONB; baseline UUID; concrete JSONB; head_currency TEXT; alias TEXT;
BEGIN
    SELECT h.currency, h.model_alias INTO STRICT head_currency, alias
        FROM platform_retail_price_heads h WHERE h.id = NEW.price_id AND h.rate_kind = 'text';
    IF NEW.promotion_revision IS NULL THEN
        SELECT s.schedule INTO STRICT schedule FROM platform_retail_standard_revisions s
            WHERE s.id = NEW.standard_revision AND s.head_id = NEW.price_id;
        baseline := NULL;
    ELSE
        SELECT p.schedule INTO STRICT schedule FROM platform_retail_promotions p
            WHERE p.id = NEW.promotion_revision AND p.head_id = NEW.price_id
              AND p.baseline_revision = NEW.standard_revision;
        SELECT m.revision_id INTO STRICT baseline FROM retail_text_materializations m
            WHERE m.tariff_id = NEW.tariff_id AND m.standard_revision = NEW.standard_revision
              AND m.promotion_revision IS NULL;
    END IF;
    SELECT jsonb_build_object('prompt_rate', r.prompt_rate::text,
        'completion_rate', r.completion_rate::text, 'cached_prompt_rate', r.cached_prompt_rate::text,
        'cache_write_prompt_rate', r.cache_write_prompt_rate::text,
        'reasoning_completion_rate', r.reasoning_completion_rate::text,
        'minimum_charge_nanos', r.minimum_charge_nanos::text, 'request_fee_nanos', r.request_fee_nanos::text,
        'context_tiers', r.context_tiers) INTO STRICT concrete
        FROM customer_tariff_revisions r JOIN customer_tariffs t ON t.id = r.tariff_id
        WHERE r.id = NEW.revision_id AND r.tariff_id = NEW.tariff_id
          AND r.currency = head_currency AND t.model_alias = alias
          AND r.discount_baseline_revision IS NOT DISTINCT FROM baseline;
    IF concrete IS DISTINCT FROM (schedule - 'kind') THEN
        RAISE EXCEPTION 'Materialized text price differs from its published schedule'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_retail_text_materialization BEFORE INSERT ON retail_text_materializations
    FOR EACH ROW EXECUTE FUNCTION validate_retail_text_materialization();
CREATE TRIGGER immutable_retail_text_materialization BEFORE UPDATE OR DELETE ON retail_text_materializations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE TABLE retail_text_operation_prices (
    operation_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    revision_id UUID NOT NULL REFERENCES retail_text_materializations(revision_id),
    selected_at BIGINT NOT NULL CHECK (selected_at >= 0),
    promotion_scope TEXT CHECK (promotion_scope IN ('global', 'customer')),
    FOREIGN KEY (organization_id, project_id, operation_id)
        REFERENCES operations(organization_id, project_id, id)
);
CREATE FUNCTION validate_retail_text_operation_price() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected_promotion UUID; selected_customer UUID; bound_revision UUID;
BEGIN
    SELECT m.promotion_revision INTO STRICT selected_promotion
        FROM retail_text_materializations m
        JOIN customer_tariffs t ON t.id = m.tariff_id JOIN operations o ON o.id = NEW.operation_id
        WHERE m.revision_id = NEW.revision_id AND t.organization_id = NEW.organization_id
          AND t.project_id = NEW.project_id AND t.model_alias = o.model_alias;
    SELECT revision_id INTO STRICT bound_revision FROM customer_operation_tariffs
        WHERE operation_id = NEW.operation_id;
    IF bound_revision <> NEW.revision_id THEN
        RAISE EXCEPTION 'Retail provenance must match the pinned operation price' USING ERRCODE = '23514';
    END IF;
    IF selected_promotion IS NULL THEN
        IF NEW.promotion_scope IS NOT NULL THEN
            RAISE EXCEPTION 'Standard price cannot claim a promotion scope' USING ERRCODE = '23514';
        END IF;
    ELSE
        SELECT customer_organization_id INTO STRICT selected_customer
            FROM platform_retail_promotions p WHERE id = selected_promotion
              AND p.effective_from <= NEW.selected_at AND p.effective_until > NEW.selected_at
              AND NOT EXISTS (SELECT 1 FROM platform_retail_promotion_retirements r
                  WHERE r.promotion_id = p.id AND r.effective_until <= NEW.selected_at);
        IF (selected_customer IS NULL AND NEW.promotion_scope IS DISTINCT FROM 'global')
            OR (selected_customer IS NOT NULL AND (selected_customer <> NEW.organization_id
                OR NEW.promotion_scope IS DISTINCT FROM 'customer')) THEN
            RAISE EXCEPTION 'Retail promotion customer scope conflicts' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_retail_text_operation_price BEFORE INSERT ON retail_text_operation_prices
    FOR EACH ROW EXECUTE FUNCTION validate_retail_text_operation_price();
CREATE TRIGGER immutable_retail_text_operation_price BEFORE UPDATE OR DELETE ON retail_text_operation_prices
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0313_media_liability_qualifications.sql 12015
-- Qualified maximum billable quantity, independent of prices and estimates.
-- Exact route identities require explicit new qualification after configuration
-- changes. No existing customer card or Supplier review is promoted by migration.
CREATE FUNCTION niu_media_liability_quantity_valid(quantity JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE numerator NUMERIC; denominator NUMERIC; left_value NUMERIC; right_value NUMERIC; remainder NUMERIC;
BEGIN
    IF jsonb_typeof(quantity) IS DISTINCT FROM 'object'
        OR NOT quantity ?& ARRAY['numerator', 'denominator']
        OR quantity - ARRAY['numerator', 'denominator'] <> '{}'::jsonb
        OR jsonb_typeof(quantity->'numerator') IS DISTINCT FROM 'string'
        OR jsonb_typeof(quantity->'denominator') IS DISTINCT FROM 'string'
        OR quantity->>'numerator' !~ '^[1-9][0-9]{0,38}$'
        OR quantity->>'denominator' !~ '^[1-9][0-9]{0,38}$' THEN RETURN FALSE; END IF;
    numerator := (quantity->>'numerator')::numeric;
    denominator := (quantity->>'denominator')::numeric;
    IF numerator > 340282366920938463463374607431768211455
        OR denominator > 340282366920938463463374607431768211455 THEN RETURN FALSE; END IF;
    left_value := numerator; right_value := denominator;
    WHILE right_value <> 0 LOOP
        remainder := mod(left_value, right_value); left_value := right_value; right_value := remainder;
    END LOOP;
    RETURN left_value = 1;
END;
$$;
CREATE FUNCTION niu_media_liability_identity_valid(identity JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE field TEXT;
BEGIN
    IF jsonb_typeof(identity) IS DISTINCT FROM 'object'
        OR NOT identity ?& ARRAY['supplier_id','offer_id','offer_revision','vendor_id','vendor_revision',
            'model_alias','model_revision','schema_revision','dimensions','meter']
        OR identity - ARRAY['supplier_id','offer_id','offer_revision','vendor_id','vendor_revision',
            'model_alias','model_revision','schema_revision','dimensions','meter'] <> '{}'::jsonb
        OR jsonb_typeof(identity->'dimensions') IS DISTINCT FROM 'object'
        OR NOT (identity->'dimensions') ?& ARRAY['model','channel','resolution','reference_video']
        OR (identity->'dimensions') - ARRAY['model','channel','resolution','reference_video'] <> '{}'::jsonb
        OR jsonb_typeof(identity->'dimensions'->'reference_video') IS DISTINCT FROM 'boolean'
        OR identity->'dimensions'->>'model' IS DISTINCT FROM identity->>'model_alias' THEN RETURN FALSE; END IF;
    FOREACH field IN ARRAY ARRAY['supplier_id','offer_id','offer_revision','vendor_id','vendor_revision',
        'model_alias','model_revision','schema_revision','meter'] LOOP
        IF jsonb_typeof(identity->field) IS DISTINCT FROM 'string'
            OR length(identity->>field) NOT BETWEEN 1 AND 256
            OR identity->>field <> trim(identity->>field)
            OR identity->>field ~ '[[:cntrl:]]' THEN RETURN FALSE; END IF;
    END LOOP;
    FOREACH field IN ARRAY ARRAY['supplier_id','offer_id','offer_revision','vendor_id'] LOOP
        IF identity->>field !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN RETURN FALSE; END IF;
    END LOOP;
    FOREACH field IN ARRAY ARRAY['vendor_revision','model_revision'] LOOP
        IF identity->>field !~ '^[1-9][0-9]{0,18}$' THEN RETURN FALSE; END IF;
        IF (identity->>field)::numeric > 9223372036854775807 THEN RETURN FALSE; END IF;
    END LOOP;
    FOREACH field IN ARRAY ARRAY['model','channel','resolution'] LOOP
        IF jsonb_typeof(identity->'dimensions'->field) IS DISTINCT FROM 'string'
            OR length(identity->'dimensions'->>field) NOT BETWEEN 1 AND 256
            OR identity->'dimensions'->>field <> trim(identity->'dimensions'->>field)
            OR identity->'dimensions'->>field ~ '[[:cntrl:]]' THEN RETURN FALSE; END IF;
    END LOOP;
    RETURN length(identity->>'model_alias') <= 200 AND identity->>'meter' <> 'text_tokens';
END;
$$;
CREATE TABLE media_liability_qualification_heads (
    id UUID PRIMARY KEY,
    supplier_id UUID NOT NULL,
    offer_id UUID NOT NULL,
    offer_revision UUID NOT NULL,
    identity JSONB NOT NULL CHECK (niu_media_liability_identity_valid(identity)
        AND identity->>'supplier_id' = supplier_id::text AND identity->>'offer_id' = offer_id::text
        AND identity->>'offer_revision' = offer_revision::text),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    UNIQUE (identity),
    FOREIGN KEY (supplier_id, offer_id) REFERENCES provider_offers(provider_id, id),
    FOREIGN KEY (offer_id, offer_revision) REFERENCES provider_offer_revisions(offer_id, id)
);
CREATE TABLE media_liability_qualification_changes (
    id UUID PRIMARY KEY,
    head_id UUID NOT NULL REFERENCES media_liability_qualification_heads(id),
    version BIGINT NOT NULL CHECK (version > 0),
    action TEXT NOT NULL CHECK (action IN ('published', 'revoked')),
    idempotency_key UUID NOT NULL UNIQUE,
    intent JSONB NOT NULL CHECK (jsonb_typeof(intent) = 'object'),
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500
        AND reason = trim(reason) AND reason !~ '[[:cntrl:]]'),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (head_id, version),
    UNIQUE (head_id, id),
    CHECK ((actor_kind = 'installation' AND actor_operator_id IS NULL)
        OR (actor_kind = 'operator' AND actor_operator_id IS NOT NULL))
);
CREATE TABLE media_liability_qualifications (
    id UUID PRIMARY KEY,
    head_id UUID NOT NULL,
    maximum_quantity JSONB NOT NULL CHECK (niu_media_liability_quantity_valid(maximum_quantity)),
    evidence_revision TEXT NOT NULL CHECK (length(evidence_revision) BETWEEN 1 AND 256
        AND evidence_revision = trim(evidence_revision) AND evidence_revision !~ '[[:cntrl:]]'),
    evidence_sha256 TEXT NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
    effective_from BIGINT NOT NULL CHECK (effective_from BETWEEN 0 AND 253402300799),
    effective_until BIGINT NOT NULL CHECK (effective_until BETWEEN 1 AND 253402300799
        AND effective_until > effective_from),
    FOREIGN KEY (head_id, id) REFERENCES media_liability_qualification_changes(head_id, id),
    UNIQUE (head_id, id)
);
CREATE TABLE media_liability_qualification_revocations (
    id UUID PRIMARY KEY,
    head_id UUID NOT NULL,
    qualification_id UUID NOT NULL UNIQUE,
    effective_until BIGINT NOT NULL CHECK (effective_until BETWEEN 0 AND 253402300799),
    FOREIGN KEY (head_id, id) REFERENCES media_liability_qualification_changes(head_id, id),
    FOREIGN KEY (head_id, qualification_id) REFERENCES media_liability_qualifications(head_id, id)
);
CREATE FUNCTION protect_media_liability_head() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.version <> 0 THEN
            RAISE EXCEPTION 'New media liability identity starts at version zero' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' OR ROW(NEW.id, NEW.supplier_id, NEW.offer_id, NEW.offer_revision, NEW.identity)
        IS DISTINCT FROM ROW(OLD.id, OLD.supplier_id, OLD.offer_id, OLD.offer_revision, OLD.identity)
        OR NEW.version <> OLD.version + 1 THEN
        RAISE EXCEPTION 'Media liability identity is immutable and requires a new version'
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM media_liability_qualification_changes c
        WHERE c.head_id = NEW.id AND c.version = NEW.version) THEN
        RAISE EXCEPTION 'Media liability version requires publication history' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_media_liability_head BEFORE INSERT OR UPDATE OR DELETE ON media_liability_qualification_heads
    FOR EACH ROW EXECUTE FUNCTION protect_media_liability_head();
CREATE FUNCTION validate_media_liability_qualification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE head media_liability_qualification_heads%ROWTYPE; action TEXT; original_until BIGINT;
BEGIN
    SELECT * INTO STRICT head FROM media_liability_qualification_heads WHERE id = NEW.head_id FOR NO KEY UPDATE;
    SELECT c.action INTO STRICT action FROM media_liability_qualification_changes c
        WHERE c.id = NEW.id AND c.head_id = NEW.head_id;
    IF TG_TABLE_NAME = 'media_liability_qualification_revocations' THEN
        SELECT effective_until INTO STRICT original_until FROM media_liability_qualifications
            WHERE id = NEW.qualification_id AND head_id = NEW.head_id;
        IF action <> 'revoked' OR NEW.effective_until > original_until THEN
            RAISE EXCEPTION 'Media liability revocation cannot extend qualification' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    IF action <> 'published' OR NOT EXISTS (
        SELECT 1 FROM provider_offers o JOIN provider_offer_revisions r ON r.id = o.current_revision
        JOIN vendors v ON v.id = o.vendor_id JOIN vendor_models m ON m.vendor_id = v.id AND m.alias = o.model_alias
        WHERE o.id = head.offer_id AND o.provider_id = head.supplier_id AND r.id = head.offer_revision
          AND r.rate_kind = 'media' AND o.active AND v.enabled AND m.enabled
          AND v.id::text = head.identity->>'vendor_id'
          AND v.revision = (head.identity->>'vendor_revision')::bigint
          AND m.alias = head.identity->>'model_alias'
          AND m.revision = (head.identity->>'model_revision')::bigint
          AND m.capabilities->'video_schema'->>'revision' = head.identity->>'schema_revision'
          AND m.capabilities->'video_schema'->>'channel' = head.identity->'dimensions'->>'channel'
          AND head.identity->'dimensions'->>'model' = m.alias
          AND head.identity->>'supplier_id' = head.supplier_id::text
          AND head.identity->>'offer_id' = head.offer_id::text
          AND head.identity->>'offer_revision' = head.offer_revision::text
          AND niu_offer_qualification_current(o.provider_id, o.id, r.id)
          AND niu_media_offer_binding_current(o.provider_id, o.id, r.id)
          AND NOT EXISTS (SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id = v.id)
    ) OR EXISTS (
        SELECT 1 FROM media_liability_qualifications q
        LEFT JOIN media_liability_qualification_revocations revoked ON revoked.qualification_id = q.id
        WHERE q.head_id = NEW.head_id
          AND q.effective_from < LEAST(q.effective_until, COALESCE(revoked.effective_until, q.effective_until))
          AND NEW.effective_from < LEAST(q.effective_until, COALESCE(revoked.effective_until, q.effective_until))
          AND q.effective_from < NEW.effective_until
    ) THEN
        RAISE EXCEPTION 'Media liability requires current exact qualified supply and nonoverlapping validity'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_media_liability_qualification BEFORE INSERT ON media_liability_qualifications
    FOR EACH ROW EXECUTE FUNCTION validate_media_liability_qualification();
CREATE TRIGGER validate_media_liability_revocation BEFORE INSERT ON media_liability_qualification_revocations
    FOR EACH ROW EXECUTE FUNCTION validate_media_liability_qualification();
CREATE TRIGGER immutable_media_liability_change BEFORE UPDATE OR DELETE ON media_liability_qualification_changes
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_media_liability_qualification BEFORE UPDATE OR DELETE ON media_liability_qualifications
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_media_liability_revocation BEFORE UPDATE OR DELETE ON media_liability_qualification_revocations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE INDEX media_liability_qualification_selection ON media_liability_qualifications(head_id, effective_from, effective_until);

-- @niu-legacy-migration 0314_retail_media_enrollment.sql 4922
-- Explicit per-workspace media selling identity. No Supplier qualification,
-- capacity, balance account or legacy card is created by enrollment.
CREATE TABLE retail_media_enrollments (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    dimensions JSONB NOT NULL CHECK (jsonb_typeof(dimensions) = 'object'
        AND dimensions ?& ARRAY['model','channel','resolution','reference_video']
        AND dimensions - ARRAY['model','channel','resolution','reference_video'] = '{}'::jsonb
        AND jsonb_typeof(dimensions->'model') = 'string'
        AND jsonb_typeof(dimensions->'channel') = 'string'
        AND jsonb_typeof(dimensions->'resolution') = 'string'
        AND jsonb_typeof(dimensions->'reference_video') = 'boolean'
        AND octet_length(dimensions->>'model') BETWEEN 1 AND 200
        AND octet_length(dimensions->>'channel') BETWEEN 1 AND 256
        AND octet_length(dimensions->>'resolution') BETWEEN 1 AND 256
        AND dimensions->>'model' = trim(dimensions->>'model')
        AND dimensions->>'channel' = trim(dimensions->>'channel')
        AND dimensions->>'resolution' = trim(dimensions->>'resolution')
        AND dimensions->>'model' !~ '[[:cntrl:]]'
        AND dimensions->>'channel' !~ '[[:cntrl:]]'
        AND dimensions->>'resolution' !~ '[[:cntrl:]]'),
    meter TEXT NOT NULL CHECK (octet_length(meter) BETWEEN 1 AND 256
        AND meter = trim(meter) AND meter !~ '[[:cntrl:]]' AND meter <> 'text_tokens'),
    price_id UUID REFERENCES platform_retail_price_heads(id),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    UNIQUE (organization_id, project_id, dimensions, meter),
    UNIQUE (organization_id, project_id, id),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id)
);
CREATE TABLE retail_media_enrollment_changes (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    enrollment_id UUID NOT NULL,
    price_id UUID REFERENCES platform_retail_price_heads(id),
    version BIGINT NOT NULL CHECK (version > 0),
    idempotency_key UUID NOT NULL,
    intent JSONB NOT NULL CHECK (jsonb_typeof(intent) = 'object'),
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500
        AND reason = trim(reason) AND reason !~ '[[:cntrl:]]'),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (enrollment_id, version),
    UNIQUE (organization_id, project_id, idempotency_key),
    FOREIGN KEY (organization_id, project_id, enrollment_id)
        REFERENCES retail_media_enrollments(organization_id, project_id, id),
    CHECK ((actor_kind = 'installation' AND actor_operator_id IS NULL)
        OR (actor_kind = 'operator' AND actor_operator_id IS NOT NULL))
);
CREATE FUNCTION protect_retail_media_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.version <> 0 OR NEW.price_id IS NOT NULL THEN
            RAISE EXCEPTION 'Media enrollment starts in legacy mode at version zero' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' OR ROW(NEW.id, NEW.organization_id, NEW.project_id, NEW.dimensions, NEW.meter)
        IS DISTINCT FROM ROW(OLD.id, OLD.organization_id, OLD.project_id, OLD.dimensions, OLD.meter)
        OR NEW.version <> OLD.version + 1 THEN
        RAISE EXCEPTION 'Media enrollment identity is immutable and requires a new version' USING ERRCODE = '23514';
    END IF;
    IF NEW.price_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM platform_retail_price_heads h
        JOIN customer_balance_accounts a ON a.organization_id = NEW.organization_id AND a.currency = h.currency
        WHERE h.id = NEW.price_id AND h.rate_kind = 'media' AND h.current_revision IS NOT NULL
          AND h.dimensions = NEW.dimensions AND h.meter = NEW.meter
          AND h.model_alias = NEW.dimensions->>'model'
    ) THEN
        RAISE EXCEPTION 'Media enrollment requires matching published selling identity and existing currency account'
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM retail_media_enrollment_changes c
        WHERE c.enrollment_id = NEW.id AND c.version = NEW.version
          AND c.price_id IS NOT DISTINCT FROM NEW.price_id) THEN
        RAISE EXCEPTION 'Media enrollment requires exact publication history' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_retail_media_enrollment BEFORE INSERT OR UPDATE OR DELETE ON retail_media_enrollments
    FOR EACH ROW EXECUTE FUNCTION protect_retail_media_enrollment();
CREATE TRIGGER immutable_retail_media_enrollment_change BEFORE UPDATE OR DELETE ON retail_media_enrollment_changes
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0315_retail_media_admission.sql 11596
-- New platform video pins retain explicit selling provenance and independently
-- qualified maximum quantity. Existing legacy snapshots are never rewritten.
CREATE TABLE retail_media_attempt_prices (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    price_id UUID NOT NULL,
    baseline_revision UUID NOT NULL,
    promotion_revision UUID,
    qualification_revision UUID NOT NULL REFERENCES media_liability_qualifications(id),
    selected_at BIGINT NOT NULL CHECK (selected_at >= 0),
    selection JSONB NOT NULL CHECK (jsonb_typeof(selection) = 'object'),
    FOREIGN KEY (organization_id,project_id,attempt_id)
        REFERENCES attempts(organization_id,project_id,id),
    FOREIGN KEY (price_id,baseline_revision) REFERENCES platform_retail_standard_revisions(head_id,id),
    FOREIGN KEY (price_id,promotion_revision) REFERENCES platform_retail_promotions(head_id,id)
);
CREATE FUNCTION validate_retail_media_attempt_price() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selling JSONB; original JSONB; identity JSONB; quantity JSONB; bound JSONB;
    currency_code TEXT; current_standard UUID; current_version BIGINT; model TEXT;
    snapshot JSONB; concrete JSONB; customer UUID;
BEGIN
    SELECT h.currency,h.current_revision,h.version,h.model_alias INTO STRICT currency_code,current_standard,current_version,model
        FROM platform_retail_price_heads h WHERE h.id=NEW.price_id AND h.rate_kind='media';
    SELECT schedule INTO STRICT original FROM platform_retail_standard_revisions
        WHERE head_id=NEW.price_id AND id=NEW.baseline_revision;
    IF NEW.promotion_revision IS NULL THEN
        IF current_standard<>NEW.baseline_revision THEN
            RAISE EXCEPTION 'Platform media standard selection conflicts' USING ERRCODE='23514';
        END IF;
        selling:=original;
    ELSE
        SELECT p.schedule,p.customer_organization_id INTO STRICT selling,customer
            FROM platform_retail_promotions p
            LEFT JOIN platform_retail_promotion_retirements r ON r.promotion_id=p.id
            WHERE p.id=NEW.promotion_revision AND p.head_id=NEW.price_id
              AND p.baseline_revision=NEW.baseline_revision AND p.effective_from<=NEW.selected_at
              AND LEAST(p.effective_until,COALESCE(r.effective_until,p.effective_until))>NEW.selected_at
              AND (p.customer_organization_id IS NULL OR p.customer_organization_id=NEW.organization_id);
    END IF;
    IF EXISTS (SELECT 1 FROM platform_retail_promotions p
        LEFT JOIN platform_retail_promotion_retirements r ON r.promotion_id=p.id
        WHERE p.head_id=NEW.price_id AND p.effective_from<=NEW.selected_at
          AND LEAST(p.effective_until,COALESCE(r.effective_until,p.effective_until))>NEW.selected_at
          AND (p.customer_organization_id IS NULL OR p.customer_organization_id=NEW.organization_id)
          AND (NEW.promotion_revision IS NULL OR (customer IS NULL AND p.customer_organization_id=NEW.organization_id))) THEN
        RAISE EXCEPTION 'Platform media promotion precedence conflicts' USING ERRCODE='23514';
    END IF;
    SELECT p.snapshot INTO STRICT snapshot FROM customer_media_attempt_pricing p
        WHERE p.attempt_id=NEW.attempt_id AND p.organization_id=NEW.organization_id AND p.project_id=NEW.project_id;
    SELECT h.identity,q.maximum_quantity INTO STRICT identity,quantity
        FROM media_liability_qualifications q JOIN media_liability_qualification_heads h ON h.id=q.head_id
        LEFT JOIN media_liability_qualification_revocations r ON r.qualification_id=q.id
        WHERE q.id=NEW.qualification_revision AND q.effective_from<=NEW.selected_at
          AND LEAST(q.effective_until,COALESCE(r.effective_until,q.effective_until))>NEW.selected_at;
    SELECT b.bound INTO STRICT bound FROM customer_media_liability_bounds b
        WHERE b.attempt_id=NEW.attempt_id AND b.organization_id=NEW.organization_id AND b.project_id=NEW.project_id;
    concrete:=jsonb_build_object('dimensions',snapshot->'tariff'->'dimensions','meter',snapshot->'tariff'->'meter',
        'decimal_places',snapshot->'tariff'->'decimal_places','amount_units',snapshot->'tariff'->>'amount_units',
        'per_quantity',snapshot->'tariff'->'per_quantity','minimum_quantity',snapshot->'tariff'->'minimum_quantity',
        'rounding',snapshot->'tariff'->'rounding');
    IF selling->>'kind' IS DISTINCT FROM 'media' OR concrete IS DISTINCT FROM selling-'kind'
        OR snapshot->'discounts' IS DISTINCT FROM '[]'::jsonb
        OR snapshot->>'customer' IS DISTINCT FROM NEW.organization_id::text
        OR snapshot->'tariff'->>'currency' IS DISTINCT FROM currency_code
        OR snapshot->'tariff'->>'revision' IS DISTINCT FROM COALESCE(NEW.promotion_revision,NEW.baseline_revision)::text
        OR snapshot->>'selected_at' IS DISTINCT FROM NEW.selected_at::text
        OR NEW.selection->'schedule' IS DISTINCT FROM selling
        OR NEW.selection->>'price_id' IS DISTINCT FROM NEW.price_id::text
        OR NEW.selection->>'baseline_revision' IS DISTINCT FROM NEW.baseline_revision::text
        OR NEW.selection->>'promotion_revision' IS DISTINCT FROM NEW.promotion_revision::text
        OR NEW.selection->>'current_standard_revision' IS DISTINCT FROM current_standard::text
        OR NEW.selection->>'currency' IS DISTINCT FROM currency_code
        OR NEW.selection->>'model_alias' IS DISTINCT FROM model
        OR NEW.selection->>'version' IS DISTINCT FROM current_version::text
        OR NEW.selection->>'selected_at' IS DISTINCT FROM NEW.selected_at::text
        OR NEW.selection->>'promotion_scope' IS DISTINCT FROM (CASE WHEN NEW.promotion_revision IS NULL THEN NULL
            WHEN customer IS NULL THEN 'global' ELSE 'customer' END)
        OR identity->'dimensions' IS DISTINCT FROM selling->'dimensions'
        OR identity->>'meter' IS DISTINCT FROM selling->>'meter'
        OR bound->>'meter' IS DISTINCT FROM identity->>'meter'
        OR bound->'maximum_quantity' IS DISTINCT FROM quantity
        OR bound->>'qualification_revision' IS DISTINCT FROM NEW.qualification_revision::text
        OR snapshot->>'offer' IS DISTINCT FROM identity->>'offer_revision'
        OR NOT EXISTS (SELECT 1 FROM retail_media_enrollments e
            WHERE e.organization_id=NEW.organization_id AND e.project_id=NEW.project_id
              AND e.price_id=NEW.price_id AND e.dimensions=selling->'dimensions' AND e.meter=selling->>'meter')
        OR NOT EXISTS (SELECT 1 FROM provider_attempt_offers b JOIN media_recovery_routes route ON route.attempt_id=b.attempt_id
            WHERE b.attempt_id=NEW.attempt_id AND b.provider_id::text=identity->>'supplier_id'
              AND b.offer_id::text=identity->>'offer_id' AND b.revision_id::text=identity->>'offer_revision'
              AND route.vendor_id::text=identity->>'vendor_id'
              AND route.vendor_revision::text=identity->>'vendor_revision'
              AND route.model_revision::text=identity->>'model_revision'
              AND route.schema_revision=identity->>'schema_revision') THEN
        RAISE EXCEPTION 'Platform media snapshot, price, bound or route provenance conflicts' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_retail_media_attempt_price BEFORE INSERT ON retail_media_attempt_prices
    FOR EACH ROW EXECUTE FUNCTION validate_retail_media_attempt_price();
CREATE TRIGGER immutable_retail_media_attempt_price BEFORE UPDATE OR DELETE ON retail_media_attempt_prices
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- No price reselection or row-lock upgrades here: existing dispatch owns the
-- attempt lock. Expired/revoked quantity qualification denies unsent egress;
-- already-dispatched asynchronous jobs retain their original price and bound.
CREATE FUNCTION guard_platform_media_liability_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE at BIGINT;
BEGIN
    IF OLD.execution<>'not_sent' OR NEW.execution<>'may_have_executed'
        OR NOT EXISTS(SELECT 1 FROM retail_media_attempt_prices p WHERE p.attempt_id=NEW.id) THEN RETURN NEW; END IF;
    at:=floor(extract(epoch FROM clock_timestamp()))::bigint;
    IF NOT EXISTS (
        SELECT 1 FROM retail_media_attempt_prices p
        JOIN media_liability_qualifications q ON q.id=p.qualification_revision
        JOIN media_liability_qualification_heads h ON h.id=q.head_id
        LEFT JOIN media_liability_qualification_revocations revoked ON revoked.qualification_id=q.id
        JOIN provider_attempt_offers b ON b.attempt_id=p.attempt_id
        JOIN provider_offers o ON o.id=b.offer_id AND o.provider_id=b.provider_id
        JOIN vendors v ON v.id=o.vendor_id JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=o.model_alias
        JOIN media_recovery_routes route ON route.attempt_id=p.attempt_id
        JOIN customer_media_attempt_pricing price ON price.attempt_id=p.attempt_id
        JOIN customer_media_liability_bounds bound ON bound.attempt_id=p.attempt_id
        WHERE p.attempt_id=NEW.id AND p.organization_id=NEW.organization_id AND p.project_id=NEW.project_id
          AND q.effective_from<=at AND LEAST(q.effective_until,COALESCE(revoked.effective_until,q.effective_until))>at
          AND b.provider_id=h.supplier_id AND b.offer_id=h.offer_id AND b.revision_id=h.offer_revision
          AND o.current_revision=b.revision_id AND o.active AND v.enabled AND m.enabled
          AND v.id::text=h.identity->>'vendor_id' AND v.revision::text=h.identity->>'vendor_revision'
          AND m.alias=h.identity->>'model_alias' AND m.revision::text=h.identity->>'model_revision'
          AND m.capabilities->'video_schema'->>'revision'=h.identity->>'schema_revision'
          AND route.vendor_id=v.id AND route.vendor_revision=v.revision AND route.model_revision=m.revision
          AND route.schema_revision=h.identity->>'schema_revision'
          AND price.snapshot->'discounts'='[]'::jsonb
          AND price.snapshot->>'customer'=p.organization_id::text
          AND price.snapshot->>'selected_at'=p.selected_at::text
          AND price.snapshot->'tariff'->>'currency'=p.selection->>'currency'
          AND price.snapshot->'tariff'->>'revision'=COALESCE(p.promotion_revision,p.baseline_revision)::text
          AND price.snapshot->>'offer'=b.revision_id::text
          AND jsonb_build_object('dimensions',price.snapshot->'tariff'->'dimensions',
              'meter',price.snapshot->'tariff'->'meter','decimal_places',price.snapshot->'tariff'->'decimal_places',
              'amount_units',price.snapshot->'tariff'->>'amount_units',
              'per_quantity',price.snapshot->'tariff'->'per_quantity',
              'minimum_quantity',price.snapshot->'tariff'->'minimum_quantity',
              'rounding',price.snapshot->'tariff'->'rounding')=(p.selection->'schedule')-'kind'
          AND price.snapshot->'tariff'->'dimensions'=h.identity->'dimensions'
          AND bound.bound->'maximum_quantity'=q.maximum_quantity
          AND bound.bound->>'meter'=h.identity->>'meter'
          AND bound.bound->>'qualification_revision'=q.id::text
          AND niu_offer_qualification_current(b.provider_id,b.offer_id,b.revision_id)
          AND niu_media_offer_binding_current(b.provider_id,b.offer_id,b.revision_id)
    ) THEN
        RAISE EXCEPTION 'Platform media liability qualification changed before dispatch' USING ERRCODE='P0007';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER guard_platform_media_liability_dispatch BEFORE UPDATE OF execution ON attempts
    FOR EACH ROW EXECUTE FUNCTION guard_platform_media_liability_dispatch();

-- @niu-legacy-migration 0316_zero_customer_liability.sql 741
-- A known zero selling tariff has an exact zero customer liability. Preserve
-- account/attempt bindings, qualified usage bounds and dispatch guards without
-- inventing a positive monetary hold. No historical record is rewritten.
ALTER TABLE customer_balance_reservations
    DROP CONSTRAINT customer_balance_reservations_amount_nanos_check;
ALTER TABLE customer_balance_reservations
    ADD CONSTRAINT customer_balance_reservations_amount_nanos_check CHECK (amount_nanos >= 0);
ALTER TABLE customer_media_liability_bounds
    DROP CONSTRAINT customer_media_liability_bounds_maximum_nanos_check;
ALTER TABLE customer_media_liability_bounds
    ADD CONSTRAINT customer_media_liability_bounds_maximum_nanos_check CHECK (maximum_nanos >= 0);

-- @niu-legacy-migration 0317_customer_refund_lookup.sql 267
-- Refund/source reconciliation follows the original charge entry. No financial
-- row or historical provenance is rewritten by this lookup index.
CREATE INDEX customer_balance_refunds_by_charge
    ON customer_balance_entries(reverses_entry_id) WHERE kind='refund';

-- @niu-legacy-migration 0318_commercial_audit_order.sql 786
-- Source-qualified audit pagination follows metadata only. No operation history
-- is rewritten; bound each newly integrated commercial journal before merging.
CREATE INDEX platform_retail_price_changes_audit_order ON platform_retail_price_changes(created_at DESC, (id::text) DESC);
CREATE INDEX retail_text_enrollment_changes_audit_order ON retail_text_enrollment_changes(created_at DESC, (id::text) DESC);
CREATE INDEX retail_media_enrollment_changes_audit_order ON retail_media_enrollment_changes(created_at DESC, (id::text) DESC);
CREATE INDEX customer_balance_grants_audit_order ON customer_balance_grants(created_at DESC, (id::text) DESC);
CREATE INDEX media_liability_qualification_changes_audit_order ON media_liability_qualification_changes(created_at DESC, (id::text) DESC);

-- @niu-legacy-migration 0319_customer_credit_sources.sql 18380
-- Forward cash/credit provenance only. No historical debit is guessed or
-- backfilled; non-gift consumption is not automatically a verified cash sale.
CREATE TABLE customer_credit_sources (
    entry_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('charge','refund')),
    nominal_nanos BIGINT NOT NULL CHECK (nominal_nanos>0),
    nongift_nanos BIGINT CHECK (nongift_nanos>=0 AND nongift_nanos<=nominal_nanos),
    cash_nanos BIGINT,
    credit_nanos BIGINT,
    source_coverage TEXT NOT NULL CHECK (source_coverage IN ('known','legacy_unknown')),
    source_charge_entry_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id,account_id,currency,entry_id),
    FOREIGN KEY(organization_id,account_id,currency,entry_id)
        REFERENCES customer_balance_entries(organization_id,account_id,currency,id),
    FOREIGN KEY(organization_id,account_id,currency,source_charge_entry_id)
        REFERENCES customer_balance_entries(organization_id,account_id,currency,id),
    CHECK ((kind='charge' AND source_charge_entry_id IS NULL)
        OR (kind='refund' AND source_charge_entry_id IS NOT NULL)),
    CHECK ((source_coverage='known' AND nongift_nanos IS NOT NULL
        AND cash_nanos IS NOT NULL AND credit_nanos IS NOT NULL
        AND cash_nanos>=0 AND credit_nanos>=0
        AND cash_nanos::numeric+credit_nanos::numeric=nongift_nanos)
        OR (source_coverage='legacy_unknown' AND cash_nanos IS NULL AND credit_nanos IS NULL))
);
CREATE INDEX customer_credit_sources_account ON customer_credit_sources(account_id,created_at,entry_id);
CREATE INDEX customer_credit_sources_refunds ON customer_credit_sources(source_charge_entry_id) WHERE kind='refund';
CREATE TABLE customer_credit_repayments (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    funding_entry_id UUID NOT NULL REFERENCES customer_funding_receipts(entry_id),
    charge_entry_id UUID NOT NULL,
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(funding_entry_id,charge_entry_id),
    FOREIGN KEY(organization_id,account_id,currency,funding_entry_id)
        REFERENCES customer_balance_entries(organization_id,account_id,currency,id),
    FOREIGN KEY(organization_id,account_id,currency,charge_entry_id)
        REFERENCES customer_credit_sources(organization_id,account_id,currency,entry_id)
);
CREATE INDEX customer_credit_repayments_account ON customer_credit_repayments(account_id,created_at,id);
CREATE INDEX customer_credit_repayments_charge ON customer_credit_repayments(charge_entry_id);

-- VOLATILE deliberately observes preceding trigger writes in the same owned
-- transaction. Account serialization, not an old statement snapshot, is the
-- authority for pool availability. Missing history always withholds coverage.
CREATE FUNCTION niu_customer_credit_account_covered(account UUID,ignore_entry UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE SQL VOLATILE AS $$
SELECT EXISTS(SELECT 1 FROM customer_balance_accounts a WHERE a.id=account)
AND NOT EXISTS (
    SELECT 1 FROM customer_balance_entries e
    WHERE e.account_id=account AND e.id IS DISTINCT FROM ignore_entry AND (
        e.kind='funding_reversal'
        OR (e.kind IN ('charge','refund') AND NOT EXISTS (
            SELECT 1 FROM customer_credit_sources s WHERE s.entry_id=e.id AND s.source_coverage='known'))
        OR (e.kind='funding' AND NOT EXISTS (
            SELECT 1 FROM customer_funding_receipts r
            WHERE r.entry_id=e.id AND r.organization_id=e.organization_id AND r.account_id=e.account_id
              AND r.currency=e.currency AND r.amount_nanos=e.amount_nanos AND e.amount_nanos>0))
        OR (e.kind='adjustment' AND NOT EXISTS (
            SELECT 1 FROM customer_balance_grants g
            WHERE g.entry_id=e.id AND g.organization_id=e.organization_id AND g.account_id=e.account_id
              AND g.currency=e.currency AND g.amount_nanos=e.amount_nanos AND e.amount_nanos>0))
    )
)
AND NOT EXISTS (
    SELECT 1 FROM customer_funding_receipts r
    LEFT JOIN customer_balance_entries e ON e.id=r.entry_id
    WHERE r.account_id=account AND (e.id IS NULL OR e.kind<>'funding'
        OR e.organization_id<>r.organization_id OR e.account_id<>r.account_id
        OR e.currency<>r.currency OR e.amount_nanos<>r.amount_nanos)
);
$$;

CREATE FUNCTION validate_customer_credit_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source customer_balance_consumption_allocations%ROWTYPE;
    original customer_credit_sources%ROWTYPE;
    pool NUMERIC; owed NUMERIC; paid NUMERIC; repayment NUMERIC;
    refunded_cash NUMERIC; refunded_credit NUMERIC;
    expected_cash BIGINT; expected_credit BIGINT; expected_coverage TEXT:='legacy_unknown';
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id
        AND organization_id=NEW.organization_id AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT a.* INTO STRICT source FROM customer_balance_consumption_allocations a
        JOIN customer_balance_entries e ON e.id=a.entry_id
        WHERE a.entry_id=NEW.entry_id AND a.organization_id=NEW.organization_id
          AND a.account_id=NEW.account_id AND a.currency=NEW.currency AND a.kind=NEW.kind
          AND a.nominal_nanos=NEW.nominal_nanos AND e.kind=NEW.kind
          AND e.amount_nanos::numeric=CASE WHEN NEW.kind='charge' THEN -NEW.nominal_nanos::numeric ELSE NEW.nominal_nanos::numeric END
          AND e.reverses_entry_id IS NOT DISTINCT FROM NEW.source_charge_entry_id;
    IF source.nongift_nanos IS DISTINCT FROM NEW.nongift_nanos
        OR (NEW.source_coverage='known' AND source.source_coverage<>'known') THEN
        RAISE EXCEPTION 'Credit source must match exact consumption provenance' USING ERRCODE='23514';
    END IF;
    IF NEW.kind='refund' AND NOT EXISTS(SELECT 1 FROM customer_balance_entries e
        WHERE e.id=NEW.source_charge_entry_id AND e.organization_id=NEW.organization_id
          AND e.account_id=NEW.account_id AND e.currency=NEW.currency AND e.kind='charge') THEN
        RAISE EXCEPTION 'Credit refund must reference its original scoped charge' USING ERRCODE='23514';
    END IF;
    -- Check the deterministic split independently at the table boundary. A
    -- caller cannot forge covered cash/credit proportions with a direct insert.
    IF source.source_coverage='known' AND niu_customer_credit_account_covered(NEW.account_id,NEW.entry_id) THEN
        IF NEW.kind='charge' THEN
            SELECT COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_funding_receipts r
                        WHERE r.account_id=NEW.account_id),0)
                -COALESCE((SELECT sum(s.cash_nanos::numeric) FROM customer_credit_sources s
                        WHERE s.account_id=NEW.account_id AND s.kind='charge'),0)
                +COALESCE((SELECT sum(s.cash_nanos::numeric) FROM customer_credit_sources s
                        WHERE s.account_id=NEW.account_id AND s.kind='refund'),0)
                -COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_credit_repayments r
                        WHERE r.account_id=NEW.account_id),0) INTO pool;
            IF pool<0 THEN RAISE EXCEPTION 'Verified prepaid cash pool is inconsistent' USING ERRCODE='23514'; END IF;
            expected_cash:=LEAST(pool,source.nongift_nanos::numeric)::bigint;
            expected_credit:=source.nongift_nanos-expected_cash; expected_coverage:='known';
        ELSE
            SELECT * INTO original FROM customer_credit_sources WHERE entry_id=NEW.source_charge_entry_id;
            IF FOUND AND original.source_coverage='known' THEN
                SELECT COALESCE(sum(s.cash_nanos::numeric),0),COALESCE(sum(s.credit_nanos::numeric),0)
                    INTO refunded_cash,refunded_credit FROM customer_credit_sources s
                    WHERE s.kind='refund' AND s.source_charge_entry_id=original.entry_id;
                SELECT COALESCE(sum(r.amount_nanos::numeric),0) INTO repayment
                    FROM customer_credit_repayments r WHERE r.charge_entry_id=original.entry_id;
                owed:=original.credit_nanos::numeric-refunded_credit-repayment;
                paid:=original.cash_nanos::numeric+repayment-refunded_cash;
                IF owed<0 OR paid<0 OR source.nongift_nanos::numeric>owed+paid THEN
                    RAISE EXCEPTION 'Credit refund exceeds original unpaid or paid sources' USING ERRCODE='23514';
                END IF;
                expected_credit:=LEAST(owed,source.nongift_nanos::numeric)::bigint;
                expected_cash:=source.nongift_nanos-expected_credit; expected_coverage:='known';
            END IF;
        END IF;
    END IF;
    IF NEW.source_coverage<>expected_coverage OR NEW.cash_nanos IS DISTINCT FROM expected_cash
        OR NEW.credit_nanos IS DISTINCT FROM expected_credit THEN
        RAISE EXCEPTION 'Credit source differs from the deterministic available cash or refund split' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_credit_source BEFORE INSERT ON customer_credit_sources
    FOR EACH ROW EXECUTE FUNCTION validate_customer_credit_source();
CREATE TRIGGER immutable_customer_credit_source BEFORE UPDATE OR DELETE ON customer_credit_sources
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION validate_customer_credit_repayment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE receipt_amount NUMERIC; capacity NUMERIC; committed NUMERIC; available_cash NUMERIC;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id
        AND organization_id=NEW.organization_id AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT r.amount_nanos::numeric INTO STRICT receipt_amount FROM customer_funding_receipts r
        JOIN customer_balance_entries e ON e.id=r.entry_id
        WHERE r.entry_id=NEW.funding_entry_id AND r.organization_id=NEW.organization_id
          AND r.account_id=NEW.account_id AND r.currency=NEW.currency AND e.kind='funding'
          AND e.amount_nanos=r.amount_nanos;
    SELECT COALESCE(sum(amount_nanos::numeric),0) INTO committed FROM customer_credit_repayments
        WHERE funding_entry_id=NEW.funding_entry_id;
    SELECT COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_funding_receipts r
                WHERE r.account_id=NEW.account_id),0)
        -COALESCE((SELECT sum(s.cash_nanos::numeric) FROM customer_credit_sources s
                WHERE s.account_id=NEW.account_id AND s.kind='charge'),0)
        +COALESCE((SELECT sum(s.cash_nanos::numeric) FROM customer_credit_sources s
                WHERE s.account_id=NEW.account_id AND s.kind='refund'),0)
        -COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_credit_repayments r
                WHERE r.account_id=NEW.account_id),0) INTO available_cash;
    SELECT s.credit_nanos::numeric
        -COALESCE((SELECT sum(r.credit_nanos::numeric) FROM customer_credit_sources r
            WHERE r.kind='refund' AND r.source_charge_entry_id=s.entry_id),0)
        -COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_credit_repayments r
            WHERE r.charge_entry_id=s.entry_id),0)
        INTO STRICT capacity FROM customer_credit_sources s
        WHERE s.entry_id=NEW.charge_entry_id AND s.organization_id=NEW.organization_id
          AND s.account_id=NEW.account_id AND s.currency=NEW.currency
          AND s.kind='charge' AND s.source_coverage='known';
    IF NOT niu_customer_credit_account_covered(NEW.account_id)
        OR committed+NEW.amount_nanos>receipt_amount OR capacity<NEW.amount_nanos
        OR available_cash<NEW.amount_nanos THEN
        RAISE EXCEPTION 'Credit repayment requires exact available cash and unpaid credit' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_credit_repayment BEFORE INSERT ON customer_credit_repayments
    FOR EACH ROW EXECUTE FUNCTION validate_customer_credit_repayment();
CREATE TRIGGER immutable_customer_credit_repayment BEFORE UPDATE OR DELETE ON customer_credit_repayments
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION allocate_customer_credit_sources() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocation customer_balance_consumption_allocations%ROWTYPE;
    original customer_credit_sources%ROWTYPE; pool NUMERIC; owed NUMERIC; paid NUMERIC;
    refunded_cash NUMERIC; refunded_credit NUMERIC; repayment NUMERIC;
    cash BIGINT; credit BIGINT; coverage TEXT:='legacy_unknown';
BEGIN
    IF NEW.kind NOT IN ('charge','refund') THEN RETURN NEW; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id
        AND organization_id=NEW.organization_id AND currency=NEW.currency FOR NO KEY UPDATE;
    -- Trigger name sorts after allocate_customer_balance_consumption, so gift
    -- consumption has already been recorded in this same transaction.
    SELECT * INTO STRICT allocation FROM customer_balance_consumption_allocations WHERE entry_id=NEW.id;
    IF allocation.source_coverage='known' AND niu_customer_credit_account_covered(NEW.account_id,NEW.id) THEN
        IF NEW.kind='charge' THEN
            SELECT COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_funding_receipts r
                        WHERE r.account_id=NEW.account_id),0)
                -COALESCE((SELECT sum(s.cash_nanos::numeric) FROM customer_credit_sources s
                        WHERE s.account_id=NEW.account_id AND s.kind='charge'),0)
                +COALESCE((SELECT sum(s.cash_nanos::numeric) FROM customer_credit_sources s
                        WHERE s.account_id=NEW.account_id AND s.kind='refund'),0)
                -COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_credit_repayments r
                        WHERE r.account_id=NEW.account_id),0) INTO pool;
            IF pool<0 THEN RAISE EXCEPTION 'Verified prepaid cash pool is inconsistent' USING ERRCODE='23514'; END IF;
            cash:=LEAST(pool,allocation.nongift_nanos::numeric)::bigint;
            credit:=allocation.nongift_nanos-cash; coverage:='known';
        ELSE
            SELECT * INTO original FROM customer_credit_sources WHERE entry_id=NEW.reverses_entry_id;
            IF FOUND AND original.source_coverage='known' THEN
                SELECT COALESCE(sum(s.cash_nanos::numeric),0),COALESCE(sum(s.credit_nanos::numeric),0)
                    INTO refunded_cash,refunded_credit FROM customer_credit_sources s
                    WHERE s.kind='refund' AND s.source_charge_entry_id=original.entry_id;
                SELECT COALESCE(sum(r.amount_nanos::numeric),0) INTO repayment
                    FROM customer_credit_repayments r WHERE r.charge_entry_id=original.entry_id;
                owed:=original.credit_nanos::numeric-refunded_credit-repayment;
                paid:=original.cash_nanos::numeric+repayment-refunded_cash;
                IF owed<0 OR paid<0 OR allocation.nongift_nanos::numeric>owed+paid THEN
                    RAISE EXCEPTION 'Credit refund exceeds its remaining original sources' USING ERRCODE='23514';
                END IF;
                credit:=LEAST(owed,allocation.nongift_nanos::numeric)::bigint;
                cash:=allocation.nongift_nanos-credit; coverage:='known';
            END IF;
        END IF;
    END IF;
    INSERT INTO customer_credit_sources(entry_id,organization_id,account_id,currency,kind,nominal_nanos,
        nongift_nanos,cash_nanos,credit_nanos,source_coverage,source_charge_entry_id)
    VALUES(NEW.id,NEW.organization_id,NEW.account_id,NEW.currency,NEW.kind,allocation.nominal_nanos,
        allocation.nongift_nanos,cash,credit,coverage,NEW.reverses_entry_id);
    RETURN NEW;
END;
$$;
CREATE TRIGGER allocate_customer_credit_sources AFTER INSERT ON customer_balance_entries
    FOR EACH ROW EXECUTE FUNCTION allocate_customer_credit_sources();

CREATE FUNCTION allocate_customer_credit_repayments() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE remaining BIGINT; target RECORD; amount BIGINT;
BEGIN
    -- Funding entries precede their verified receipt. Do not allocate at the
    -- balance-entry insert or manufacture a receipt merely to classify cash.
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id
        AND organization_id=NEW.organization_id AND currency=NEW.currency FOR NO KEY UPDATE;
    IF NOT EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.id=NEW.entry_id
        AND e.organization_id=NEW.organization_id AND e.account_id=NEW.account_id
        AND e.currency=NEW.currency AND e.kind='funding' AND e.amount_nanos=NEW.amount_nanos) THEN
        RAISE EXCEPTION 'Verified cash receipt must match its positive scoped funding entry' USING ERRCODE='23514';
    END IF;
    IF NOT niu_customer_credit_account_covered(NEW.account_id) THEN RETURN NEW; END IF;
    remaining:=NEW.amount_nanos;
    FOR target IN
        SELECT s.entry_id,s.credit_nanos::numeric
            -COALESCE((SELECT sum(r.credit_nanos::numeric) FROM customer_credit_sources r
                WHERE r.kind='refund' AND r.source_charge_entry_id=s.entry_id),0)
            -COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_credit_repayments r
                WHERE r.charge_entry_id=s.entry_id),0) AS owed
        FROM customer_credit_sources s JOIN customer_balance_entries e ON e.id=s.entry_id
        WHERE s.account_id=NEW.account_id AND s.kind='charge' AND s.source_coverage='known'
        ORDER BY e.created_at,e.id
    LOOP
        IF target.owed<0 THEN RAISE EXCEPTION 'Outstanding customer credit is inconsistent' USING ERRCODE='23514'; END IF;
        amount:=LEAST(remaining::numeric,target.owed)::bigint;
        IF amount>0 THEN
            INSERT INTO customer_credit_repayments(id,organization_id,account_id,currency,funding_entry_id,charge_entry_id,amount_nanos)
            VALUES(gen_random_uuid(),NEW.organization_id,NEW.account_id,NEW.currency,NEW.entry_id,target.entry_id,amount);
            remaining:=remaining-amount;
        END IF;
        EXIT WHEN remaining=0;
    END LOOP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER allocate_customer_credit_repayments AFTER INSERT ON customer_funding_receipts
    FOR EACH ROW EXECUTE FUNCTION allocate_customer_credit_repayments();

-- @niu-legacy-migration 0320_customer_grant_credit_applications.sql 26106
-- Explicit policies and late sales allowances. No existing gift/debit is
-- rewritten or backfilled; absent legacy policy remains future_only.
CREATE TABLE customer_grant_policies (
    grant_id UUID PRIMARY KEY REFERENCES customer_balance_grants(id),
    policy TEXT NOT NULL CHECK (policy IN ('future_only','unpaid_credit_first')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE customer_grant_credit_applications (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    grant_id UUID NOT NULL REFERENCES customer_balance_grants(id),
    charge_entry_id UUID NOT NULL,
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(grant_id,charge_entry_id),
    UNIQUE(organization_id,account_id,currency,id),
    FOREIGN KEY(organization_id,account_id,currency,charge_entry_id)
        REFERENCES customer_credit_sources(organization_id,account_id,currency,entry_id)
);
CREATE INDEX customer_grant_credit_applications_account ON customer_grant_credit_applications(account_id,created_at,id);
CREATE INDEX customer_grant_credit_applications_charge ON customer_grant_credit_applications(charge_entry_id);
CREATE TABLE customer_grant_credit_refund_restorations (
    refund_entry_id UUID NOT NULL,
    application_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(refund_entry_id,application_id),
    FOREIGN KEY(organization_id,account_id,currency,refund_entry_id)
        REFERENCES customer_balance_entries(organization_id,account_id,currency,id),
    FOREIGN KEY(organization_id,account_id,currency,application_id)
        REFERENCES customer_grant_credit_applications(organization_id,account_id,currency,id)
);
CREATE INDEX customer_grant_credit_refund_application ON customer_grant_credit_refund_restorations(application_id);
CREATE TRIGGER immutable_customer_grant_policy BEFORE UPDATE OR DELETE ON customer_grant_policies
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_grant_credit_application BEFORE UPDATE OR DELETE ON customer_grant_credit_applications
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_grant_credit_restoration BEFORE UPDATE OR DELETE ON customer_grant_credit_refund_restorations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- Restorations are already in refund explicit_gift_nanos: never add them again.
CREATE FUNCTION niu_customer_explicit_gift_pool(account UUID) RETURNS NUMERIC
LANGUAGE SQL VOLATILE AS $$
SELECT COALESCE((SELECT sum(g.amount_nanos::numeric) FROM customer_balance_grants g WHERE g.account_id=account),0)
    -COALESCE((SELECT sum(CASE WHEN a.kind='charge' THEN a.explicit_gift_nanos::numeric ELSE -a.explicit_gift_nanos::numeric END)
        FROM customer_balance_consumption_allocations a WHERE a.account_id=account),0)
    -COALESCE((SELECT sum(a.amount_nanos::numeric) FROM customer_grant_credit_applications a WHERE a.account_id=account),0);
$$;
CREATE FUNCTION niu_customer_unpaid_credit(charge UUID) RETURNS NUMERIC
LANGUAGE SQL VOLATILE AS $$
SELECT s.credit_nanos::numeric
    -COALESCE((SELECT sum(r.credit_nanos::numeric) FROM customer_credit_sources r
        WHERE r.kind='refund' AND r.source_charge_entry_id=s.entry_id),0)
    -COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_credit_repayments r WHERE r.charge_entry_id=s.entry_id),0)
    -COALESCE((SELECT sum(a.amount_nanos::numeric) FROM customer_grant_credit_applications a WHERE a.charge_entry_id=s.entry_id),0)
FROM customer_credit_sources s WHERE s.entry_id=charge AND s.kind='charge' AND s.source_coverage='known';
$$;
CREATE FUNCTION niu_customer_verified_prepaid_cash(account UUID) RETURNS NUMERIC
LANGUAGE SQL VOLATILE AS $$
SELECT COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_funding_receipts r WHERE r.account_id=account),0)
    -COALESCE((SELECT sum(s.cash_nanos::numeric) FROM customer_credit_sources s WHERE s.account_id=account AND s.kind='charge'),0)
    +COALESCE((SELECT sum(s.cash_nanos::numeric) FROM customer_credit_sources s WHERE s.account_id=account AND s.kind='refund'),0)
    -COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_credit_repayments r WHERE r.account_id=account),0);
$$;

CREATE FUNCTION validate_customer_grant_policy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal customer_balance_grants%ROWTYPE; same_transaction BOOLEAN;
BEGIN
    SELECT * INTO journal FROM customer_balance_grants WHERE id=NEW.grant_id;
    SELECT g.xmin::text=mod(pg_current_xact_id()::text::numeric,4294967296)::text
        INTO same_transaction FROM customer_balance_grants g WHERE g.id=NEW.grant_id;
    IF journal.id IS NULL OR same_transaction IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'Grant policy must be published with a fresh grant journal' USING ERRCODE='23514';
    END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=journal.account_id FOR NO KEY UPDATE;
    IF NEW.policy='unpaid_credit_first' AND NOT niu_customer_credit_account_covered(journal.account_id) THEN
        RAISE EXCEPTION 'Debt-first grant requires complete cash and credit provenance' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_grant_policy BEFORE INSERT ON customer_grant_policies
    FOR EACH ROW EXECUTE FUNCTION validate_customer_grant_policy();
CREATE FUNCTION validate_customer_grant_credit_application() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE grant_amount NUMERIC; used NUMERIC; owed NUMERIC; pool NUMERIC;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT g.amount_nanos::numeric INTO STRICT grant_amount FROM customer_balance_grants g
        JOIN customer_grant_policies p ON p.grant_id=g.id AND p.policy='unpaid_credit_first'
        WHERE g.id=NEW.grant_id AND g.organization_id=NEW.organization_id AND g.account_id=NEW.account_id AND g.currency=NEW.currency;
    IF NOT EXISTS(SELECT 1 FROM customer_credit_sources s WHERE s.entry_id=NEW.charge_entry_id
        AND s.organization_id=NEW.organization_id AND s.account_id=NEW.account_id AND s.currency=NEW.currency
        AND s.kind='charge' AND s.source_coverage='known') THEN
        RAISE EXCEPTION 'Grant application requires exact known customer credit' USING ERRCODE='23514';
    END IF;
    SELECT COALESCE(sum(amount_nanos::numeric),0) INTO used FROM customer_grant_credit_applications WHERE grant_id=NEW.grant_id;
    owed:=niu_customer_unpaid_credit(NEW.charge_entry_id); pool:=niu_customer_explicit_gift_pool(NEW.account_id);
    IF NOT niu_customer_credit_account_covered(NEW.account_id) OR used+NEW.amount_nanos>grant_amount
        OR owed IS NULL OR owed<NEW.amount_nanos OR pool<NEW.amount_nanos THEN
        RAISE EXCEPTION 'Grant application exceeds available gift or exact unpaid credit' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_grant_credit_application BEFORE INSERT ON customer_grant_credit_applications
    FOR EACH ROW EXECUTE FUNCTION validate_customer_grant_credit_application();
CREATE FUNCTION apply_customer_grant_credit_policy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal customer_balance_grants%ROWTYPE; target RECORD; remaining BIGINT; amount BIGINT;
BEGIN
    IF NEW.policy='future_only' THEN RETURN NEW; END IF;
    SELECT * INTO STRICT journal FROM customer_balance_grants WHERE id=NEW.grant_id;
    PERFORM id FROM customer_balance_accounts WHERE id=journal.account_id FOR NO KEY UPDATE;
    remaining:=journal.amount_nanos;
    FOR target IN SELECT s.entry_id,niu_customer_unpaid_credit(s.entry_id) AS owed
        FROM customer_credit_sources s JOIN customer_balance_entries e ON e.id=s.entry_id
        WHERE s.account_id=journal.account_id AND s.kind='charge' AND s.source_coverage='known'
        ORDER BY e.created_at,e.id
    LOOP
        IF target.owed IS NULL OR target.owed<0 THEN RAISE EXCEPTION 'Unpaid credit is inconsistent' USING ERRCODE='23514'; END IF;
        amount:=LEAST(remaining::numeric,target.owed)::bigint;
        IF amount>0 THEN
            INSERT INTO customer_grant_credit_applications(id,organization_id,account_id,currency,grant_id,charge_entry_id,amount_nanos)
            VALUES(gen_random_uuid(),journal.organization_id,journal.account_id,journal.currency,journal.id,target.entry_id,amount);
            remaining:=remaining-amount;
        END IF;
        EXIT WHEN remaining=0;
    END LOOP;
    RETURN NEW;
END;
$$;
CREATE TRIGGER apply_customer_grant_credit_policy AFTER INSERT ON customer_grant_policies
    FOR EACH ROW EXECUTE FUNCTION apply_customer_grant_credit_policy();

-- Refund restoration is a subset of the refund's gift component, never a new
-- balance credit or a reversal that recreates an already forgiven receivable.
CREATE FUNCTION niu_customer_late_refund_quantity(refund UUID) RETURNS NUMERIC
LANGUAGE SQL VOLATILE AS $$
SELECT GREATEST(0,a.explicit_gift_nanos::numeric-GREATEST(0,original.explicit_gift_nanos::numeric
    -COALESCE((SELECT sum(previous.explicit_gift_nanos::numeric)
        FROM customer_balance_consumption_allocations previous
        WHERE previous.kind='refund' AND previous.source_charge_entry_id=original.entry_id AND previous.entry_id<>a.entry_id),0)
    +COALESCE((SELECT sum(r.amount_nanos::numeric) FROM customer_grant_credit_refund_restorations r
        JOIN customer_balance_entries e ON e.id=r.refund_entry_id
        WHERE e.reverses_entry_id=original.entry_id AND r.refund_entry_id<>a.entry_id),0)))
FROM customer_balance_consumption_allocations a
JOIN customer_balance_consumption_allocations original ON original.entry_id=a.source_charge_entry_id
WHERE a.entry_id=refund AND a.kind='refund';
$$;
CREATE FUNCTION validate_customer_grant_credit_restoration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE available NUMERIC; needed NUMERIC; recorded NUMERIC; original UUID;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT e.reverses_entry_id INTO STRICT original FROM customer_balance_entries e
        WHERE e.id=NEW.refund_entry_id AND e.organization_id=NEW.organization_id AND e.account_id=NEW.account_id
          AND e.currency=NEW.currency AND e.kind='refund';
    SELECT a.amount_nanos::numeric-COALESCE((SELECT sum(r.amount_nanos::numeric)
        FROM customer_grant_credit_refund_restorations r WHERE r.application_id=a.id),0)
        INTO STRICT available FROM customer_grant_credit_applications a
        WHERE a.id=NEW.application_id AND a.organization_id=NEW.organization_id AND a.account_id=NEW.account_id
          AND a.currency=NEW.currency AND a.charge_entry_id=original;
    SELECT COALESCE(sum(amount_nanos::numeric),0) INTO recorded FROM customer_grant_credit_refund_restorations
        WHERE refund_entry_id=NEW.refund_entry_id;
    needed:=niu_customer_late_refund_quantity(NEW.refund_entry_id);
    IF needed IS NULL OR available<NEW.amount_nanos OR recorded+NEW.amount_nanos>needed THEN
        RAISE EXCEPTION 'Late gift restoration exceeds its exact application or refund' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_grant_credit_restoration BEFORE INSERT ON customer_grant_credit_refund_restorations
    FOR EACH ROW EXECUTE FUNCTION validate_customer_grant_credit_restoration();
CREATE FUNCTION check_customer_grant_credit_restoration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected NUMERIC; actual NUMERIC;
BEGIN
    IF NEW.kind<>'refund' THEN RETURN NEW; END IF;
    expected:=COALESCE(niu_customer_late_refund_quantity(NEW.entry_id),0);
    SELECT COALESCE(sum(amount_nanos::numeric),0) INTO actual FROM customer_grant_credit_refund_restorations
        WHERE refund_entry_id=NEW.entry_id;
    IF expected<>actual THEN
        RAISE EXCEPTION 'Late gift refund requires complete exact restoration provenance' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER check_customer_grant_credit_restoration
    AFTER INSERT ON customer_balance_consumption_allocations DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_customer_grant_credit_restoration();

CREATE OR REPLACE FUNCTION allocate_customer_balance_consumption() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE nominal BIGINT; explicit_gift BIGINT:=0; pool NUMERIC; refunded_nominal NUMERIC;
    original_amount NUMERIC; original customer_balance_consumption_allocations%ROWTYPE;
    previous_gift NUMERIC; previous_late NUMERIC; base_remaining NUMERIC; late_remaining NUMERIC;
    late_to_restore NUMERIC:=0; target RECORD; amount BIGINT; coverage TEXT:='known';
BEGIN
    IF NEW.kind NOT IN ('charge','refund') THEN RETURN NEW; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    nominal:=abs(NEW.amount_nanos::numeric)::bigint;
    IF NEW.kind='charge' THEN
        pool:=niu_customer_explicit_gift_pool(NEW.account_id);
        IF pool<0 THEN RAISE EXCEPTION 'Explicit gift pool is inconsistent' USING ERRCODE='23514'; END IF;
        explicit_gift:=LEAST(nominal::numeric,pool)::bigint;
        IF EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.account_id=NEW.account_id AND e.kind='adjustment'
            AND e.amount_nanos>0 AND NOT EXISTS(SELECT 1 FROM customer_balance_grants g WHERE g.entry_id=e.id)) THEN
            coverage:='legacy_unknown';
        END IF;
    ELSE
        SELECT -e.amount_nanos::numeric INTO original_amount FROM customer_balance_entries e
            WHERE e.id=NEW.reverses_entry_id AND e.organization_id=NEW.organization_id AND e.account_id=NEW.account_id
              AND e.currency=NEW.currency AND e.kind='charge';
        SELECT COALESCE(sum(e.amount_nanos::numeric),0) INTO refunded_nominal FROM customer_balance_entries e
            WHERE e.reverses_entry_id=NEW.reverses_entry_id AND e.id<>NEW.id;
        IF original_amount IS NULL OR refunded_nominal+nominal>original_amount THEN
            RAISE EXCEPTION 'Refund exceeds original scoped consumption' USING ERRCODE='23514';
        END IF;
        SELECT * INTO original FROM customer_balance_consumption_allocations WHERE entry_id=NEW.reverses_entry_id;
        IF NOT FOUND THEN coverage:='legacy_unknown';
        ELSE
            SELECT COALESCE(sum(a.explicit_gift_nanos::numeric),0) INTO previous_gift
                FROM customer_balance_consumption_allocations a WHERE a.kind='refund' AND a.source_charge_entry_id=original.entry_id;
            SELECT COALESCE(sum(r.amount_nanos::numeric),0) INTO previous_late
                FROM customer_grant_credit_refund_restorations r JOIN customer_balance_entries e ON e.id=r.refund_entry_id
                WHERE e.reverses_entry_id=original.entry_id;
            base_remaining:=original.explicit_gift_nanos::numeric-(previous_gift-previous_late);
            SELECT COALESCE(sum(a.amount_nanos::numeric),0)-previous_late INTO late_remaining
                FROM customer_grant_credit_applications a WHERE a.charge_entry_id=original.entry_id;
            IF base_remaining<0 OR late_remaining<0 THEN
                RAISE EXCEPTION 'Refund gift sources exceed original consumption or applications' USING ERRCODE='23514';
            END IF;
            explicit_gift:=LEAST(nominal::numeric,base_remaining+late_remaining)::bigint;
            late_to_restore:=GREATEST(0,explicit_gift::numeric-base_remaining);
            coverage:=original.source_coverage;
        END IF;
    END IF;
    INSERT INTO customer_balance_consumption_allocations(entry_id,organization_id,account_id,currency,kind,nominal_nanos,
        explicit_gift_nanos,gift_nanos,nongift_nanos,source_coverage,source_charge_entry_id)
    VALUES(NEW.id,NEW.organization_id,NEW.account_id,NEW.currency,NEW.kind,nominal,explicit_gift,
        CASE WHEN coverage='known' THEN explicit_gift ELSE NULL END,
        CASE WHEN coverage='known' THEN nominal-explicit_gift ELSE NULL END,coverage,NEW.reverses_entry_id);
    IF late_to_restore>0 THEN
        FOR target IN SELECT a.id,a.amount_nanos::numeric-COALESCE((SELECT sum(r.amount_nanos::numeric)
            FROM customer_grant_credit_refund_restorations r WHERE r.application_id=a.id),0) AS available
            FROM customer_grant_credit_applications a WHERE a.charge_entry_id=NEW.reverses_entry_id ORDER BY a.created_at,a.id
        LOOP
            IF target.available<0 THEN RAISE EXCEPTION 'Late gift restoration is inconsistent' USING ERRCODE='23514'; END IF;
            amount:=LEAST(late_to_restore,target.available)::bigint;
            IF amount>0 THEN
                INSERT INTO customer_grant_credit_refund_restorations(refund_entry_id,application_id,organization_id,account_id,currency,amount_nanos)
                VALUES(NEW.id,target.id,NEW.organization_id,NEW.account_id,NEW.currency,amount);
                late_to_restore:=late_to_restore-amount;
            END IF;
            EXIT WHEN late_to_restore=0;
        END LOOP;
        IF late_to_restore<>0 THEN RAISE EXCEPTION 'Late gift refund could not restore its exact sources' USING ERRCODE='23514'; END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- One shared calculation powers both automatic allocation and direct-insert
-- validation. Original immutable cash/credit rows are never reclassified.
CREATE FUNCTION niu_customer_credit_source_split(entry UUID)
RETURNS TABLE(nongift_nanos BIGINT,cash_nanos BIGINT,credit_nanos BIGINT,source_coverage TEXT)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE allocation customer_balance_consumption_allocations%ROWTYPE; original customer_credit_sources%ROWTYPE;
    pool NUMERIC; owed NUMERIC; paid NUMERIC; repayment NUMERIC; refunded_cash NUMERIC;
BEGIN
    SELECT * INTO STRICT allocation FROM customer_balance_consumption_allocations WHERE entry_id=entry;
    PERFORM id FROM customer_balance_accounts WHERE id=allocation.account_id FOR NO KEY UPDATE;
    nongift_nanos:=allocation.nongift_nanos; cash_nanos:=NULL; credit_nanos:=NULL; source_coverage:='legacy_unknown';
    IF allocation.source_coverage='known' AND niu_customer_credit_account_covered(allocation.account_id,entry) THEN
        IF allocation.kind='charge' THEN
            pool:=niu_customer_verified_prepaid_cash(allocation.account_id);
            IF pool<0 THEN RAISE EXCEPTION 'Verified prepaid cash pool is inconsistent' USING ERRCODE='23514'; END IF;
            cash_nanos:=LEAST(pool,nongift_nanos::numeric)::bigint; credit_nanos:=nongift_nanos-cash_nanos; source_coverage:='known';
        ELSE
            SELECT * INTO original FROM customer_credit_sources WHERE entry_id=allocation.source_charge_entry_id;
            IF FOUND AND original.source_coverage='known' THEN
                owed:=niu_customer_unpaid_credit(original.entry_id);
                SELECT COALESCE(sum(r.cash_nanos::numeric),0) INTO refunded_cash FROM customer_credit_sources r
                    WHERE r.kind='refund' AND r.source_charge_entry_id=original.entry_id;
                SELECT COALESCE(sum(r.amount_nanos::numeric),0) INTO repayment FROM customer_credit_repayments r
                    WHERE r.charge_entry_id=original.entry_id;
                paid:=original.cash_nanos::numeric+repayment-refunded_cash;
                IF owed IS NULL OR owed<0 OR paid<0 OR nongift_nanos::numeric>owed+paid THEN
                    RAISE EXCEPTION 'Refund exceeds remaining credit or paid cash after gift allowance' USING ERRCODE='23514';
                END IF;
                credit_nanos:=LEAST(owed,nongift_nanos::numeric)::bigint; cash_nanos:=nongift_nanos-credit_nanos; source_coverage:='known';
            END IF;
        END IF;
    END IF;
    RETURN NEXT;
END;
$$;
CREATE OR REPLACE FUNCTION validate_customer_credit_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected RECORD;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    IF NOT EXISTS(SELECT 1 FROM customer_balance_consumption_allocations a JOIN customer_balance_entries e ON e.id=a.entry_id
        WHERE a.entry_id=NEW.entry_id AND a.organization_id=NEW.organization_id AND a.account_id=NEW.account_id
          AND a.currency=NEW.currency AND a.kind=NEW.kind AND a.nominal_nanos=NEW.nominal_nanos
          AND e.kind=NEW.kind AND e.amount_nanos::numeric=(CASE WHEN NEW.kind='charge' THEN -NEW.nominal_nanos::numeric ELSE NEW.nominal_nanos::numeric END)
          AND e.reverses_entry_id IS NOT DISTINCT FROM NEW.source_charge_entry_id) THEN
        RAISE EXCEPTION 'Credit source requires exact scoped consumption' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT expected FROM niu_customer_credit_source_split(NEW.entry_id);
    IF NEW.nongift_nanos IS DISTINCT FROM expected.nongift_nanos OR NEW.cash_nanos IS DISTINCT FROM expected.cash_nanos
        OR NEW.credit_nanos IS DISTINCT FROM expected.credit_nanos OR NEW.source_coverage<>expected.source_coverage THEN
        RAISE EXCEPTION 'Credit source differs from deterministic cash and unpaid-credit split' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION allocate_customer_credit_sources() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocation customer_balance_consumption_allocations%ROWTYPE; split RECORD;
BEGIN
    IF NEW.kind NOT IN ('charge','refund') THEN RETURN NEW; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT * INTO STRICT allocation FROM customer_balance_consumption_allocations WHERE entry_id=NEW.id;
    SELECT * INTO STRICT split FROM niu_customer_credit_source_split(NEW.id);
    INSERT INTO customer_credit_sources(entry_id,organization_id,account_id,currency,kind,nominal_nanos,
        nongift_nanos,cash_nanos,credit_nanos,source_coverage,source_charge_entry_id)
    VALUES(NEW.id,NEW.organization_id,NEW.account_id,NEW.currency,NEW.kind,allocation.nominal_nanos,
        split.nongift_nanos,split.cash_nanos,split.credit_nanos,split.source_coverage,NEW.reverses_entry_id);
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION validate_customer_credit_repayment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE receipt_amount NUMERIC; capacity NUMERIC; committed NUMERIC; available_cash NUMERIC;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT r.amount_nanos::numeric INTO STRICT receipt_amount FROM customer_funding_receipts r JOIN customer_balance_entries e ON e.id=r.entry_id
        WHERE r.entry_id=NEW.funding_entry_id AND r.organization_id=NEW.organization_id AND r.account_id=NEW.account_id
          AND r.currency=NEW.currency AND e.kind='funding' AND e.amount_nanos=r.amount_nanos;
    IF NOT EXISTS(SELECT 1 FROM customer_credit_sources s WHERE s.entry_id=NEW.charge_entry_id AND s.organization_id=NEW.organization_id
        AND s.account_id=NEW.account_id AND s.currency=NEW.currency AND s.kind='charge' AND s.source_coverage='known') THEN
        RAISE EXCEPTION 'Repayment requires exact known customer credit' USING ERRCODE='23514';
    END IF;
    SELECT COALESCE(sum(amount_nanos::numeric),0) INTO committed FROM customer_credit_repayments WHERE funding_entry_id=NEW.funding_entry_id;
    capacity:=niu_customer_unpaid_credit(NEW.charge_entry_id); available_cash:=niu_customer_verified_prepaid_cash(NEW.account_id);
    IF NOT niu_customer_credit_account_covered(NEW.account_id) OR capacity IS NULL
        OR committed+NEW.amount_nanos>receipt_amount OR capacity<NEW.amount_nanos OR available_cash<NEW.amount_nanos THEN
        RAISE EXCEPTION 'Repayment exceeds exact cash or unpaid credit after allowances' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION allocate_customer_credit_repayments() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE remaining BIGINT; target RECORD; amount BIGINT;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    IF NOT EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.id=NEW.entry_id AND e.organization_id=NEW.organization_id
        AND e.account_id=NEW.account_id AND e.currency=NEW.currency AND e.kind='funding' AND e.amount_nanos=NEW.amount_nanos) THEN
        RAISE EXCEPTION 'Verified receipt requires its exact positive funding entry' USING ERRCODE='23514';
    END IF;
    IF NOT niu_customer_credit_account_covered(NEW.account_id) THEN RETURN NEW; END IF;
    remaining:=NEW.amount_nanos;
    FOR target IN SELECT s.entry_id,niu_customer_unpaid_credit(s.entry_id) AS owed
        FROM customer_credit_sources s JOIN customer_balance_entries e ON e.id=s.entry_id
        WHERE s.account_id=NEW.account_id AND s.kind='charge' AND s.source_coverage='known' ORDER BY e.created_at,e.id
    LOOP
        IF target.owed IS NULL OR target.owed<0 THEN RAISE EXCEPTION 'Outstanding credit is inconsistent' USING ERRCODE='23514'; END IF;
        amount:=LEAST(remaining::numeric,target.owed)::bigint;
        IF amount>0 THEN
            INSERT INTO customer_credit_repayments(id,organization_id,account_id,currency,funding_entry_id,charge_entry_id,amount_nanos)
            VALUES(gen_random_uuid(),NEW.organization_id,NEW.account_id,NEW.currency,NEW.entry_id,target.entry_id,amount);
            remaining:=remaining-amount;
        END IF;
        EXIT WHEN remaining=0;
    END LOOP;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0321_customer_credit_policy_audit.sql 1613
-- Authenticated credit approvals only; no attribution of historical revisions.
CREATE TABLE customer_credit_policy_events (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL,
    revision BIGINT NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(account_id,revision),
    FOREIGN KEY(account_id,revision) REFERENCES customer_balance_policy_revisions(account_id,revision),
    CHECK ((actor_kind='installation' AND actor_operator_id IS NULL)
        OR (actor_kind='operator' AND actor_operator_id IS NOT NULL))
);
CREATE FUNCTION validate_customer_credit_policy_event() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM customer_balance_policy_revisions p
        WHERE p.account_id=NEW.account_id AND p.revision=NEW.revision
          AND p.xmin::text=mod(pg_current_xact_id()::text::numeric,4294967296)::text) THEN
        RAISE EXCEPTION 'credit actor requires a new policy in the same transaction' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_credit_policy_event BEFORE INSERT ON customer_credit_policy_events
    FOR EACH ROW EXECUTE FUNCTION validate_customer_credit_policy_event();
CREATE TRIGGER immutable_customer_credit_policy_event BEFORE UPDATE OR DELETE ON customer_credit_policy_events
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE INDEX customer_credit_policy_events_audit ON customer_credit_policy_events(created_at DESC,id DESC);

-- @niu-legacy-migration 0322_prepared_customer_balance_grants.sql 2738
-- Durable administrator intent only: preparation never creates balance capacity.
CREATE TABLE prepared_customer_balance_grants (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos>0),
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500 AND reason=trim(reason) AND reason !~ '[[:cntrl:]]'),
    idempotency_key UUID NOT NULL,
    application_policy TEXT NOT NULL CHECK (application_policy IN ('future_only','unpaid_credit_first')),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id,idempotency_key),
    CHECK ((actor_kind='installation' AND actor_operator_id IS NULL)
        OR (actor_kind='operator' AND actor_operator_id IS NOT NULL))
);
CREATE TRIGGER immutable_prepared_customer_balance_grant BEFORE UPDATE OR DELETE ON prepared_customer_balance_grants
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE INDEX prepared_customer_balance_grants_history ON prepared_customer_balance_grants(organization_id,currency,created_at DESC,id DESC);
CREATE FUNCTION validate_prepared_customer_balance_grant_match() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM prepared_customer_balance_grants intent
        JOIN customer_balance_grants grant_row ON grant_row.organization_id=intent.organization_id AND grant_row.idempotency_key=intent.idempotency_key
        LEFT JOIN customer_grant_policies policy ON policy.grant_id=grant_row.id
        WHERE intent.organization_id=NEW.organization_id AND intent.idempotency_key=NEW.idempotency_key
          AND (intent.currency<>grant_row.currency OR intent.amount_nanos<>grant_row.amount_nanos OR intent.reason<>grant_row.reason
            OR intent.application_policy<>COALESCE(policy.policy,'future_only'))) THEN
        RAISE EXCEPTION 'grant publication differs from durable intent' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER validate_prepared_customer_balance_grant_match AFTER INSERT ON prepared_customer_balance_grants
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_prepared_customer_balance_grant_match();
CREATE CONSTRAINT TRIGGER validate_customer_balance_grant_preparation AFTER INSERT ON customer_balance_grants
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_prepared_customer_balance_grant_match();

CREATE INDEX prepared_customer_balance_grants_audit ON prepared_customer_balance_grants(created_at DESC,id DESC);

-- @niu-legacy-migration 0323_legacy_default_brand_name.sql 602
-- Adopt the current Niu default for deployments that persisted a retired default.
-- Preserve customized names, uploaded assets, theme overrides and immutable history.
WITH updated AS (
    UPDATE branding_configuration
    SET settings = jsonb_set(settings, '{display_name}', '"Niu"'::jsonb),
        revision = revision + 1,
        updated_at = clock_timestamp()
    WHERE singleton AND settings->>'display_name' IN ('NIU.IO', 'niu.io')
    RETURNING revision, settings
)
INSERT INTO branding_configuration_events (revision, settings, actor_kind)
SELECT revision, settings, 'unknown' FROM updated;

-- @niu-legacy-migration 0324_vendor_request_rate_unlimited_fast_path.sql 2591
-- Avoid exclusive row locks and admission-table WAL churn when a credential has
-- no request-per-minute limit configured. Concurrent unlimited dispatches take
-- only a shared lock on vendor_request_rate_limits (which still serializes with
-- policy edits), while set_vendor_request_rate_policy backfills the rolling
-- 60-second window from dispatched attempts when enabling a limit.
CREATE OR REPLACE FUNCTION niu_enforce_vendor_request_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    credential UUID;
    credentials UUID[];
    rpm BIGINT;
    checked_at TIMESTAMPTZ;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN
        RETURN NEW;
    END IF;
    -- The immutable attempt bindings identify the actual credential, never the current alias.
    SELECT array_agg(vendor_id) INTO credentials FROM (
        SELECT vendor_id FROM managed_attempt_routes WHERE attempt_id=NEW.id
        UNION SELECT vendor_id FROM personal_attempt_routes WHERE attempt_id=NEW.id
        UNION SELECT vendor_id FROM media_recovery_routes WHERE attempt_id=NEW.id
    ) bound;
    IF cardinality(credentials) > 1 THEN
        RAISE EXCEPTION 'Conflicting credential bindings' USING ERRCODE='P0024';
    END IF;
    credential := credentials[1];
    IF credential IS NULL THEN RETURN NEW; END IF;
    PERFORM 1 FROM vendor_request_rate_limits
        WHERE vendor_id=credential AND requests_per_minute IS NULL FOR SHARE;
    IF FOUND THEN
        RETURN NEW;
    END IF;
    -- Serialize policy edits and admissions without upgrading vendor SHARE locks.
    SELECT requests_per_minute INTO rpm FROM vendor_request_rate_limits
        WHERE vendor_id=credential FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credential rate policy missing' USING ERRCODE='P0024'; END IF;
    IF rpm IS NULL THEN
        RETURN NEW;
    END IF;
    IF rpm = 0 THEN
        RAISE EXCEPTION 'Upstream credential request rate is disabled' USING ERRCODE='P0027';
    END IF;
    checked_at := clock_timestamp();
    DELETE FROM vendor_request_rate_admissions WHERE vendor_id=credential
        AND admitted_at <= checked_at - INTERVAL '60 seconds';
    IF (SELECT count(*) FROM vendor_request_rate_admissions
        WHERE vendor_id=credential AND admitted_at > checked_at - INTERVAL '60 seconds') >= rpm THEN
        RAISE EXCEPTION 'Upstream credential request rate exhausted' USING ERRCODE='P0025';
    END IF;
    INSERT INTO vendor_request_rate_admissions(attempt_id,vendor_id,admitted_at)
        VALUES(NEW.id,credential,checked_at);
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0325_deduplicate_customer_ledger_and_reservation_checks.sql 8853
-- Avoid duplicate full-history ledger scans during customer balance reservation
-- and credit source allocation while preserving exact trigger invariants.

CREATE INDEX IF NOT EXISTS customer_balance_entries_account_kind_amount_idx
    ON customer_balance_entries (account_id, kind)
    INCLUDE (amount_nanos, id);

CREATE INDEX IF NOT EXISTS customer_credit_sources_account_kind_cash_idx
    ON customer_credit_sources (account_id, kind)
    INCLUDE (cash_nanos, source_coverage, entry_id);

CREATE INDEX IF NOT EXISTS attempts_api_key_spending_lookup_idx
    ON attempts (api_key_id, id)
    WHERE api_key_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS inspected_guardrail_bindings_key_lookup_idx
    ON inspected_guardrail_bindings (key_id, attempt_id);

CREATE OR REPLACE FUNCTION niu_customer_key_committed(p_root UUID, p_account UUID)
RETURNS NUMERIC LANGUAGE sql VOLATILE AS $$
    WITH root_keys AS (
        SELECT organization_id, project_id, id
        FROM api_keys
        WHERE spending_root_id = p_root
    )
    SELECT COALESCE((
        SELECT -SUM(e.amount_nanos)
        FROM customer_balance_entries e
        JOIN attempts a ON a.id = e.attempt_id
        LEFT JOIN inspected_guardrail_bindings b ON b.attempt_id = a.id
        JOIN root_keys k
          ON k.id = COALESCE(a.api_key_id, b.key_id)
         AND k.organization_id = a.organization_id
         AND k.project_id = a.project_id
        WHERE e.account_id = p_account
          AND e.kind = 'charge'
    ), 0)
    - COALESCE((
        SELECT SUM(r.amount_nanos)
        FROM customer_balance_entries r
        JOIN customer_balance_entries c ON c.id = r.reverses_entry_id
        JOIN attempts a ON a.id = c.attempt_id
        LEFT JOIN inspected_guardrail_bindings b ON b.attempt_id = a.id
        JOIN root_keys k
          ON k.id = COALESCE(a.api_key_id, b.key_id)
         AND k.organization_id = a.organization_id
         AND k.project_id = a.project_id
        WHERE r.account_id = p_account
          AND r.kind = 'refund'
          AND c.kind = 'charge'
    ), 0)
    + COALESCE((
        SELECT SUM(GREATEST(r.amount_nanos, COALESCE(m.amount_nanos, 0)))
        FROM customer_balance_reservations r
        LEFT JOIN customer_media_charges m ON m.attempt_id = r.attempt_id
        JOIN attempts a ON a.id = r.attempt_id
        LEFT JOIN inspected_guardrail_bindings b ON b.attempt_id = a.id
        JOIN root_keys k
          ON k.id = COALESCE(a.api_key_id, b.key_id)
         AND k.organization_id = a.organization_id
         AND k.project_id = a.project_id
        WHERE r.account_id = p_account
          AND r.released_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM customer_balance_entries e
              WHERE e.attempt_id = r.attempt_id AND e.kind = 'charge'
          )
    ), 0)
$$;

CREATE OR REPLACE FUNCTION enforce_customer_key_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root UUID; maximum BIGINT; workspace UUID; workspace_maximum BIGINT;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR NO KEY UPDATE;
    SELECT project_id INTO workspace FROM customer_attempt_balance_accounts
        WHERE attempt_id=NEW.attempt_id AND organization_id=NEW.organization_id
          AND account_id=NEW.account_id AND currency=NEW.currency;
    SELECT limit_nanos INTO workspace_maximum FROM customer_workspace_spending_limits
        WHERE organization_id=NEW.organization_id AND project_id=workspace
          AND account_id=NEW.account_id AND currency=NEW.currency;
    IF workspace_maximum IS NOT NULL AND
        niu_customer_workspace_committed(NEW.organization_id,workspace,NEW.account_id)+NEW.amount_nanos>workspace_maximum THEN
        RAISE EXCEPTION 'customer workspace spending limit exceeded' USING ERRCODE='23514';
    END IF;

    root := niu_customer_attempt_spending_root(NEW.attempt_id);
    IF workspace IS NULL THEN
        SELECT project_id INTO workspace FROM attempts WHERE id=NEW.attempt_id;
    END IF;
    IF root IS NULL AND EXISTS(SELECT 1 FROM customer_key_spending_limits
        WHERE organization_id=NEW.organization_id AND project_id=workspace
          AND account_id=NEW.account_id AND limit_nanos IS NOT NULL) THEN
        RAISE EXCEPTION 'key attribution required for bounded spending' USING ERRCODE='23514';
    END IF;
    SELECT limit_nanos INTO maximum FROM customer_key_spending_limits
        WHERE organization_id=NEW.organization_id AND spending_root_id=root AND account_id=NEW.account_id;
    IF maximum IS NOT NULL AND niu_customer_key_committed(root,NEW.account_id)+NEW.amount_nanos>maximum THEN
        RAISE EXCEPTION 'customer key spending limit exceeded' USING ERRCODE='23514';
    END IF;
    PERFORM set_config('niu.verified_workspace_reservation_attempt', NEW.attempt_id::text, true);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_customer_workspace_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE workspace UUID; maximum BIGINT;
BEGIN
    IF current_setting('niu.verified_workspace_reservation_attempt', true) = NEW.attempt_id::text THEN
        PERFORM set_config('niu.verified_workspace_reservation_attempt', '', true);
        RETURN NEW;
    END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR NO KEY UPDATE;
    SELECT project_id INTO workspace FROM customer_attempt_balance_accounts
        WHERE attempt_id=NEW.attempt_id AND organization_id=NEW.organization_id
          AND account_id=NEW.account_id AND currency=NEW.currency;
    SELECT limit_nanos INTO maximum FROM customer_workspace_spending_limits
        WHERE organization_id=NEW.organization_id AND project_id=workspace
          AND account_id=NEW.account_id AND currency=NEW.currency;
    IF maximum IS NOT NULL AND
        niu_customer_workspace_committed(NEW.organization_id,workspace,NEW.account_id)+NEW.amount_nanos>maximum THEN
        RAISE EXCEPTION 'customer workspace spending limit exceeded' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_customer_credit_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected RECORD;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    IF NOT EXISTS(SELECT 1 FROM customer_balance_consumption_allocations a JOIN customer_balance_entries e ON e.id=a.entry_id
        WHERE a.entry_id=NEW.entry_id AND a.organization_id=NEW.organization_id AND a.account_id=NEW.account_id
          AND a.currency=NEW.currency AND a.kind=NEW.kind AND a.nominal_nanos=NEW.nominal_nanos
          AND e.kind=NEW.kind AND e.amount_nanos::numeric=(CASE WHEN NEW.kind='charge' THEN -NEW.nominal_nanos::numeric ELSE NEW.nominal_nanos::numeric END)
          AND e.reverses_entry_id IS NOT DISTINCT FROM NEW.source_charge_entry_id) THEN
        RAISE EXCEPTION 'Credit source requires exact scoped consumption' USING ERRCODE='23514';
    END IF;
    IF current_setting('niu.verified_credit_source_entry', true) = NEW.entry_id::text THEN
        PERFORM set_config('niu.verified_credit_source_entry', '', true);
        RETURN NEW;
    END IF;
    SELECT * INTO STRICT expected FROM niu_customer_credit_source_split(NEW.entry_id);
    IF NEW.nongift_nanos IS DISTINCT FROM expected.nongift_nanos OR NEW.cash_nanos IS DISTINCT FROM expected.cash_nanos
        OR NEW.credit_nanos IS DISTINCT FROM expected.credit_nanos OR NEW.source_coverage<>expected.source_coverage THEN
        RAISE EXCEPTION 'Credit source differs from deterministic cash and unpaid-credit split' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION allocate_customer_credit_sources() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allocation customer_balance_consumption_allocations%ROWTYPE; split RECORD;
BEGIN
    IF NEW.kind NOT IN ('charge','refund') THEN RETURN NEW; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT * INTO STRICT allocation FROM customer_balance_consumption_allocations WHERE entry_id=NEW.id;
    SELECT * INTO STRICT split FROM niu_customer_credit_source_split(NEW.id);
    PERFORM set_config('niu.verified_credit_source_entry', NEW.id::text, true);
    INSERT INTO customer_credit_sources(entry_id,organization_id,account_id,currency,kind,nominal_nanos,
        nongift_nanos,cash_nanos,credit_nanos,source_coverage,source_charge_entry_id)
    VALUES(NEW.id,NEW.organization_id,NEW.account_id,NEW.currency,NEW.kind,allocation.nominal_nanos,
        split.nongift_nanos,split.cash_nanos,split.credit_nanos,split.source_coverage,NEW.reverses_entry_id);
    PERFORM set_config('niu.verified_credit_source_entry', '', true);
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0326_hot_path_indexes_and_submission_key_digest.sql 987
-- Add missing high-traffic indexes on customer_balance_entries, provider_offers,
-- request_payloads, and video_submission_intents submission_key digest joins.

CREATE INDEX IF NOT EXISTS customer_balance_entries_workspace_charges_idx
    ON customer_balance_entries (account_id, organization_id, project_id)
    INCLUDE (amount_nanos)
    WHERE kind = 'charge';

CREATE INDEX IF NOT EXISTS provider_offers_model_alias_idx
    ON provider_offers (model_alias);

CREATE INDEX IF NOT EXISTS request_payloads_expiry_order_idx
    ON request_payloads (expires_at, attempt_id);

CREATE OR REPLACE FUNCTION niu_submission_key_digest(p_key UUID)
RETURNS BYTEA LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
    SELECT sha256(convert_to(p_key::text, 'UTF8'))
$$;

CREATE INDEX IF NOT EXISTS video_submission_intents_key_digest_idx
    ON video_submission_intents (
        organization_id,
        project_id,
        niu_submission_key_digest(submission_key)
    )
    INCLUDE (owner, id);

-- @niu-legacy-migration 0327_key_token_budget_window.sql 2032
-- Bound completed unknown-usage attempts in niu_key_token_budget to the 60-second
-- rolling window while retaining in-flight/unresolved dispatches (completed_at IS NULL).

DROP INDEX IF EXISTS attempts_key_unknown_token_usage;
CREATE INDEX attempts_key_unknown_token_usage ON attempts(api_key_id, completed_at DESC)
    INCLUDE(id)
    WHERE dispatched_at IS NOT NULL AND execution<>'confirmed_not_executed'
      AND NOT(execution='confirmed_completed' AND usage_confidence='provider_reported' AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL);

CREATE OR REPLACE FUNCTION niu_key_token_budget(root UUID, excluded UUID, as_of TIMESTAMPTZ)
RETURNS TABLE(known_tokens NUMERIC,reserved_tokens NUMERIC,unbounded_requests BIGINT)
LANGUAGE SQL STABLE AS $$
    SELECT known.total,pending.total,pending.unbounded
    FROM (
        SELECT COALESCE(sum(a.prompt_tokens::numeric+a.completion_tokens),0) AS total
        FROM api_keys k
        JOIN attempts a ON a.api_key_id=k.id
        WHERE k.spending_root_id=root AND (excluded IS NULL OR a.id<>excluded)
          AND a.dispatched_at IS NOT NULL AND a.execution='confirmed_completed'
          AND a.usage_confidence='provider_reported' AND a.prompt_tokens IS NOT NULL AND a.completion_tokens IS NOT NULL
          AND a.completed_at>as_of-interval '60 seconds'
    ) known CROSS JOIN (
        SELECT COALESCE(sum(b.token_bound::numeric),0) AS total,count(*) FILTER(WHERE b.token_bound IS NULL) AS unbounded
        FROM api_keys k
        JOIN attempts a ON a.api_key_id=k.id
        LEFT JOIN key_attempt_token_bounds b ON b.attempt_id=a.id
        WHERE k.spending_root_id=root AND (excluded IS NULL OR a.id<>excluded)
          AND a.dispatched_at IS NOT NULL AND a.execution<>'confirmed_not_executed'
          AND NOT(execution='confirmed_completed' AND usage_confidence='provider_reported' AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL)
          AND (a.completed_at IS NULL OR a.completed_at>as_of-interval '60 seconds')
    ) pending;
$$;

-- @niu-legacy-migration 0328_optimize_credit_repayment_and_grant_loops.sql 8353
-- Eliminate O(N^2) full-history scans in allocate_customer_credit_repayments
-- and apply_customer_grant_credit_policy by indexing credit-bearing charges
-- and avoiding redundant per-row full-account scans during trigger-driven loops.

CREATE INDEX IF NOT EXISTS customer_credit_sources_known_credit_charges_idx
    ON customer_credit_sources (account_id, entry_id)
    WHERE kind = 'charge' AND source_coverage = 'known' AND credit_nanos > 0;

CREATE OR REPLACE FUNCTION validate_customer_grant_credit_application() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE grant_amount NUMERIC; used NUMERIC; owed NUMERIC; pool NUMERIC;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    IF current_setting('niu.verified_grant_credit_application_grant', true) = NEW.grant_id::text THEN
        RETURN NEW;
    END IF;
    SELECT g.amount_nanos::numeric INTO STRICT grant_amount FROM customer_balance_grants g
        JOIN customer_grant_policies p ON p.grant_id=g.id AND p.policy='unpaid_credit_first'
        WHERE g.id=NEW.grant_id AND g.organization_id=NEW.organization_id AND g.account_id=NEW.account_id AND g.currency=NEW.currency;
    IF NOT EXISTS(SELECT 1 FROM customer_credit_sources s WHERE s.entry_id=NEW.charge_entry_id
        AND s.organization_id=NEW.organization_id AND s.account_id=NEW.account_id AND s.currency=NEW.currency
        AND s.kind='charge' AND s.source_coverage='known') THEN
        RAISE EXCEPTION 'Grant application requires exact known customer credit' USING ERRCODE='23514';
    END IF;
    SELECT COALESCE(sum(amount_nanos::numeric),0) INTO used FROM customer_grant_credit_applications WHERE grant_id=NEW.grant_id;
    owed:=niu_customer_unpaid_credit(NEW.charge_entry_id); pool:=niu_customer_explicit_gift_pool(NEW.account_id);
    IF NOT niu_customer_credit_account_covered(NEW.account_id) OR used+NEW.amount_nanos>grant_amount
        OR owed IS NULL OR owed<NEW.amount_nanos OR pool<NEW.amount_nanos THEN
        RAISE EXCEPTION 'Grant application exceeds available gift or exact unpaid credit' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION apply_customer_grant_credit_policy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE journal customer_balance_grants%ROWTYPE; target RECORD; remaining BIGINT; amount BIGINT; pool NUMERIC; covered BOOLEAN;
BEGIN
    IF NEW.policy='future_only' THEN RETURN NEW; END IF;
    SELECT * INTO STRICT journal FROM customer_balance_grants WHERE id=NEW.grant_id;
    PERFORM id FROM customer_balance_accounts WHERE id=journal.account_id FOR NO KEY UPDATE;
    remaining:=journal.amount_nanos;
    covered:=niu_customer_credit_account_covered(journal.account_id);
    pool:=niu_customer_explicit_gift_pool(journal.account_id);
    FOR target IN SELECT s.entry_id,niu_customer_unpaid_credit(s.entry_id) AS owed
        FROM customer_credit_sources s JOIN customer_balance_entries e ON e.id=s.entry_id
        WHERE s.account_id=journal.account_id AND s.kind='charge' AND s.source_coverage='known' AND s.credit_nanos>0
        ORDER BY e.created_at,e.id
    LOOP
        IF target.owed IS NULL OR target.owed<0 THEN RAISE EXCEPTION 'Unpaid credit is inconsistent' USING ERRCODE='23514'; END IF;
        amount:=LEAST(remaining::numeric,target.owed)::bigint;
        IF amount>0 THEN
            IF NOT covered OR pool<amount THEN
                RAISE EXCEPTION 'Grant application exceeds available gift or exact unpaid credit' USING ERRCODE='23514';
            END IF;
            PERFORM set_config('niu.verified_grant_credit_application_grant', journal.id::text, true);
            INSERT INTO customer_grant_credit_applications(id,organization_id,account_id,currency,grant_id,charge_entry_id,amount_nanos)
            VALUES(gen_random_uuid(),journal.organization_id,journal.account_id,journal.currency,journal.id,target.entry_id,amount);
            PERFORM set_config('niu.verified_grant_credit_application_grant', '', true);
            remaining:=remaining-amount;
            pool:=pool-amount;
        END IF;
        EXIT WHEN remaining=0;
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_customer_credit_repayment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE receipt_amount NUMERIC; capacity NUMERIC; committed NUMERIC; available_cash NUMERIC;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    IF current_setting('niu.verified_credit_repayment_funding', true) = NEW.funding_entry_id::text THEN
        RETURN NEW;
    END IF;
    SELECT r.amount_nanos::numeric INTO STRICT receipt_amount FROM customer_funding_receipts r JOIN customer_balance_entries e ON e.id=r.entry_id
        WHERE r.entry_id=NEW.funding_entry_id AND r.organization_id=NEW.organization_id AND r.account_id=NEW.account_id
          AND r.currency=NEW.currency AND e.kind='funding' AND e.amount_nanos=r.amount_nanos;
    IF NOT EXISTS(SELECT 1 FROM customer_credit_sources s WHERE s.entry_id=NEW.charge_entry_id AND s.organization_id=NEW.organization_id
        AND s.account_id=NEW.account_id AND s.currency=NEW.currency AND s.kind='charge' AND s.source_coverage='known') THEN
        RAISE EXCEPTION 'Repayment requires exact known customer credit' USING ERRCODE='23514';
    END IF;
    SELECT COALESCE(sum(amount_nanos::numeric),0) INTO committed FROM customer_credit_repayments WHERE funding_entry_id=NEW.funding_entry_id;
    capacity:=niu_customer_unpaid_credit(NEW.charge_entry_id); available_cash:=niu_customer_verified_prepaid_cash(NEW.account_id);
    IF NOT niu_customer_credit_account_covered(NEW.account_id) OR capacity IS NULL
        OR committed+NEW.amount_nanos>receipt_amount OR capacity<NEW.amount_nanos OR available_cash<NEW.amount_nanos THEN
        RAISE EXCEPTION 'Repayment exceeds exact cash or unpaid credit after allowances' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION allocate_customer_credit_repayments() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE remaining BIGINT; target RECORD; amount BIGINT; available_cash NUMERIC;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    IF NOT EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.id=NEW.entry_id AND e.organization_id=NEW.organization_id
        AND e.account_id=NEW.account_id AND e.currency=NEW.currency AND e.kind='funding' AND e.amount_nanos=NEW.amount_nanos) THEN
        RAISE EXCEPTION 'Verified receipt requires its exact positive funding entry' USING ERRCODE='23514';
    END IF;
    IF NOT niu_customer_credit_account_covered(NEW.account_id) THEN RETURN NEW; END IF;
    remaining:=NEW.amount_nanos;
    available_cash:=niu_customer_verified_prepaid_cash(NEW.account_id);
    FOR target IN SELECT s.entry_id,niu_customer_unpaid_credit(s.entry_id) AS owed
        FROM customer_credit_sources s JOIN customer_balance_entries e ON e.id=s.entry_id
        WHERE s.account_id=NEW.account_id AND s.kind='charge' AND s.source_coverage='known' AND s.credit_nanos>0
        ORDER BY e.created_at,e.id
    LOOP
        IF target.owed IS NULL OR target.owed<0 THEN RAISE EXCEPTION 'Outstanding credit is inconsistent' USING ERRCODE='23514'; END IF;
        amount:=LEAST(remaining::numeric,target.owed)::bigint;
        IF amount>0 THEN
            IF available_cash<amount THEN
                RAISE EXCEPTION 'Repayment exceeds exact cash or unpaid credit after allowances' USING ERRCODE='23514';
            END IF;
            PERFORM set_config('niu.verified_credit_repayment_funding', NEW.entry_id::text, true);
            INSERT INTO customer_credit_repayments(id,organization_id,account_id,currency,funding_entry_id,charge_entry_id,amount_nanos)
            VALUES(gen_random_uuid(),NEW.organization_id,NEW.account_id,NEW.currency,NEW.entry_id,target.entry_id,amount);
            PERFORM set_config('niu.verified_credit_repayment_funding', '', true);
            remaining:=remaining-amount;
            available_cash:=available_cash-amount;
        END IF;
        EXIT WHEN remaining=0;
    END LOOP;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0329_routing_registry_offer_revisions.sql 261
-- Store compact offer revisions alongside compiled routing registry snapshots
-- so hot-path validate_published_offer_binding never detoasts multi-MB compiled JSONB.

ALTER TABLE routing_registry_generations
    ADD COLUMN IF NOT EXISTS offer_revisions JSONB;

-- @niu-legacy-migration 0330_chat_sessions_payload_metadata.sql 1205
-- Cache payload_bytes and title on chat_sessions so session listings and size
-- guards never detoast multi-MB conversation payloads twice per read.

ALTER TABLE chat_sessions
    ADD COLUMN IF NOT EXISTS payload_bytes BIGINT,
    ADD COLUMN IF NOT EXISTS title TEXT;

CREATE OR REPLACE FUNCTION niu_sync_chat_session_payload_metadata()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.payload_bytes := octet_length(NEW.payload::text)::bigint;
    NEW.title := CASE
        WHEN jsonb_typeof(NEW.payload->'title') = 'string'
         AND btrim(NEW.payload->>'title') <> ''
        THEN NEW.payload->>'title'
        ELSE NULL
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_chat_session_payload_metadata ON chat_sessions;
CREATE TRIGGER sync_chat_session_payload_metadata
    BEFORE INSERT OR UPDATE OF payload ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION niu_sync_chat_session_payload_metadata();

UPDATE chat_sessions
SET payload_bytes = octet_length(payload::text)::bigint,
    title = CASE
        WHEN jsonb_typeof(payload->'title') = 'string'
         AND btrim(payload->>'title') <> ''
        THEN payload->>'title'
        ELSE NULL
    END
WHERE payload_bytes IS NULL;

-- @niu-legacy-migration 0331_optimize_request_rate_denial_admission.sql 6905
-- Avoid dirtying and rolling back expired rate-admission rows on rejected 429 attempts,
-- and record key request-rate denials in the same dispatch transaction via subtransaction rollback.

CREATE OR REPLACE FUNCTION niu_enforce_key_request_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    root UUID;
    rpm BIGINT;
    admitted BIGINT;
    checked_at TIMESTAMPTZ;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN
        RETURN NEW;
    END IF;
    SELECT spending_root_id INTO root FROM api_keys WHERE id=NEW.api_key_id;
    IF root IS NULL THEN RETURN NEW; END IF;
    -- Lock the configured policy, not the key row: dispatch already holds key SHARE locks.
    SELECT requests_per_minute INTO rpm FROM key_request_rate_limits
        WHERE spending_root_id=root FOR UPDATE;
    IF NOT FOUND THEN RETURN NEW; END IF;
    IF rpm = 0 THEN
        RAISE EXCEPTION 'API key request rate is disabled' USING ERRCODE='P0026';
    END IF;
    checked_at := clock_timestamp();
    IF rpm IS NOT NULL THEN
        SELECT count(*) INTO admitted FROM key_request_rate_admissions
            WHERE spending_root_id=root AND admitted_at > checked_at - INTERVAL '60 seconds';
        IF admitted >= rpm THEN
            RAISE EXCEPTION 'API key request rate exhausted' USING ERRCODE='P0020';
        END IF;
    END IF;
    DELETE FROM key_request_rate_admissions
        WHERE spending_root_id=root AND admitted_at <= checked_at - INTERVAL '60 seconds';
    INSERT INTO key_request_rate_admissions(attempt_id,spending_root_id,admitted_at)
        VALUES(NEW.id,root,checked_at);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION niu_enforce_vendor_request_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    credential UUID;
    credentials UUID[];
    rpm BIGINT;
    checked_at TIMESTAMPTZ;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN
        RETURN NEW;
    END IF;
    -- The immutable attempt bindings identify the actual credential, never the current alias.
    SELECT array_agg(vendor_id) INTO credentials FROM (
        SELECT vendor_id FROM managed_attempt_routes WHERE attempt_id=NEW.id
        UNION SELECT vendor_id FROM personal_attempt_routes WHERE attempt_id=NEW.id
        UNION SELECT vendor_id FROM media_recovery_routes WHERE attempt_id=NEW.id
    ) bound;
    IF cardinality(credentials) > 1 THEN
        RAISE EXCEPTION 'Conflicting credential bindings' USING ERRCODE='P0024';
    END IF;
    credential := credentials[1];
    IF credential IS NULL THEN RETURN NEW; END IF;
    -- Serialize policy edits and admissions without upgrading vendor SHARE locks.
    SELECT requests_per_minute INTO rpm FROM vendor_request_rate_limits
        WHERE vendor_id=credential FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credential rate policy missing' USING ERRCODE='P0024'; END IF;
    IF rpm = 0 THEN
        RAISE EXCEPTION 'Upstream credential request rate is disabled' USING ERRCODE='P0027';
    END IF;
    checked_at := clock_timestamp();
    IF rpm IS NOT NULL AND (SELECT count(*) FROM vendor_request_rate_admissions
        WHERE vendor_id=credential AND admitted_at > checked_at - INTERVAL '60 seconds') >= rpm THEN
        RAISE EXCEPTION 'Upstream credential request rate exhausted' USING ERRCODE='P0025';
    END IF;
    DELETE FROM vendor_request_rate_admissions WHERE vendor_id=credential
        AND admitted_at <= checked_at - INTERVAL '60 seconds';
    -- Count even unlimited dispatches so applying a cap cannot forget the current window.
    INSERT INTO vendor_request_rate_admissions(attempt_id,vendor_id,admitted_at)
        VALUES(NEW.id,credential,checked_at);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION niu_mark_dispatched_with_guardrail_audit(UUID,UUID,UUID,UUID,BOOLEAN)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
    changed BIGINT;
    rejection TEXT;
    metadata JSONB;
    denial_kind TEXT;
    denial_code BIGINT;
    key_name TEXT;
    key_rev BIGINT;
BEGIN
    BEGIN
        UPDATE attempts a
        SET execution = 'may_have_executed', dispatched_at = clock_timestamp(), api_key_id = $4
        FROM operations o, api_keys k
        WHERE a.organization_id = $1 AND a.project_id = $2 AND a.id = $3
            AND a.execution = 'not_sent' AND o.id = a.operation_id AND k.id = $4
            AND ('*' = ANY(k.allowed_models) OR o.model_alias = ANY(k.allowed_models))
            AND k.expires_at > clock_timestamp()
            AND NOT EXISTS (
                SELECT 1 FROM account_assignments s
                WHERE s.attempt_id=a.id AND s.state <> 'held'
            )
            AND (
                NOT EXISTS (
                    SELECT 1 FROM project_budgets b
                    WHERE b.organization_id=$1 AND b.project_id=$2
                )
                OR EXISTS (
                    SELECT 1 FROM cost_reservations r
                    WHERE r.attempt_id=a.id AND r.state='held'
                )
                OR EXISTS (
                    SELECT 1 FROM personal_attempt_routes personal
                    WHERE personal.attempt_id=a.id
                )
            );
        GET DIAGNOSTICS changed = ROW_COUNT;
        RETURN changed;
    EXCEPTION
        WHEN SQLSTATE 'P0010' THEN
            GET STACKED DIAGNOSTICS rejection = PG_EXCEPTION_DETAIL;
            metadata := rejection::jsonb;
            INSERT INTO dispatch_guardrail_rejections(organization_id,project_id,attempt_id,key_id,reason,workspace_revision,key_policy_revision,key_assignment_revision)
            VALUES($1,$2,$3,$4,metadata->>'reason',(metadata->>'workspace_revision')::BIGINT,(metadata->>'key_policy_revision')::BIGINT,(metadata->>'key_assignment_revision')::BIGINT);
            RETURN -1;
        WHEN SQLSTATE 'P0026' THEN
            IF NOT COALESCE($5, FALSE) THEN
                RAISE;
            END IF;
            denial_kind := 'key_request_rate_disabled';
            denial_code := -2;
        WHEN SQLSTATE 'P0020' THEN
            IF NOT COALESCE($5, FALSE) THEN
                RAISE;
            END IF;
            denial_kind := 'key_request_rate_exceeded';
            denial_code := -3;
    END;

    SELECT name, revision INTO key_name, key_rev
    FROM api_keys
    WHERE id = $4 AND organization_id = $1 AND project_id = $2;
    IF FOUND THEN
        INSERT INTO gateway_admission_denials
            (attempt_id,organization_id,project_id,requested_key_id,requested_key_name,requested_key_revision,kind,http_status)
        VALUES ($3,$1,$2,$4,key_name,key_rev,denial_kind,429)
        ON CONFLICT (attempt_id) DO NOTHING;
    END IF;
    RETURN denial_code;
END;
$$;

CREATE OR REPLACE FUNCTION niu_mark_dispatched_with_guardrail_audit(UUID,UUID,UUID,UUID)
RETURNS BIGINT LANGUAGE plpgsql AS $$
BEGIN
    RETURN niu_mark_dispatched_with_guardrail_audit($1, $2, $3, $4, FALSE);
END;
$$;

-- @niu-legacy-migration 0332_index_customer_balance_reservations_by_account.sql 828
-- Index open customer balance reservations and charge/refund lookups by account_id
-- so niu_customer_account_outstanding, niu_customer_workspace_committed, and
-- niu_customer_key_committed use index-only scans instead of table scans.

CREATE INDEX IF NOT EXISTS customer_balance_reservations_open_by_account_idx
    ON customer_balance_reservations (account_id, attempt_id)
    INCLUDE (amount_nanos)
    WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS customer_balance_entries_account_charge_attempt_idx
    ON customer_balance_entries (account_id, attempt_id)
    INCLUDE (amount_nanos, id)
    WHERE kind = 'charge';

CREATE INDEX IF NOT EXISTS customer_balance_entries_account_refund_reverse_idx
    ON customer_balance_entries (account_id, reverses_entry_id)
    INCLUDE (amount_nanos)
    WHERE kind = 'refund';

-- @niu-legacy-migration 0333_consolidate_attempt_guardrail_dispatch_triggers.sql 13035
-- Consolidate redundant attempt guardrail dispatch triggers and add transition
-- WHEN predicates so completion updates skip dispatch-only PL/pgSQL functions.

CREATE OR REPLACE FUNCTION niu_guardrail_rejection_detail(org UUID, workspace UUID, key UUID, reason TEXT)
RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'reason', reason,
        'workspace_revision', (
            SELECT NULLIF(revision, 0)
            FROM workspace_guardrail_heads
            WHERE organization_id = org AND project_id = workspace
        ),
        'key_policy_revision', a.policy_revision,
        'key_assignment_revision', a.assignment_revision
    )::text
    FROM (SELECT 1) AS one_row
    LEFT JOIN key_guardrail_assignments a
      ON a.organization_id = org AND a.project_id = workspace AND a.key_id = key;
$$;

CREATE OR REPLACE FUNCTION niu_record_dispatch_guardrails() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    workspace_rev BIGINT;
    policy_rev BIGINT;
    assignment_rev BIGINT;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    SELECT NULLIF(revision, 0) INTO workspace_rev
      FROM workspace_guardrail_heads
     WHERE organization_id = NEW.organization_id AND project_id = NEW.project_id;
    SELECT policy_revision, assignment_revision INTO policy_rev, assignment_rev
      FROM key_guardrail_assignments
     WHERE organization_id = NEW.organization_id AND project_id = NEW.project_id AND key_id = NEW.api_key_id;
    INSERT INTO dispatch_guardrail_decisions (
        organization_id, project_id, attempt_id, workspace_revision,
        key_policy_revision, key_assignment_revision
    ) VALUES (
        NEW.organization_id, NEW.project_id, NEW.id,
        workspace_rev, policy_rev, assignment_rev
    );
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION niu_check_inspected_guardrail_binding() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    binding inspected_guardrail_bindings%ROWTYPE;
    has_binding BOOLEAN;
    workspace_revision BIGINT;
    workspace_policy JSONB;
    policy_revision BIGINT;
    assignment_revision BIGINT;
    key_policy JSONB;
    policy JSONB;
    detector JSONB;
    image_binding image_request_bindings%ROWTYPE;
    has_image_binding BOOLEAN := FALSE;
    checked_image_binding BOOLEAN := FALSE;
    position INTEGER;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;

    SELECT NULLIF(h.revision, 0), r.policy
      INTO workspace_revision, workspace_policy
      FROM workspace_guardrail_heads h
      LEFT JOIN workspace_guardrail_revisions r USING (organization_id, project_id, revision)
     WHERE h.organization_id = NEW.organization_id AND h.project_id = NEW.project_id;

    SELECT a.policy_revision, a.assignment_revision, r.policy
      INTO policy_revision, assignment_revision, key_policy
      FROM key_guardrail_assignments a
      LEFT JOIN workspace_guardrail_revisions r
        ON r.organization_id = a.organization_id
       AND r.project_id = a.project_id
       AND r.revision = a.policy_revision
     WHERE a.organization_id = NEW.organization_id
       AND a.project_id = NEW.project_id
       AND a.key_id = NEW.api_key_id;

    SELECT * INTO binding
      FROM inspected_guardrail_bindings
     WHERE organization_id = NEW.organization_id
       AND project_id = NEW.project_id
       AND attempt_id = NEW.id;
    has_binding := FOUND;

    -- 1. Inspected guardrail binding check
    IF NOT has_binding THEN
        IF (workspace_policy IS NOT NULL AND jsonb_array_length(COALESCE(workspace_policy->'input_rules', '[]'::jsonb)) > 0)
           OR (key_policy IS NOT NULL AND jsonb_array_length(COALESCE(key_policy->'input_rules', '[]'::jsonb)) > 0) THEN
            RAISE EXCEPTION 'input inspection binding required'
                USING ERRCODE = 'P0010',
                      DETAIL = niu_guardrail_rejection_detail(NEW.organization_id, NEW.project_id, NEW.api_key_id, 'input_binding_missing');
        END IF;
    ELSE
        IF binding.key_id IS DISTINCT FROM NEW.api_key_id
            OR binding.workspace_revision IS DISTINCT FROM workspace_revision
            OR binding.key_policy_revision IS DISTINCT FROM policy_revision
            OR binding.key_assignment_revision IS DISTINCT FROM assignment_revision THEN
            RAISE EXCEPTION 'inspected guardrail policy changed'
                USING ERRCODE = 'P0010',
                      DETAIL = niu_guardrail_rejection_detail(NEW.organization_id, NEW.project_id, NEW.api_key_id, 'policy_changed');
        END IF;

        -- 2. Input inspection result requirement check
        IF binding.input_outcome IS NULL
           AND ((workspace_policy IS NOT NULL AND jsonb_array_length(COALESCE(workspace_policy->'input_rules', '[]'::jsonb)) > 0)
                OR (key_policy IS NOT NULL AND jsonb_array_length(COALESCE(key_policy->'input_rules', '[]'::jsonb)) > 0)) THEN
            RAISE EXCEPTION 'input inspection result required' USING ERRCODE = 'P0006';
        END IF;
    END IF;

    -- 3. Input detector bindings check
    FOREACH policy IN ARRAY ARRAY[workspace_policy, key_policy] LOOP
        IF policy IS NULL THEN CONTINUE; END IF;
        FOR detector IN SELECT value FROM jsonb_array_elements(COALESCE(policy->'input_detectors', '[]'::jsonb)) LOOP
            IF detector->>'consent_to_external_processing' IS DISTINCT FROM 'true' OR NOT EXISTS (
                SELECT 1 FROM input_detector_decisions d
                 WHERE d.id = ANY(binding.input_detector_decision_ids)
                   AND d.organization_id = NEW.organization_id
                   AND d.project_id = NEW.project_id
                   AND d.key_id = NEW.api_key_id
                   AND d.workspace_revision IS NOT DISTINCT FROM binding.workspace_revision
                   AND d.key_policy_revision IS NOT DISTINCT FROM binding.key_policy_revision
                   AND d.key_assignment_revision IS NOT DISTINCT FROM binding.key_assignment_revision
                   AND d.detector_name = detector->>'detector'
                   AND d.configuration_fingerprint = detector->>'configuration_fingerprint'
                   AND d.outcome = 'clear'
            ) THEN
                RAISE EXCEPTION 'required detector inspection missing'
                    USING ERRCODE = 'P0010',
                          DETAIL = niu_guardrail_rejection_detail(NEW.organization_id, NEW.project_id, NEW.api_key_id, 'input_binding_missing');
            END IF;
        END LOOP;
    END LOOP;

    -- 4. Record dispatch guardrail attribution decision
    INSERT INTO dispatch_guardrail_decisions (
        organization_id, project_id, attempt_id, workspace_revision,
        key_policy_revision, key_assignment_revision
    ) VALUES (
        NEW.organization_id, NEW.project_id, NEW.id,
        workspace_revision, policy_revision, assignment_revision
    );

    -- 5. Image inspection coverage check
    FOREACH policy IN ARRAY ARRAY[workspace_policy, key_policy] LOOP
        IF policy IS NULL OR NOT (policy ? 'image_detectors') OR policy->'image_detectors' = '[]'::jsonb THEN
            CONTINUE;
        END IF;
        IF jsonb_typeof(policy->'image_detectors') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION 'invalid required image inspection'
                USING ERRCODE = 'P0010',
                      DETAIL = niu_guardrail_rejection_detail(NEW.organization_id, NEW.project_id, NEW.api_key_id, 'input_binding_missing');
        END IF;
        IF NOT checked_image_binding THEN
            checked_image_binding := TRUE;
            IF has_binding THEN
                SELECT i.* INTO image_binding
                  FROM image_request_bindings i
                 WHERE i.organization_id = NEW.organization_id
                   AND i.project_id = NEW.project_id
                   AND i.attempt_id = NEW.id
                   AND i.key_id = NEW.api_key_id
                   AND i.workspace_revision IS NOT DISTINCT FROM binding.workspace_revision
                   AND i.key_policy_revision IS NOT DISTINCT FROM binding.key_policy_revision
                   AND i.key_assignment_revision IS NOT DISTINCT FROM binding.key_assignment_revision;
                has_image_binding := FOUND;
            END IF;
        END IF;
        IF NOT has_image_binding THEN
            RAISE EXCEPTION 'required image request binding missing'
                USING ERRCODE = 'P0010',
                      DETAIL = niu_guardrail_rejection_detail(NEW.organization_id, NEW.project_id, NEW.api_key_id, 'input_binding_missing');
        END IF;
        FOR detector IN SELECT value FROM jsonb_array_elements(policy->'image_detectors') LOOP
            FOREACH position IN ARRAY image_binding.image_positions LOOP
                IF detector->>'consent_to_image_processing' IS DISTINCT FROM 'true' OR NOT EXISTS (
                    SELECT 1
                      FROM image_request_approval_bindings a
                      JOIN image_processing_approvals r
                        ON r.organization_id = a.organization_id
                       AND r.project_id = a.project_id
                       AND r.key_id = a.key_id
                       AND r.id = a.approval_id
                     WHERE a.attempt_id = NEW.id
                       AND a.organization_id = NEW.organization_id
                       AND a.project_id = NEW.project_id
                       AND a.key_id = NEW.api_key_id
                       AND r.content_position = position
                       AND r.detector_name = detector->>'detector'
                       AND r.configuration_fingerprint = detector->>'configuration_fingerprint'
                       AND r.workspace_revision IS NOT DISTINCT FROM image_binding.workspace_revision
                       AND r.key_policy_revision IS NOT DISTINCT FROM image_binding.key_policy_revision
                       AND r.key_assignment_revision IS NOT DISTINCT FROM image_binding.key_assignment_revision
                ) THEN
                    RAISE EXCEPTION 'required image inspection coverage missing'
                        USING ERRCODE = 'P0010',
                              DETAIL = niu_guardrail_rejection_detail(NEW.organization_id, NEW.project_id, NEW.api_key_id, 'input_binding_missing');
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS zyb_require_input_inspection_result ON attempts;
DROP TRIGGER IF EXISTS zz_input_detector_dispatch_guard ON attempts;
DROP TRIGGER IF EXISTS zz_record_dispatch_guardrail_decision ON attempts;
DROP TRIGGER IF EXISTS zz_unqualified_image_dispatch_guard ON attempts;

DROP TRIGGER IF EXISTS dispatch_requires_current_model_guardrails ON attempts;
CREATE TRIGGER dispatch_requires_current_model_guardrails
    BEFORE UPDATE OF execution ON attempts
    FOR EACH ROW
    WHEN (OLD.execution = 'not_sent' AND NEW.execution = 'may_have_executed')
    EXECUTE FUNCTION niu_check_dispatch_model_guardrails();

DROP TRIGGER IF EXISTS zy_check_inspected_guardrail_binding ON attempts;
CREATE TRIGGER zy_check_inspected_guardrail_binding
    BEFORE UPDATE OF execution ON attempts
    FOR EACH ROW
    WHEN (OLD.execution = 'not_sent' AND NEW.execution = 'may_have_executed')
    EXECUTE FUNCTION niu_check_inspected_guardrail_binding();

DROP TRIGGER IF EXISTS attempts_require_current_supplier_qualification ON attempts;
CREATE TRIGGER attempts_require_current_supplier_qualification
    BEFORE UPDATE OF execution ON attempts
    FOR EACH ROW
    WHEN (OLD.execution = 'not_sent' AND NEW.execution = 'may_have_executed')
    EXECUTE FUNCTION niu_guard_qualified_supplier_dispatch();

DROP TRIGGER IF EXISTS media_offer_requires_media_dispatch ON attempts;
CREATE TRIGGER media_offer_requires_media_dispatch
    BEFORE UPDATE OF execution ON attempts
    FOR EACH ROW
    WHEN (OLD.execution = 'not_sent' AND NEW.execution = 'may_have_executed')
    EXECUTE FUNCTION niu_guard_media_offer_dispatch();

DROP TRIGGER IF EXISTS guard_platform_media_liability_dispatch ON attempts;
CREATE TRIGGER guard_platform_media_liability_dispatch
    BEFORE UPDATE OF execution ON attempts
    FOR EACH ROW
    WHEN (OLD.execution = 'not_sent' AND NEW.execution = 'may_have_executed')
    EXECUTE FUNCTION guard_platform_media_liability_dispatch();

DROP TRIGGER IF EXISTS require_media_output_before_dispatch ON attempts;
CREATE TRIGGER require_media_output_before_dispatch
    BEFORE UPDATE OF dispatched_at ON attempts
    FOR EACH ROW
    WHEN (OLD.dispatched_at IS NULL AND NEW.dispatched_at IS NOT NULL)
    EXECUTE FUNCTION require_media_output_before_dispatch();

DROP TRIGGER IF EXISTS require_current_ingested_video_deadline ON attempts;
CREATE TRIGGER require_current_ingested_video_deadline
    BEFORE UPDATE OF dispatched_at ON attempts
    FOR EACH ROW
    WHEN (OLD.dispatched_at IS NULL AND NEW.dispatched_at IS NOT NULL)
    EXECUTE FUNCTION require_current_ingested_video_deadline();

-- @niu-legacy-migration 0334_deduplicate_media_offer_binding_checks.sql 6659
-- Eliminate redundant niu_media_offer_binding_current() evaluations in
-- validate_media_liability_qualification() and guard_platform_media_liability_dispatch(),
-- since niu_offer_qualification_current() already evaluates niu_media_offer_binding_current().

CREATE OR REPLACE FUNCTION validate_media_liability_qualification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE head media_liability_qualification_heads%ROWTYPE; action TEXT; original_until BIGINT;
BEGIN
    SELECT * INTO STRICT head FROM media_liability_qualification_heads WHERE id = NEW.head_id FOR NO KEY UPDATE;
    SELECT c.action INTO STRICT action FROM media_liability_qualification_changes c
        WHERE c.id = NEW.id AND c.head_id = NEW.head_id;
    IF TG_TABLE_NAME = 'media_liability_qualification_revocations' THEN
        SELECT effective_until INTO STRICT original_until FROM media_liability_qualifications
            WHERE id = NEW.qualification_id AND head_id = NEW.head_id;
        IF action <> 'revoked' OR NEW.effective_until > original_until THEN
            RAISE EXCEPTION 'Media liability revocation cannot extend qualification' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    IF action <> 'published' OR NOT EXISTS (
        SELECT 1 FROM provider_offers o JOIN provider_offer_revisions r ON r.id = o.current_revision
        JOIN vendors v ON v.id = o.vendor_id JOIN vendor_models m ON m.vendor_id = v.id AND m.alias = o.model_alias
        WHERE o.id = head.offer_id AND o.provider_id = head.supplier_id AND r.id = head.offer_revision
          AND r.rate_kind = 'media' AND o.active AND v.enabled AND m.enabled
          AND v.id::text = head.identity->>'vendor_id'
          AND v.revision = (head.identity->>'vendor_revision')::bigint
          AND m.alias = head.identity->>'model_alias'
          AND m.revision = (head.identity->>'model_revision')::bigint
          AND m.capabilities->'video_schema'->>'revision' = head.identity->>'schema_revision'
          AND m.capabilities->'video_schema'->>'channel' = head.identity->'dimensions'->>'channel'
          AND head.identity->'dimensions'->>'model' = m.alias
          AND head.identity->>'supplier_id' = head.supplier_id::text
          AND head.identity->>'offer_id' = head.offer_id::text
          AND head.identity->>'offer_revision' = head.offer_revision::text
          AND niu_offer_qualification_current(o.provider_id, o.id, r.id)
    ) OR EXISTS (
        SELECT 1 FROM media_liability_qualifications q
        LEFT JOIN media_liability_qualification_revocations revoked ON revoked.qualification_id = q.id
        WHERE q.head_id = NEW.head_id
          AND q.effective_from < LEAST(q.effective_until, COALESCE(revoked.effective_until, q.effective_until))
          AND NEW.effective_from < LEAST(q.effective_until, COALESCE(revoked.effective_until, q.effective_until))
          AND q.effective_from < NEW.effective_until
    ) THEN
        RAISE EXCEPTION 'Media liability requires current exact qualified supply and nonoverlapping validity'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION guard_platform_media_liability_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE at BIGINT;
BEGIN
    IF OLD.execution<>'not_sent' OR NEW.execution<>'may_have_executed'
        OR NOT EXISTS(SELECT 1 FROM retail_media_attempt_prices p WHERE p.attempt_id=NEW.id) THEN RETURN NEW; END IF;
    at:=floor(extract(epoch FROM clock_timestamp()))::bigint;
    IF NOT EXISTS (
        SELECT 1 FROM retail_media_attempt_prices p
        JOIN media_liability_qualifications q ON q.id=p.qualification_revision
        JOIN media_liability_qualification_heads h ON h.id=q.head_id
        LEFT JOIN media_liability_qualification_revocations revoked ON revoked.qualification_id=q.id
        JOIN provider_attempt_offers b ON b.attempt_id=p.attempt_id
        JOIN provider_offers o ON o.id=b.offer_id AND o.provider_id=b.provider_id
        JOIN vendors v ON v.id=o.vendor_id JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=o.model_alias
        JOIN media_recovery_routes route ON route.attempt_id=p.attempt_id
        JOIN customer_media_attempt_pricing price ON price.attempt_id=p.attempt_id
        JOIN customer_media_liability_bounds bound ON bound.attempt_id=p.attempt_id
        WHERE p.attempt_id=NEW.id AND p.organization_id=NEW.organization_id AND p.project_id=NEW.project_id
          AND q.effective_from<=at AND LEAST(q.effective_until,COALESCE(revoked.effective_until,q.effective_until))>at
          AND b.provider_id=h.supplier_id AND b.offer_id=h.offer_id AND b.revision_id=h.offer_revision
          AND o.current_revision=b.revision_id AND o.active AND v.enabled AND m.enabled
          AND v.id::text=h.identity->>'vendor_id' AND v.revision::text=h.identity->>'vendor_revision'
          AND m.alias=h.identity->>'model_alias' AND m.revision::text=h.identity->>'model_revision'
          AND m.capabilities->'video_schema'->>'revision'=h.identity->>'schema_revision'
          AND route.vendor_id=v.id AND route.vendor_revision=v.revision AND route.model_revision=m.revision
          AND route.schema_revision=h.identity->>'schema_revision'
          AND price.snapshot->'discounts'='[]'::jsonb
          AND price.snapshot->>'customer'=p.organization_id::text
          AND price.snapshot->>'selected_at'=p.selected_at::text
          AND price.snapshot->'tariff'->>'currency'=p.selection->>'currency'
          AND price.snapshot->'tariff'->>'revision'=COALESCE(p.promotion_revision,p.baseline_revision)::text
          AND price.snapshot->>'offer'=b.revision_id::text
          AND jsonb_build_object('dimensions',price.snapshot->'tariff'->'dimensions',
              'meter',price.snapshot->'tariff'->'meter','decimal_places',price.snapshot->'tariff'->'decimal_places',
              'amount_units',price.snapshot->'tariff'->>'amount_units',
              'per_quantity',price.snapshot->'tariff'->'per_quantity',
              'minimum_quantity',price.snapshot->'tariff'->'minimum_quantity',
              'rounding',price.snapshot->'tariff'->'rounding')=(p.selection->'schedule')-'kind'
          AND price.snapshot->'tariff'->'dimensions'=h.identity->'dimensions'
          AND bound.bound->'maximum_quantity'=q.maximum_quantity
          AND bound.bound->>'meter'=h.identity->>'meter'
          AND bound.bound->>'qualification_revision'=q.id::text
          AND niu_offer_qualification_current(b.provider_id,b.offer_id,b.revision_id)
    ) THEN
        RAISE EXCEPTION 'Platform media liability qualification changed before dispatch' USING ERRCODE='P0007';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0335_use_clock_timestamp_in_supplier_qualification.sql 1754
-- Use wall-clock clock_timestamp() (VOLATILE) instead of transaction-frozen now()
-- in supplier and offer qualification checks so long-running transactions cannot
-- bypass expired qualification windows.

CREATE OR REPLACE FUNCTION niu_supplier_qualification_current(p_provider UUID)
RETURNS BOOLEAN LANGUAGE SQL VOLATILE AS $$
    SELECT EXISTS (
        SELECT 1 FROM provider_businesses p
        JOIN provider_qualification_reviews q
          ON q.provider_id = p.id
         AND q.id = p.current_qualification_review
         WHERE p.id = p_provider
           AND q.revoked_at IS NULL
           AND q.valid_until > clock_timestamp()
           AND NOT EXISTS (
               SELECT 1 FROM provider_qualification_revocations r
                WHERE r.supplier_review_id = q.id
           )
    )
$$;

CREATE OR REPLACE FUNCTION niu_offer_qualification_current(
    p_provider UUID, p_offer UUID, p_revision UUID
)
RETURNS BOOLEAN LANGUAGE SQL VOLATILE AS $$
    SELECT niu_supplier_qualification_current(p_provider)
       AND niu_media_offer_binding_current(p_provider, p_offer, p_revision)
       AND EXISTS (
        SELECT 1 FROM provider_offers o
        JOIN provider_offer_qualification_reviews q
          ON q.provider_id = o.provider_id
         AND q.offer_id = o.id
         AND q.id = o.current_qualification_review
         WHERE o.provider_id = p_provider
           AND o.id = p_offer
           AND o.current_revision = p_revision
           AND q.rate_revision = p_revision
           AND q.revoked_at IS NULL
           AND q.valid_until > clock_timestamp()
           AND NOT EXISTS (
               SELECT 1 FROM provider_qualification_revocations r
                WHERE r.offer_review_id = q.id
           )
       )
$$;

-- @niu-legacy-migration 0336_vendor_credential_lock_order_and_offer_vendor_index.sql 862
-- Ensure BEFORE STATEMENT updates to vendors.credential_ciphertext acquire the
-- routing registry advisory lock (716554) before taking row locks on vendors,
-- matching registry_writer_vendors lock ordering, and index provider_offers(vendor_id)
-- so route qualification invalidation and FK checks avoid sequential scans.

CREATE INDEX IF NOT EXISTS provider_offers_vendor_id_idx
    ON provider_offers (vendor_id);

CREATE OR REPLACE FUNCTION niu_serialize_vendor_credential_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(716554);
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS serialize_vendor_credential_update ON vendors;
CREATE TRIGGER serialize_vendor_credential_update
    BEFORE UPDATE OF credential_ciphertext ON vendors
    FOR EACH STATEMENT
    EXECUTE FUNCTION niu_serialize_vendor_credential_update();

-- @niu-legacy-migration 0337_ingested_image_readiness_pending_queue.sql 2316
-- Track unresolved ingested_image_readiness_claims in a compact pending table
-- maintained by triggers so recover_interrupted_ingested_image_reads() and
-- pending-claim checks remain O(active claims) while keeping
-- ingested_image_readiness_claims strictly immutable.

CREATE TABLE IF NOT EXISTS ingested_image_readiness_pending (
    read_id UUID PRIMARY KEY REFERENCES ingested_image_readiness_claims(id) ON DELETE CASCADE,
    consent_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ingested_image_readiness_pending_recovery_idx
    ON ingested_image_readiness_pending (created_at, read_id);

CREATE INDEX IF NOT EXISTS ingested_image_readiness_pending_consent_idx
    ON ingested_image_readiness_pending (consent_id);

INSERT INTO ingested_image_readiness_pending (read_id, consent_id, created_at)
SELECT c.id, c.consent_id, c.created_at
  FROM ingested_image_readiness_claims c
 WHERE NOT EXISTS (
     SELECT 1 FROM ingested_image_readiness_outcomes o WHERE o.read_id = c.id
 )
ON CONFLICT (read_id) DO NOTHING;

CREATE OR REPLACE FUNCTION niu_track_ingested_image_readiness_pending()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM ingested_image_readiness_outcomes o WHERE o.read_id = NEW.id
    ) THEN
        INSERT INTO ingested_image_readiness_pending (read_id, consent_id, created_at)
        VALUES (NEW.id, NEW.consent_id, NEW.created_at)
        ON CONFLICT (read_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS track_ingested_image_readiness_pending ON ingested_image_readiness_claims;
CREATE TRIGGER track_ingested_image_readiness_pending
    AFTER INSERT ON ingested_image_readiness_claims
    FOR EACH ROW
    EXECUTE FUNCTION niu_track_ingested_image_readiness_pending();

CREATE OR REPLACE FUNCTION niu_clear_ingested_image_readiness_pending()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM ingested_image_readiness_pending WHERE read_id = NEW.read_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_ingested_image_readiness_pending ON ingested_image_readiness_outcomes;
CREATE TRIGGER clear_ingested_image_readiness_pending
    AFTER INSERT ON ingested_image_readiness_outcomes
    FOR EACH ROW
    EXECUTE FUNCTION niu_clear_ingested_image_readiness_pending();

-- @niu-legacy-migration 0338_customer_funding_and_grant_indexes.sql 1284
-- Add missing account_id and (currency, created_at) indexes on customer funding,
-- grant, and financial summary tables (#27 #132).

CREATE INDEX IF NOT EXISTS customer_funding_receipts_account
    ON customer_funding_receipts(account_id) INCLUDE (amount_nanos, entry_id);

CREATE INDEX IF NOT EXISTS customer_balance_grants_account
    ON customer_balance_grants(account_id) INCLUDE (amount_nanos, entry_id);

CREATE INDEX IF NOT EXISTS customer_funding_receipts_currency_created
    ON customer_funding_receipts(currency, created_at);

CREATE INDEX IF NOT EXISTS customer_balance_grants_currency_created
    ON customer_balance_grants(currency, created_at);

CREATE INDEX IF NOT EXISTS customer_charges_currency_created
    ON customer_charges(currency, created_at);

CREATE INDEX IF NOT EXISTS customer_media_charges_currency_created
    ON customer_media_charges(currency, created_at);

CREATE INDEX IF NOT EXISTS customer_balance_entries_currency_created
    ON customer_balance_entries(currency, created_at);

CREATE INDEX IF NOT EXISTS customer_grant_credit_applications_currency_created
    ON customer_grant_credit_applications(currency, created_at);

CREATE INDEX IF NOT EXISTS customer_invoice_payments_created_at
    ON customer_invoice_payments(created_at, invoice_id);

-- @niu-legacy-migration 0339_inspected_image_source_purge_and_ingestion_index.sql 4758
-- Index active inspected_image_source_content expiry and unresolved
-- asset_image_ingestion_claims so 5-second background loops do not scan
-- historical rows (#27 #133).

ALTER TABLE inspected_image_source_content
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

DROP TRIGGER IF EXISTS immutable_inspected_image_source_bytes ON inspected_image_source_content;

UPDATE inspected_image_source_content c
SET expires_at = s.expires_at
FROM inspected_image_sources s
WHERE s.id = c.source_id
  AND c.expires_at IS NULL;

ALTER TABLE inspected_image_source_content
    ALTER COLUMN expires_at SET NOT NULL;

CREATE OR REPLACE FUNCTION set_inspected_image_source_content_expiry() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.expires_at IS NULL THEN
        SELECT s.expires_at INTO NEW.expires_at
        FROM inspected_image_sources s
        WHERE s.id = NEW.source_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_inspected_image_source_content_expiry
BEFORE INSERT ON inspected_image_source_content
FOR EACH ROW EXECUTE FUNCTION set_inspected_image_source_content_expiry();

CREATE TRIGGER immutable_inspected_image_source_bytes
BEFORE UPDATE ON inspected_image_source_content
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE INDEX IF NOT EXISTS inspected_image_source_content_expiry
    ON inspected_image_source_content(expires_at, source_id);

CREATE INDEX IF NOT EXISTS inspected_image_sources_workspace_active
    ON inspected_image_sources(organization_id, project_id, expires_at, id);

CREATE OR REPLACE FUNCTION niu_purge_inspected_image_page() RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    candidate RECORD;
    removed BIGINT := 0;
    affected BIGINT;
BEGIN
    FOR candidate IN
        SELECT c.source_id AS id
        FROM inspected_image_source_content c
        JOIN inspected_image_sources s ON s.id = c.source_id
        LEFT JOIN inspected_image_cleanup_retries r ON r.source_id = c.source_id
        WHERE c.expires_at <= now()
          AND (r.retry_after IS NULL OR r.retry_after <= now())
        ORDER BY c.expires_at, c.source_id
        LIMIT 16
        FOR UPDATE OF s SKIP LOCKED
    LOOP
        BEGIN
            INSERT INTO inspected_image_source_erasures(source_id)
            VALUES(candidate.id) ON CONFLICT DO NOTHING;
            DELETE FROM inspected_image_source_content WHERE source_id = candidate.id;
            GET DIAGNOSTICS affected = ROW_COUNT;
            removed := removed + affected;
        EXCEPTION
            WHEN integrity_constraint_violation OR data_exception OR raise_exception THEN
                INSERT INTO inspected_image_cleanup_retries(source_id, retry_after)
                VALUES(candidate.id, clock_timestamp() + interval '60 seconds')
                ON CONFLICT(source_id) DO UPDATE SET retry_after = EXCLUDED.retry_after;
        END;
    END LOOP;
    RETURN removed;
END;
$$;

ALTER TABLE asset_image_ingestion_claims
    ADD COLUMN IF NOT EXISTS resolved BOOLEAN NOT NULL DEFAULT FALSE;

DROP TRIGGER IF EXISTS immutable_asset_image_ingestion_claim ON asset_image_ingestion_claims;

UPDATE asset_image_ingestion_claims c
SET resolved = TRUE
WHERE NOT c.resolved
  AND EXISTS (
      SELECT 1 FROM asset_image_ingestion_outcomes o
      WHERE o.consent_id = c.consent_id
  );

CREATE OR REPLACE FUNCTION guard_asset_image_ingestion_claim() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'accounting records are immutable';
    END IF;
    IF NEW.consent_id = OLD.consent_id
       AND NEW.created_at = OLD.created_at
       AND OLD.resolved = FALSE
       AND NEW.resolved = TRUE
       AND EXISTS (
           SELECT 1 FROM asset_image_ingestion_outcomes o
           WHERE o.consent_id = NEW.consent_id
       ) THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'accounting records are immutable';
END;
$$;

CREATE TRIGGER immutable_asset_image_ingestion_claim
BEFORE UPDATE OR DELETE ON asset_image_ingestion_claims
FOR EACH ROW EXECUTE FUNCTION guard_asset_image_ingestion_claim();

CREATE OR REPLACE FUNCTION mark_asset_image_ingestion_claim_resolved() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE asset_image_ingestion_claims
    SET resolved = TRUE
    WHERE consent_id = NEW.consent_id
      AND NOT resolved;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resolve_asset_image_ingestion_claim ON asset_image_ingestion_outcomes;
CREATE TRIGGER resolve_asset_image_ingestion_claim
AFTER INSERT ON asset_image_ingestion_outcomes
FOR EACH ROW EXECUTE FUNCTION mark_asset_image_ingestion_claim_resolved();

CREATE INDEX IF NOT EXISTS asset_image_ingestion_claims_unresolved
    ON asset_image_ingestion_claims(created_at, consent_id)
    WHERE NOT resolved;

-- @niu-legacy-migration 0340_verification_session_retention_and_recovery.sql 5740
-- Allow purging verification session ciphertexts once terminal or expired,
-- recover stale 'resolving' query claims, and index active verification
-- ciphertexts (#27 #134).

CREATE OR REPLACE FUNCTION preserve_workspace_provider_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.status<>'prepared' OR NEW.ciphertext IS NOT NULL OR NEW.group_id IS NOT NULL OR NEW.expires_at IS NOT NULL THEN
     RAISE EXCEPTION 'Verification starts as an unsubmitted intent' USING ERRCODE='23514'; END IF;
   RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Verification history is durable' USING ERRCODE='23514'; END IF;
 IF niu_authorized_encryption_rewrap(TG_TABLE_NAME,'ciphertext',to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
 IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.project_id<>OLD.project_id
    OR NEW.key_id<>OLD.key_id OR NEW.vendor_id<>OLD.vendor_id OR NEW.vendor_revision<>OLD.vendor_revision
    OR NEW.model_alias<>OLD.model_alias OR NEW.model_revision<>OLD.model_revision OR NEW.upstream_model<>OLD.upstream_model
    OR NEW.idempotency_key<>OLD.idempotency_key OR NEW.request_sha256<>OLD.request_sha256
    OR NEW.subject_name IS DISTINCT FROM OLD.subject_name OR NEW.created_at<>OLD.created_at
    OR NEW.updated_at<OLD.updated_at THEN RAISE EXCEPTION 'Verification identity is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS DISTINCT FROM OLD.ciphertext THEN
   IF NOT (NEW.ciphertext IS NULL AND (
       NEW.status IN ('verified','failed','expired','not_sent')
       OR (OLD.expires_at IS NOT NULL AND OLD.expires_at <= clock_timestamp())
   )) THEN
     RAISE EXCEPTION 'Verification envelope permits authorized rotation only' USING ERRCODE='23514';
   END IF;
 END IF;
 IF OLD.expires_at IS NOT NULL AND NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
   RAISE EXCEPTION 'Verification expiry is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.group_id IS NOT NULL AND NEW.group_id IS DISTINCT FROM OLD.group_id THEN
   RAISE EXCEPTION 'Verified group binding is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status IN ('verified','failed','expired','not_sent') AND NEW.status<>OLD.status THEN
   RAISE EXCEPTION 'Terminal verification cannot be revived' USING ERRCODE='23514'; END IF;
 IF OLD.status='prepared' AND NEW.status NOT IN ('prepared','unknown') THEN
   RAISE EXCEPTION 'Verification must claim before dispatch' USING ERRCODE='23514'; END IF;
 IF NEW.status='verified' AND NOT EXISTS(SELECT 1 FROM workspace_provider_asset_groups g
    WHERE g.id=NEW.group_id AND g.organization_id=NEW.organization_id AND g.project_id=NEW.project_id
      AND g.vendor_id=NEW.vendor_id AND g.vendor_revision=NEW.vendor_revision AND g.model_alias=NEW.model_alias
      AND g.model_revision=NEW.model_revision AND g.upstream_model=NEW.upstream_model AND g.kind='person' AND g.provider_ref IS NOT NULL) THEN
   RAISE EXCEPTION 'Verified group must retain original scope and account' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;

CREATE INDEX IF NOT EXISTS workspace_provider_verification_retention
    ON workspace_provider_verification_sessions(expires_at, id)
    WHERE ciphertext IS NOT NULL;

CREATE INDEX IF NOT EXISTS workspace_provider_verification_resolving
    ON workspace_provider_verification_sessions(updated_at, id)
    WHERE status = 'resolving';

CREATE OR REPLACE FUNCTION niu_purge_workspace_provider_verification_page() RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    recovered BIGINT := 0;
    purged BIGINT := 0;
BEGIN
    WITH stale_resolving AS (
        SELECT id
        FROM workspace_provider_verification_sessions
        WHERE status = 'resolving'
          AND updated_at <= clock_timestamp() - interval '60 seconds'
        ORDER BY updated_at, id
        LIMIT 16
        FOR UPDATE SKIP LOCKED
    )
    UPDATE workspace_provider_verification_sessions s
    SET status = CASE
            WHEN s.expires_at IS NOT NULL AND s.expires_at <= clock_timestamp() THEN 'expired'
            ELSE s.query_previous_status
        END,
        ciphertext = CASE
            WHEN s.expires_at IS NOT NULL AND s.expires_at <= clock_timestamp() THEN NULL
            ELSE s.ciphertext
        END,
        query_previous_status = NULL,
        updated_at = GREATEST(s.updated_at, clock_timestamp())
    FROM stale_resolving
    WHERE s.id = stale_resolving.id;
    GET DIAGNOSTICS recovered = ROW_COUNT;

    WITH expired_or_terminal AS (
        SELECT id
        FROM workspace_provider_verification_sessions
        WHERE ciphertext IS NOT NULL
          AND (
              status IN ('verified', 'failed', 'expired', 'not_sent')
              OR (
                  expires_at IS NOT NULL
                  AND expires_at <= clock_timestamp()
                  AND status IN ('waiting_user', 'processing', 'unknown', 'resolving')
              )
          )
        ORDER BY expires_at NULLS FIRST, id
        LIMIT 16
        FOR UPDATE SKIP LOCKED
    )
    UPDATE workspace_provider_verification_sessions s
    SET status = CASE
            WHEN s.status IN ('waiting_user', 'processing', 'unknown', 'resolving')
                 AND s.expires_at IS NOT NULL
                 AND s.expires_at <= clock_timestamp() THEN 'expired'
            ELSE s.status
        END,
        query_previous_status = CASE
            WHEN s.status = 'resolving' THEN NULL
            ELSE s.query_previous_status
        END,
        ciphertext = NULL,
        updated_at = GREATEST(s.updated_at, clock_timestamp())
    FROM expired_or_terminal
    WHERE s.id = expired_or_terminal.id;
    GET DIAGNOSTICS purged = ROW_COUNT;

    RETURN recovered + purged;
END;
$$;

-- @niu-legacy-migration 0341_consolidate_customer_balance_allocation_triggers.sql 13500
-- Consolidate dual AFTER INSERT customer_balance_entries allocation triggers
-- (allocate_customer_balance_consumption and allocate_customer_credit_sources)
-- and add partial indexes for positive adjustment and reversal lookups (#27 #135).

CREATE INDEX IF NOT EXISTS customer_balance_entries_account_positive_adjustments
    ON customer_balance_entries(account_id, id)
    WHERE kind = 'adjustment' AND amount_nanos > 0;

CREATE INDEX IF NOT EXISTS customer_balance_entries_reverses_entry
    ON customer_balance_entries(reverses_entry_id, id)
    INCLUDE (amount_nanos)
    WHERE reverses_entry_id IS NOT NULL;

CREATE OR REPLACE FUNCTION validate_customer_balance_consumption_allocation() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF current_setting('niu.verified_consumption_allocation_entry', true) = NEW.entry_id::text THEN
        PERFORM set_config('niu.verified_consumption_allocation_entry', '', true);
        RETURN NEW;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM customer_balance_entries e
        WHERE e.id = NEW.entry_id AND e.organization_id = NEW.organization_id
          AND e.account_id = NEW.account_id AND e.currency = NEW.currency
          AND e.kind = NEW.kind
          AND e.amount_nanos::numeric = CASE WHEN NEW.kind = 'charge'
              THEN -NEW.nominal_nanos::numeric ELSE NEW.nominal_nanos::numeric END
          AND e.reverses_entry_id IS NOT DISTINCT FROM NEW.source_charge_entry_id
    ) THEN
        RAISE EXCEPTION 'consumption allocation requires an exact scoped balance entry'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.kind = 'refund' AND NOT EXISTS (
        SELECT 1 FROM customer_balance_entries e
        WHERE e.id = NEW.source_charge_entry_id AND e.organization_id = NEW.organization_id
          AND e.account_id = NEW.account_id AND e.currency = NEW.currency AND e.kind = 'charge'
    ) THEN
        RAISE EXCEPTION 'refund allocation requires its original scoped charge'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_customer_grant_credit_restoration() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE available NUMERIC; needed NUMERIC; recorded NUMERIC; original UUID;
BEGIN
    IF current_setting('niu.verified_grant_credit_restoration_refund', true) = NEW.refund_entry_id::text THEN
        RETURN NEW;
    END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT e.reverses_entry_id INTO STRICT original FROM customer_balance_entries e
        WHERE e.id=NEW.refund_entry_id AND e.organization_id=NEW.organization_id AND e.account_id=NEW.account_id
          AND e.currency=NEW.currency AND e.kind='refund';
    SELECT a.amount_nanos::numeric-COALESCE((SELECT sum(r.amount_nanos::numeric)
        FROM customer_grant_credit_refund_restorations r WHERE r.application_id=a.id),0)
        INTO STRICT available FROM customer_grant_credit_applications a
        WHERE a.id=NEW.application_id AND a.organization_id=NEW.organization_id AND a.account_id=NEW.account_id
          AND a.currency=NEW.currency AND a.charge_entry_id=original;
    SELECT COALESCE(sum(amount_nanos::numeric),0) INTO recorded FROM customer_grant_credit_refund_restorations
        WHERE refund_entry_id=NEW.refund_entry_id;
    needed:=niu_customer_late_refund_quantity(NEW.refund_entry_id);
    IF needed IS NULL OR available<NEW.amount_nanos OR recorded+NEW.amount_nanos>needed THEN
        RAISE EXCEPTION 'Late gift restoration exceeds its exact application or refund' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_customer_credit_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected RECORD;
BEGIN
    IF current_setting('niu.verified_credit_source_entry', true) = NEW.entry_id::text THEN
        PERFORM set_config('niu.verified_credit_source_entry', '', true);
        RETURN NEW;
    END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    IF NOT EXISTS(SELECT 1 FROM customer_balance_consumption_allocations a JOIN customer_balance_entries e ON e.id=a.entry_id
        WHERE a.entry_id=NEW.entry_id AND a.organization_id=NEW.organization_id AND a.account_id=NEW.account_id
          AND a.currency=NEW.currency AND a.kind=NEW.kind AND a.nominal_nanos=NEW.nominal_nanos
          AND e.kind=NEW.kind AND e.amount_nanos::numeric=(CASE WHEN NEW.kind='charge' THEN -NEW.nominal_nanos::numeric ELSE NEW.nominal_nanos::numeric END)
          AND e.reverses_entry_id IS NOT DISTINCT FROM NEW.source_charge_entry_id) THEN
        RAISE EXCEPTION 'Credit source requires exact scoped consumption' USING ERRCODE='23514';
    END IF;
    SELECT * INTO STRICT expected FROM niu_customer_credit_source_split(NEW.entry_id);
    IF NEW.nongift_nanos IS DISTINCT FROM expected.nongift_nanos OR NEW.cash_nanos IS DISTINCT FROM expected.cash_nanos
        OR NEW.credit_nanos IS DISTINCT FROM expected.credit_nanos OR NEW.source_coverage<>expected.source_coverage THEN
        RAISE EXCEPTION 'Credit source differs from deterministic cash and unpaid-credit split' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS allocate_customer_credit_sources ON customer_balance_entries;

CREATE OR REPLACE FUNCTION allocate_customer_balance_consumption() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE nominal BIGINT; explicit_gift BIGINT:=0; nongift BIGINT; pool NUMERIC; refunded_nominal NUMERIC;
    original_amount NUMERIC; original customer_balance_consumption_allocations%ROWTYPE;
    original_credit customer_credit_sources%ROWTYPE;
    previous_gift NUMERIC; previous_late NUMERIC; base_remaining NUMERIC; late_remaining NUMERIC;
    late_to_restore NUMERIC:=0; target RECORD; amount BIGINT; coverage TEXT:='known';
    cash_pool NUMERIC; owed NUMERIC; paid NUMERIC; repayment NUMERIC; refunded_cash NUMERIC;
    cash_nanos BIGINT; credit_nanos BIGINT; credit_coverage TEXT:='legacy_unknown';
BEGIN
    IF NEW.kind NOT IN ('charge','refund') THEN RETURN NEW; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id
        AND currency=NEW.currency FOR NO KEY UPDATE;
    nominal:=abs(NEW.amount_nanos::numeric)::bigint;
    IF NEW.kind='charge' THEN
        pool:=niu_customer_explicit_gift_pool(NEW.account_id);
        IF pool<0 THEN RAISE EXCEPTION 'Explicit gift pool is inconsistent' USING ERRCODE='23514'; END IF;
        explicit_gift:=LEAST(nominal::numeric,pool)::bigint;
        IF EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.account_id=NEW.account_id AND e.kind='adjustment'
            AND e.amount_nanos>0 AND NOT EXISTS(SELECT 1 FROM customer_balance_grants g WHERE g.entry_id=e.id)) THEN
            coverage:='legacy_unknown';
        END IF;
    ELSE
        SELECT -e.amount_nanos::numeric INTO original_amount FROM customer_balance_entries e
            WHERE e.id=NEW.reverses_entry_id AND e.organization_id=NEW.organization_id AND e.account_id=NEW.account_id
              AND e.currency=NEW.currency AND e.kind='charge';
        SELECT COALESCE(sum(e.amount_nanos::numeric),0) INTO refunded_nominal FROM customer_balance_entries e
            WHERE e.reverses_entry_id=NEW.reverses_entry_id AND e.id<>NEW.id;
        IF original_amount IS NULL OR refunded_nominal+nominal>original_amount THEN
            RAISE EXCEPTION 'Refund exceeds original scoped consumption' USING ERRCODE='23514';
        END IF;
        SELECT * INTO original FROM customer_balance_consumption_allocations WHERE entry_id=NEW.reverses_entry_id;
        IF NOT FOUND THEN coverage:='legacy_unknown';
        ELSE
            SELECT COALESCE(sum(a.explicit_gift_nanos::numeric),0) INTO previous_gift
                FROM customer_balance_consumption_allocations a WHERE a.kind='refund' AND a.source_charge_entry_id=original.entry_id;
            SELECT COALESCE(sum(r.amount_nanos::numeric),0) INTO previous_late
                FROM customer_grant_credit_refund_restorations r JOIN customer_balance_entries e ON e.id=r.refund_entry_id
                WHERE e.reverses_entry_id=original.entry_id;
            base_remaining:=original.explicit_gift_nanos::numeric-(previous_gift-previous_late);
            SELECT COALESCE(sum(a.amount_nanos::numeric),0)-previous_late INTO late_remaining
                FROM customer_grant_credit_applications a WHERE a.charge_entry_id=original.entry_id;
            IF base_remaining<0 OR late_remaining<0 THEN
                RAISE EXCEPTION 'Refund gift sources exceed original consumption or applications' USING ERRCODE='23514';
            END IF;
            explicit_gift:=LEAST(nominal::numeric,base_remaining+late_remaining)::bigint;
            late_to_restore:=GREATEST(0,explicit_gift::numeric-base_remaining);
            coverage:=original.source_coverage;
        END IF;
    END IF;
    nongift:=CASE WHEN coverage='known' THEN nominal-explicit_gift ELSE NULL END;
    PERFORM set_config('niu.verified_consumption_allocation_entry', NEW.id::text, true);
    INSERT INTO customer_balance_consumption_allocations(entry_id,organization_id,account_id,currency,kind,nominal_nanos,
        explicit_gift_nanos,gift_nanos,nongift_nanos,source_coverage,source_charge_entry_id)
    VALUES(NEW.id,NEW.organization_id,NEW.account_id,NEW.currency,NEW.kind,nominal,explicit_gift,
        CASE WHEN coverage='known' THEN explicit_gift ELSE NULL END,
        nongift,coverage,NEW.reverses_entry_id);
    PERFORM set_config('niu.verified_consumption_allocation_entry', '', true);
    IF late_to_restore>0 THEN
        PERFORM set_config('niu.verified_grant_credit_restoration_refund', NEW.id::text, true);
        FOR target IN SELECT a.id,a.amount_nanos::numeric-COALESCE((SELECT sum(r.amount_nanos::numeric)
            FROM customer_grant_credit_refund_restorations r WHERE r.application_id=a.id),0) AS available
            FROM customer_grant_credit_applications a WHERE a.charge_entry_id=NEW.reverses_entry_id ORDER BY a.created_at,a.id
        LOOP
            IF target.available<0 THEN RAISE EXCEPTION 'Late gift restoration is inconsistent' USING ERRCODE='23514'; END IF;
            amount:=LEAST(late_to_restore,target.available)::bigint;
            IF amount>0 THEN
                INSERT INTO customer_grant_credit_refund_restorations(refund_entry_id,application_id,organization_id,account_id,currency,amount_nanos)
                VALUES(NEW.id,target.id,NEW.organization_id,NEW.account_id,NEW.currency,amount);
                late_to_restore:=late_to_restore-amount;
            END IF;
            EXIT WHEN late_to_restore=0;
        END LOOP;
        PERFORM set_config('niu.verified_grant_credit_restoration_refund', '', true);
        IF late_to_restore<>0 THEN RAISE EXCEPTION 'Late gift refund could not restore its exact sources' USING ERRCODE='23514'; END IF;
    END IF;

    -- Inline credit-source allocation in the same trigger pass without
    -- re-querying customer_balance_consumption_allocations or re-locking the account.
    cash_nanos:=NULL;
    credit_nanos:=NULL;
    credit_coverage:='legacy_unknown';
    IF coverage='known' AND niu_customer_credit_account_covered(NEW.account_id,NEW.id) THEN
        IF NEW.kind='charge' THEN
            cash_pool:=niu_customer_verified_prepaid_cash(NEW.account_id);
            IF cash_pool<0 THEN RAISE EXCEPTION 'Verified prepaid cash pool is inconsistent' USING ERRCODE='23514'; END IF;
            cash_nanos:=LEAST(cash_pool,nongift::numeric)::bigint;
            credit_nanos:=nongift-cash_nanos;
            credit_coverage:='known';
        ELSE
            SELECT * INTO original_credit FROM customer_credit_sources WHERE entry_id=NEW.reverses_entry_id;
            IF FOUND AND original_credit.source_coverage='known' THEN
                owed:=niu_customer_unpaid_credit(original_credit.entry_id);
                SELECT COALESCE(sum(r.cash_nanos::numeric),0) INTO refunded_cash FROM customer_credit_sources r
                    WHERE r.kind='refund' AND r.source_charge_entry_id=original_credit.entry_id;
                SELECT COALESCE(sum(r.amount_nanos::numeric),0) INTO repayment FROM customer_credit_repayments r
                    WHERE r.charge_entry_id=original_credit.entry_id;
                paid:=original_credit.cash_nanos::numeric+repayment-refunded_cash;
                IF owed IS NULL OR owed<0 OR paid<0 OR nongift::numeric>owed+paid THEN
                    RAISE EXCEPTION 'Refund exceeds remaining credit or paid cash after gift allowance' USING ERRCODE='23514';
                END IF;
                credit_nanos:=LEAST(owed,nongift::numeric)::bigint;
                cash_nanos:=nongift-credit_nanos;
                credit_coverage:='known';
            END IF;
        END IF;
    END IF;
    PERFORM set_config('niu.verified_credit_source_entry', NEW.id::text, true);
    INSERT INTO customer_credit_sources(entry_id,organization_id,account_id,currency,kind,nominal_nanos,
        nongift_nanos,cash_nanos,credit_nanos,source_coverage,source_charge_entry_id)
    VALUES(NEW.id,NEW.organization_id,NEW.account_id,NEW.currency,NEW.kind,nominal,
        nongift,cash_nanos,credit_nanos,credit_coverage,NEW.reverses_entry_id);
    PERFORM set_config('niu.verified_credit_source_entry', '', true);
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0342_agent_traces_and_codex_cascade_indexes.sql 431
-- Add foreign-key cascade indexes on personal_agent_traces(superseded_by) and
-- codex_usage_responses(organization_id, project_id, import_id) (#27 #136).

CREATE INDEX IF NOT EXISTS personal_agent_traces_superseded_by
    ON personal_agent_traces(superseded_by)
    WHERE superseded_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS codex_usage_responses_by_import
    ON codex_usage_responses(organization_id, project_id, import_id);

-- @niu-legacy-migration 0343_project_fk_and_collector_key_indexes.sql 529
-- Index project foreign keys on operator_audit_events, customer_billing_audit,
-- and collector_keys (#27 #137).

CREATE INDEX IF NOT EXISTS operator_audit_events_by_project
    ON operator_audit_events(organization_id, project_id)
    WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS customer_billing_audit_by_project
    ON customer_billing_audit(organization_id, project_id);

CREATE INDEX IF NOT EXISTS collector_keys_by_project_created
    ON collector_keys(organization_id, project_id, created_at DESC, id DESC);

-- @niu-legacy-migration 0344_hot_query_composite_indexes.sql 1063
-- Add composite indexes for chat_sessions pagination, quota_observations,
-- execution_imports, account_assignments, and dispatched attempts (#27 #138).

CREATE INDEX IF NOT EXISTS chat_sessions_owner_archived_created_idx
    ON chat_sessions(organization_id, project_id, owner, archived, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS chat_sessions_project_created_idx
    ON chat_sessions(organization_id, project_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS quota_observations_by_project
    ON quota_observations(organization_id, project_id);

CREATE INDEX IF NOT EXISTS execution_imports_by_project_imported
    ON execution_imports(organization_id, project_id, imported_at DESC, id);

CREATE INDEX IF NOT EXISTS account_assignments_by_project_account
    ON account_assignments(organization_id, project_id, account_id, attempt_id);

CREATE INDEX IF NOT EXISTS attempts_by_project_dispatched
    ON attempts(organization_id, project_id, dispatched_at, id)
    WHERE dispatched_at IS NOT NULL AND execution <> 'confirmed_not_executed';

-- @niu-legacy-migration 0345_native_operation_diagnostics.sql 1785
-- Existing uncertainty remains truthful: no category is inferred for old records.
ALTER TABLE workspace_provider_asset_operations ADD COLUMN diagnostic JSONB
 CHECK (diagnostic IS NULL OR ((
   jsonb_typeof(diagnostic)='object'
   AND diagnostic ?& ARRAY['category','phase']
   AND diagnostic-'category'-'phase'='{}'::jsonb
   AND diagnostic->>'category' IN ('transport','timeout','response_too_large','invalid_response','upstream_rejected')
   AND diagnostic->>'phase' IN ('exchange','response','acknowledgement')
 ) IS TRUE));

CREATE OR REPLACE FUNCTION preserve_workspace_provider_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'http_status'-'request_id'-'diagnostic'-'updated_at')
    IS DISTINCT FROM (to_jsonb(OLD)-'status'-'http_status'-'request_id'-'diagnostic'-'updated_at') THEN
    RAISE EXCEPTION 'Provider mutation identity is immutable' USING ERRCODE='23514'; END IF;
 -- Only completion of an already claimed operation can attach a first diagnostic.
 -- Once retained, it survives all later status transitions and cannot be rewritten.
 IF NEW.diagnostic IS DISTINCT FROM OLD.diagnostic
    AND (OLD.status<>'unknown' OR OLD.diagnostic IS NOT NULL OR NEW.status<>'unknown') THEN
    RAISE EXCEPTION 'Provider mutation diagnostic is immutable' USING ERRCODE='23514'; END IF;
 IF NOT ((OLD.status='prepared' AND NEW.status IN ('unknown','not_sent')) OR
         (OLD.status='unknown' AND NEW.status IN ('unknown','acknowledged','not_sent')) OR
         (NEW.status=OLD.status AND NEW.http_status IS NOT DISTINCT FROM OLD.http_status AND NEW.request_id IS NOT DISTINCT FROM OLD.request_id)) THEN
    RAISE EXCEPTION 'Provider mutation outcome cannot be replayed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;

-- @niu-legacy-migration 0346_native_operation_key_context_index.sql 139
CREATE INDEX workspace_provider_operation_key_context
 ON workspace_provider_asset_operations(organization_id,project_id,key_id,group_id);

-- @niu-legacy-migration 0347_procurement_configuration_audit.sql 1819
-- Safe operation metadata only; no prices, amounts or credential references.
-- Existing records are not backfilled with invented actors or timestamps.
CREATE TABLE procurement_configuration_events (
 id BIGSERIAL PRIMARY KEY,
 organization_id UUID NOT NULL,
 project_id UUID NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('procurement_budget_created','upstream_account_registered')),
 account_id UUID,
 actor_kind TEXT NOT NULL CHECK(actor_kind IN ('installation','operator','unknown')),
 actor_operator_id UUID REFERENCES admin_operators(id),
 target_label TEXT NOT NULL CHECK(char_length(target_label) BETWEEN 1 AND 512),
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id),
 FOREIGN KEY(organization_id,project_id,account_id) REFERENCES supplier_accounts(organization_id,project_id,id),
 CHECK((actor_kind='operator')=(actor_operator_id IS NOT NULL)),
 CHECK((action='upstream_account_registered')=(account_id IS NOT NULL))
);
CREATE INDEX procurement_configuration_events_page ON procurement_configuration_events(created_at DESC,id DESC);
CREATE INDEX procurement_configuration_events_actor ON procurement_configuration_events(actor_operator_id);
CREATE INDEX procurement_configuration_events_workspace ON procurement_configuration_events(organization_id,project_id);
CREATE UNIQUE INDEX procurement_configuration_budget_event ON procurement_configuration_events(organization_id,project_id)
 WHERE action='procurement_budget_created';
CREATE UNIQUE INDEX procurement_configuration_account_event ON procurement_configuration_events(account_id);
CREATE TRIGGER preserve_procurement_configuration_events BEFORE UPDATE OR DELETE ON procurement_configuration_events
 FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0348_provider_membership_audit_context.sql 332
-- Snapshot future access-change context; retain unknown historical attribution.
ALTER TABLE provider_audit_events
 ADD COLUMN provider_label TEXT,
 ADD COLUMN affected_member_label TEXT,
 ADD COLUMN before_role TEXT CHECK(before_role IN ('manager','viewer')),
 ADD COLUMN after_role TEXT CHECK(after_role IN ('manager','viewer'));

-- @niu-legacy-migration 0349_procurement_readiness_error.sql 7554
-- Separate platform procurement readiness from customer balance exhaustion.
-- Preserve the existing atomic reservation, authorization and dispatch checks.
CREATE OR REPLACE FUNCTION niu_reserve_and_dispatch_gateway(
    p_organization_id UUID,
    p_project_id UUID,
    p_key_id UUID,
    p_attempt_id UUID,
    p_price_revision_id UUID,
    p_resource_id TEXT,
    p_offer_revision TEXT,
    p_prompt_bound BIGINT,
    p_completion_bound BIGINT
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    account_eligible BOOLEAN;
    attempt_row RECORD;
    price_row RECORD;
    computed_amount NUMERIC;
    changed BIGINT;
BEGIN
    IF p_prompt_bound < 0 OR p_completion_bound < 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0009', MESSAGE = 'invalid token bound';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||p_organization_id::text||':'||p_project_id::text,0));

    -- Revocation, expiry, model permission and project budget creation all
    -- synchronize with this admission before it allocates funds.
    PERFORM k.id
      FROM api_keys k
      JOIN projects p ON p.organization_id=k.organization_id AND p.id=k.project_id
     WHERE k.id=p_key_id
       AND k.organization_id=p_organization_id
       AND k.project_id=p_project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND ('*'=ANY(k.allowed_models) OR p_resource_id=ANY(k.allowed_models))
     FOR SHARE OF k, p;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
    END IF;

    SELECT a.health='ready'
           AND a.refresh_owner IS NULL
           AND a.credential_revision=s.credential_revision
      INTO account_eligible
      FROM account_assignments s
      JOIN supplier_accounts a
        ON a.organization_id=s.organization_id
       AND a.project_id=s.project_id
       AND a.id=s.account_id
     WHERE s.organization_id=p_organization_id
       AND s.project_id=p_project_id
       AND s.attempt_id=p_attempt_id
     FOR SHARE OF s, a;
    IF FOUND AND account_eligible IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION USING ERRCODE = 'P0007', MESSAGE = 'supplier account is unavailable';
    END IF;

    SELECT a.execution, a.resource_id, a.offer_revision, o.model_alias
      INTO attempt_row
      FROM attempts a
      JOIN operations o
        ON o.organization_id=a.organization_id
       AND o.project_id=a.project_id
       AND o.id=a.operation_id
     WHERE a.organization_id=p_organization_id
       AND a.project_id=p_project_id
       AND a.id=p_attempt_id
       AND o.model_alias=p_resource_id
     FOR UPDATE OF a;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt does not exist';
    END IF;
    IF attempt_row.execution <> 'not_sent'
       OR attempt_row.resource_id <> p_resource_id
       OR attempt_row.offer_revision <> p_offer_revision THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt conflicts with admission';
    END IF;

    SELECT currency, cash_prompt_rate, cash_completion_rate
      INTO price_row
      FROM price_revisions
     WHERE organization_id=p_organization_id
       AND project_id=p_project_id
       AND id=p_price_revision_id
       AND resource_id=p_resource_id
       AND offer_revision=p_offer_revision;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'price revision does not match route';
    END IF;

    IF EXISTS (SELECT 1 FROM cost_reservations WHERE attempt_id=p_attempt_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt already has a reservation';
    END IF;

    computed_amount := ceil((
        price_row.cash_prompt_rate::NUMERIC * p_prompt_bound::NUMERIC
        + price_row.cash_completion_rate::NUMERIC * p_completion_bound::NUMERIC
    ) / 1000000);
    IF computed_amount > 9223372036854775807::NUMERIC THEN
        RAISE EXCEPTION USING ERRCODE = 'P0009', MESSAGE = 'reservation exceeds supported amount';
    END IF;

    UPDATE project_budgets
       SET reserved_nanos=reserved_nanos + computed_amount::BIGINT
     WHERE organization_id=p_organization_id
       AND project_id=p_project_id
       AND currency=price_row.currency
       AND limit_nanos::NUMERIC - spent_nanos::NUMERIC - reserved_nanos::NUMERIC >= computed_amount
       AND EXISTS (
           SELECT 1 FROM api_keys k
            WHERE k.id=p_key_id
              AND k.organization_id=p_organization_id
              AND k.project_id=p_project_id
              AND k.revoked_at IS NULL
              AND k.expires_at > clock_timestamp()
              AND ('*'=ANY(k.allowed_models) OR p_resource_id=ANY(k.allowed_models))
       );
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
        IF NOT EXISTS (
            SELECT 1 FROM api_keys k
             WHERE k.id=p_key_id
               AND k.organization_id=p_organization_id
               AND k.project_id=p_project_id
               AND k.revoked_at IS NULL
               AND k.expires_at > clock_timestamp()
               AND ('*'=ANY(k.allowed_models) OR p_resource_id=ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
        END IF;
        RAISE EXCEPTION USING ERRCODE = 'P0039', MESSAGE = 'platform procurement is unavailable';
    END IF;

    INSERT INTO cost_reservations
        (attempt_id, organization_id, project_id, price_revision_id,
         reserved_nanos, prompt_bound, completion_bound)
    VALUES
        (p_attempt_id, p_organization_id, p_project_id, p_price_revision_id,
         computed_amount::BIGINT, p_prompt_bound, p_completion_bound);

    UPDATE attempts a
       SET execution='may_have_executed',
           dispatched_at=clock_timestamp(),
           api_key_id=p_key_id
     WHERE a.organization_id=p_organization_id
       AND a.project_id=p_project_id
       AND a.id=p_attempt_id
       AND a.execution='not_sent'
       AND EXISTS (
           SELECT 1 FROM api_keys k
            WHERE k.id=p_key_id
              AND k.organization_id=p_organization_id
              AND k.project_id=p_project_id
              AND ('*'=ANY(k.allowed_models) OR a.resource_id=ANY(k.allowed_models))
              AND k.revoked_at IS NULL
              AND k.expires_at > clock_timestamp()
       )
       AND NOT EXISTS (
           SELECT 1 FROM account_assignments s
            WHERE s.organization_id=p_organization_id
              AND s.project_id=p_project_id
              AND s.attempt_id=a.id
              AND s.state <> 'held'
       )
       AND EXISTS (
           SELECT 1 FROM cost_reservations r
            WHERE r.organization_id=p_organization_id
              AND r.project_id=p_project_id
              AND r.attempt_id=a.id
              AND r.state='held'
       );
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
        IF NOT EXISTS (
            SELECT 1 FROM api_keys k
             WHERE k.id=p_key_id
               AND k.organization_id=p_organization_id
               AND k.project_id=p_project_id
               AND k.revoked_at IS NULL
               AND k.expires_at > clock_timestamp()
               AND ('*'=ANY(k.allowed_models) OR p_resource_id=ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
        END IF;
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt changed during admission';
    END IF;
END;
$$;

-- @niu-legacy-migration 0350_unused_noncash_gift_corrections.sql 6005
-- Explicit correction of a wholly unused gift. No receipt, consumption refund,
-- revenue adjustment, policy change or historical journal rewrite.
CREATE TABLE customer_balance_grant_corrections (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    grant_id UUID NOT NULL UNIQUE REFERENCES customer_balance_grants(id),
    entry_id UUID NOT NULL UNIQUE,
    amount_nanos BIGINT NOT NULL CHECK(amount_nanos>0),
    noncash_offset_nanos BIGINT NOT NULL CHECK(noncash_offset_nanos=amount_nanos),
    idempotency_key UUID NOT NULL,
    reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 500 AND reason=trim(reason) AND reason !~ '[[:cntrl:]]'),
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('installation','operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id,idempotency_key),
    FOREIGN KEY(organization_id,account_id,currency,entry_id)
        REFERENCES customer_balance_entries(organization_id,account_id,currency,id),
    CHECK((actor_kind='installation' AND actor_operator_id IS NULL) OR (actor_kind='operator' AND actor_operator_id IS NOT NULL))
);
CREATE INDEX customer_balance_grant_corrections_account ON customer_balance_grant_corrections(account_id);
CREATE INDEX customer_balance_grant_corrections_audit ON customer_balance_grant_corrections(created_at DESC,(id::text) DESC);
CREATE TRIGGER immutable_customer_balance_grant_correction BEFORE UPDATE OR DELETE ON customer_balance_grant_corrections
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION validate_unused_customer_gift_correction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original customer_balance_grants%ROWTYPE;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT * INTO original FROM customer_balance_grants WHERE id=NEW.grant_id AND organization_id=NEW.organization_id AND account_id=NEW.account_id AND currency=NEW.currency;
    IF original.id IS NULL OR original.amount_nanos<>NEW.amount_nanos
       OR EXISTS(SELECT 1 FROM customer_grant_credit_applications WHERE grant_id=original.id)
       OR EXISTS(SELECT 1 FROM customer_balance_entries WHERE account_id=NEW.account_id AND kind IN ('charge','refund'))
       OR EXISTS(SELECT 1 FROM customer_balance_reservations WHERE account_id=NEW.account_id AND released_at IS NULL)
       OR NOT niu_customer_credit_account_covered(NEW.account_id,NEW.entry_id)
       OR niu_customer_explicit_gift_pool(NEW.account_id)<NEW.amount_nanos
       OR NOT EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.id=NEW.entry_id
            AND e.organization_id=NEW.organization_id AND e.account_id=NEW.account_id AND e.currency=NEW.currency
            AND e.kind='adjustment' AND e.amount_nanos::numeric=-NEW.amount_nanos::numeric
            AND e.idempotency_key=NEW.idempotency_key AND e.reverses_entry_id IS NULL
            AND e.project_id IS NULL AND e.attempt_id IS NULL) THEN
        RAISE EXCEPTION 'Correction requires an exact wholly unused gift with known sources and no open liabilities' USING ERRCODE='P0040';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_unused_customer_gift_correction BEFORE INSERT ON customer_balance_grant_corrections
    FOR EACH ROW EXECUTE FUNCTION validate_unused_customer_gift_correction();

CREATE OR REPLACE FUNCTION niu_customer_credit_account_covered(account UUID,ignore_entry UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE SQL VOLATILE AS $$
SELECT EXISTS(SELECT 1 FROM customer_balance_accounts a WHERE a.id=account)
AND NOT EXISTS (
    SELECT 1 FROM customer_balance_entries e
    WHERE e.account_id=account AND e.id IS DISTINCT FROM ignore_entry AND (
        e.kind='funding_reversal'
        OR (e.kind IN ('charge','refund') AND NOT EXISTS (
            SELECT 1 FROM customer_credit_sources s WHERE s.entry_id=e.id AND s.source_coverage='known'))
        OR (e.kind='funding' AND NOT EXISTS (
            SELECT 1 FROM customer_funding_receipts r
            WHERE r.entry_id=e.id AND r.organization_id=e.organization_id AND r.account_id=e.account_id
              AND r.currency=e.currency AND r.amount_nanos=e.amount_nanos AND e.amount_nanos>0))
        OR (e.kind='adjustment' AND NOT EXISTS (
            SELECT 1 FROM customer_balance_grants g
            WHERE g.entry_id=e.id AND g.organization_id=e.organization_id AND g.account_id=e.account_id
              AND g.currency=e.currency AND g.amount_nanos=e.amount_nanos AND e.amount_nanos>0) AND NOT EXISTS (
            SELECT 1 FROM customer_balance_grant_corrections c WHERE c.entry_id=e.id
              AND c.organization_id=e.organization_id AND c.account_id=e.account_id AND c.currency=e.currency
              AND e.amount_nanos::numeric=-c.amount_nanos::numeric))
    )
)
AND NOT EXISTS (
    SELECT 1 FROM customer_funding_receipts r
    LEFT JOIN customer_balance_entries e ON e.id=r.entry_id
    WHERE r.account_id=account AND (e.id IS NULL OR e.kind<>'funding'
        OR e.organization_id<>r.organization_id OR e.account_id<>r.account_id
        OR e.currency<>r.currency OR e.amount_nanos<>r.amount_nanos)
);
$$;

CREATE OR REPLACE FUNCTION niu_customer_explicit_gift_pool(account UUID) RETURNS NUMERIC
LANGUAGE SQL VOLATILE AS $$
SELECT COALESCE((SELECT sum(g.amount_nanos::numeric) FROM customer_balance_grants g WHERE g.account_id=account),0)
    -COALESCE((SELECT sum(CASE WHEN a.kind='charge' THEN a.explicit_gift_nanos::numeric ELSE -a.explicit_gift_nanos::numeric END)
        FROM customer_balance_consumption_allocations a WHERE a.account_id=account),0)
    -COALESCE((SELECT sum(a.amount_nanos::numeric) FROM customer_grant_credit_applications a WHERE a.account_id=account),0)
    -COALESCE((SELECT sum(c.amount_nanos::numeric) FROM customer_balance_grant_corrections c WHERE c.account_id=account),0);
$$;
-- @niu-legacy-migration 0351_gift_correction_request_history_guard.sql 1941
-- Conservative first correction contract: no previous or pending paid requests.
-- A released legacy hold alone does not establish that later settlement is impossible.
CREATE OR REPLACE FUNCTION validate_unused_customer_gift_correction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original customer_balance_grants%ROWTYPE;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT * INTO original FROM customer_balance_grants WHERE id=NEW.grant_id AND organization_id=NEW.organization_id AND account_id=NEW.account_id AND currency=NEW.currency;
    IF original.id IS NULL OR original.amount_nanos<>NEW.amount_nanos
       OR EXISTS(SELECT 1 FROM customer_grant_credit_applications WHERE grant_id=original.id)
       OR EXISTS(SELECT 1 FROM customer_balance_entries WHERE account_id=NEW.account_id AND kind IN ('charge','refund'))
       OR EXISTS(SELECT 1 FROM customer_balance_reservations WHERE account_id=NEW.account_id AND released_at IS NULL)
       OR EXISTS(SELECT 1 FROM customer_attempt_balance_accounts WHERE account_id=NEW.account_id)
       OR NOT niu_customer_credit_account_covered(NEW.account_id,NEW.entry_id)
       OR niu_customer_explicit_gift_pool(NEW.account_id)<NEW.amount_nanos
       OR NOT EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.id=NEW.entry_id
            AND e.organization_id=NEW.organization_id AND e.account_id=NEW.account_id AND e.currency=NEW.currency
            AND e.kind='adjustment' AND e.amount_nanos::numeric=-NEW.amount_nanos::numeric
            AND e.idempotency_key=NEW.idempotency_key AND e.reverses_entry_id IS NULL
            AND e.project_id IS NULL AND e.attempt_id IS NULL) THEN
        RAISE EXCEPTION 'Correction requires an exact wholly unused gift with known sources and no open liabilities' USING ERRCODE='P0040';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0352_guardrail_rejection_detail_context.sql 921
-- Keep the released 0333 migration immutable. Apply the diagnostic context
-- and same-statement visibility correction to both upgrades and fresh installs.

CREATE OR REPLACE FUNCTION niu_guardrail_rejection_detail(org UUID, workspace UUID, key UUID, reason TEXT)
RETURNS TEXT LANGUAGE sql VOLATILE AS $$
    SELECT jsonb_build_object(
        'reason', reason,
        'organization_id', org,
        'project_id', workspace,
        'key_id', key,
        'workspace_revision', (
            SELECT NULLIF(revision, 0)
            FROM workspace_guardrail_heads
            WHERE organization_id = org AND project_id = workspace
        ),
        'key_policy_revision', a.policy_revision,
        'key_assignment_revision', a.assignment_revision
    )::text
    FROM (SELECT 1) AS one_row
    LEFT JOIN key_guardrail_assignments a
      ON a.organization_id = org AND a.project_id = workspace AND a.key_id = key;
$$;

-- @niu-legacy-migration 0353_revoke_implicit_demo_platform_access.sql 656
-- Demo sign-in is customer-scoped. Repair only the built-in account's implicit
-- platform grant; retain its password, company membership and existing sessions.
-- The schema owner records the revocation without inventing a member login.
WITH revoked AS (
    UPDATE admin_operators AS operator
    SET platform_admin = false
    FROM member_password_credentials AS credential
    WHERE credential.operator_id = operator.id
      AND credential.email = 'demo@niu.io'
      AND operator.platform_admin
    RETURNING operator.id
)
INSERT INTO platform_admin_events (operator_id, granted, actor_kind)
SELECT id, false, 'database_administrator'
FROM revoked;

-- @niu-legacy-migration 0354_architecture_stability_and_ledger_fixes.sql 10654
-- Architecture stability, key spending attribution, request-rate fast-paths,
-- and hot-path composite indexes (#85, #86, #87).

-- 1. Hot-path composite and covering indexes (#87)
CREATE INDEX IF NOT EXISTS attempts_dispatched_window_idx
    ON attempts (dispatched_at, id)
    WHERE dispatched_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS attempts_completed_window_idx
    ON attempts (completed_at, id)
    WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS attempts_may_have_executed_id_idx
    ON attempts (id)
    INCLUDE (organization_id, project_id)
    WHERE execution = 'may_have_executed';

CREATE INDEX IF NOT EXISTS media_jobs_created_attempt_idx
    ON media_jobs (created_at, attempt_id);

CREATE INDEX IF NOT EXISTS gateway_retry_policies_key_lookup_idx
    ON gateway_retry_policies (key_id, operation_id);

CREATE INDEX IF NOT EXISTS customer_balance_entries_attempt_charge_account_idx
    ON customer_balance_entries (attempt_id, account_id)
    INCLUDE (amount_nanos, id)
    WHERE kind = 'charge' AND attempt_id IS NOT NULL;

-- 2. Key spending attribution & index-friendly key committed lookup (#85, #87)
CREATE OR REPLACE FUNCTION niu_customer_attempt_spending_root(p_attempt UUID)
RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT k.spending_root_id FROM attempts a
    LEFT JOIN inspected_guardrail_bindings b ON b.attempt_id=a.id
    LEFT JOIN gateway_retry_policies rp ON rp.operation_id=a.operation_id
    JOIN api_keys k ON k.id=COALESCE(a.api_key_id,b.key_id,rp.key_id)
        AND k.organization_id=a.organization_id AND k.project_id=a.project_id
    WHERE a.id=p_attempt
$$;

CREATE OR REPLACE FUNCTION niu_customer_key_committed(p_root UUID, p_account UUID)
RETURNS NUMERIC LANGUAGE sql VOLATILE AS $$
    WITH root_keys AS MATERIALIZED (
        SELECT organization_id, project_id, id
        FROM api_keys
        WHERE spending_root_id = p_root
    ),
    root_attempts AS MATERIALIZED (
        SELECT a.id AS attempt_id
        FROM root_keys k
        JOIN attempts a
          ON a.api_key_id = k.id
         AND a.organization_id = k.organization_id
         AND a.project_id = k.project_id
        UNION
        SELECT a.id AS attempt_id
        FROM root_keys k
        JOIN inspected_guardrail_bindings b ON b.key_id = k.id
        JOIN attempts a
          ON a.id = b.attempt_id
         AND a.organization_id = k.organization_id
         AND a.project_id = k.project_id
        UNION
        SELECT a.id AS attempt_id
        FROM root_keys k
        JOIN gateway_retry_policies rp ON rp.key_id = k.id
        JOIN attempts a
          ON a.operation_id = rp.operation_id
         AND a.organization_id = k.organization_id
         AND a.project_id = k.project_id
    )
    SELECT COALESCE((
        SELECT -SUM(e.amount_nanos)
        FROM root_attempts ra
        JOIN customer_balance_entries e ON e.attempt_id = ra.attempt_id
        WHERE e.account_id = p_account
          AND e.kind = 'charge'
    ), 0)
    - COALESCE((
        SELECT SUM(r.amount_nanos)
        FROM root_attempts ra
        JOIN customer_balance_entries c ON c.attempt_id = ra.attempt_id
        JOIN customer_balance_entries r ON r.reverses_entry_id = c.id
        WHERE c.account_id = p_account
          AND c.kind = 'charge'
          AND r.account_id = p_account
          AND r.kind = 'refund'
    ), 0)
    + COALESCE((
        SELECT SUM(GREATEST(r.amount_nanos, COALESCE(m.amount_nanos, 0)))
        FROM root_attempts ra
        JOIN customer_balance_reservations r ON r.attempt_id = ra.attempt_id
        LEFT JOIN customer_media_charges m ON m.attempt_id = r.attempt_id
        WHERE r.account_id = p_account
          AND r.released_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM customer_balance_entries e
              WHERE e.attempt_id = r.attempt_id AND e.kind = 'charge'
          )
    ), 0)
$$;

-- 3. Request-rate trigger fast-path restoration (#86)
CREATE OR REPLACE FUNCTION niu_enforce_key_request_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    root UUID;
    rpm BIGINT;
    admitted BIGINT;
    checked_at TIMESTAMPTZ;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN
        RETURN NEW;
    END IF;
    SELECT spending_root_id INTO root FROM api_keys WHERE id=NEW.api_key_id;
    IF root IS NULL THEN RETURN NEW; END IF;
    PERFORM 1 FROM key_request_rate_limits
        WHERE spending_root_id=root AND requests_per_minute IS NULL FOR SHARE;
    IF FOUND THEN
        RETURN NEW;
    END IF;
    -- Lock the configured policy, not the key row: dispatch already holds key SHARE locks.
    SELECT requests_per_minute INTO rpm FROM key_request_rate_limits
        WHERE spending_root_id=root FOR UPDATE;
    IF NOT FOUND OR rpm IS NULL THEN RETURN NEW; END IF;
    IF rpm = 0 THEN
        RAISE EXCEPTION 'API key request rate is disabled' USING ERRCODE='P0026';
    END IF;
    checked_at := clock_timestamp();
    SELECT count(*) INTO admitted FROM key_request_rate_admissions
        WHERE spending_root_id=root AND admitted_at > checked_at - INTERVAL '60 seconds';
    IF admitted >= rpm THEN
        RAISE EXCEPTION 'API key request rate exhausted' USING ERRCODE='P0020';
    END IF;
    DELETE FROM key_request_rate_admissions
        WHERE spending_root_id=root AND admitted_at <= checked_at - INTERVAL '60 seconds';
    INSERT INTO key_request_rate_admissions(attempt_id,spending_root_id,admitted_at)
        VALUES(NEW.id,root,checked_at);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION niu_enforce_vendor_request_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    credential UUID;
    credentials UUID[];
    rpm BIGINT;
    checked_at TIMESTAMPTZ;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN
        RETURN NEW;
    END IF;
    -- The immutable attempt bindings identify the actual credential, never the current alias.
    SELECT array_agg(vendor_id) INTO credentials FROM (
        SELECT vendor_id FROM managed_attempt_routes WHERE attempt_id=NEW.id
        UNION SELECT vendor_id FROM personal_attempt_routes WHERE attempt_id=NEW.id
        UNION SELECT vendor_id FROM media_recovery_routes WHERE attempt_id=NEW.id
    ) bound;
    IF cardinality(credentials) > 1 THEN
        RAISE EXCEPTION 'Conflicting credential bindings' USING ERRCODE='P0024';
    END IF;
    credential := credentials[1];
    IF credential IS NULL THEN RETURN NEW; END IF;
    PERFORM 1 FROM vendor_request_rate_limits
        WHERE vendor_id=credential AND requests_per_minute IS NULL FOR SHARE;
    IF FOUND THEN
        RETURN NEW;
    END IF;
    -- Serialize policy edits and admissions without upgrading vendor SHARE locks.
    SELECT requests_per_minute INTO rpm FROM vendor_request_rate_limits
        WHERE vendor_id=credential FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credential rate policy missing' USING ERRCODE='P0024'; END IF;
    IF rpm IS NULL THEN
        RETURN NEW;
    END IF;
    IF rpm = 0 THEN
        RAISE EXCEPTION 'Upstream credential request rate is disabled' USING ERRCODE='P0027';
    END IF;
    checked_at := clock_timestamp();
    IF (SELECT count(*) FROM vendor_request_rate_admissions
        WHERE vendor_id=credential AND admitted_at > checked_at - INTERVAL '60 seconds') >= rpm THEN
        RAISE EXCEPTION 'Upstream credential request rate exhausted' USING ERRCODE='P0025';
    END IF;
    DELETE FROM vendor_request_rate_admissions WHERE vendor_id=credential
        AND admitted_at <= checked_at - INTERVAL '60 seconds';
    INSERT INTO vendor_request_rate_admissions(attempt_id,vendor_id,admitted_at)
        VALUES(NEW.id,credential,checked_at);
    RETURN NEW;
END;
$$;

-- 4. Priced dispatch rate-denial audit function (#86)
CREATE OR REPLACE FUNCTION niu_reserve_and_dispatch_gateway_audited(
    p_organization_id UUID, p_project_id UUID, p_key_id UUID, p_attempt_id UUID,
    p_price_revision_id UUID, p_resource_id TEXT, p_offer_revision TEXT,
    p_prompt_bound BIGINT, p_completion_bound BIGINT, p_audit_rate_denial BOOLEAN
) RETURNS BIGINT LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    rejection TEXT;
    metadata JSONB;
    denial_kind TEXT;
    denial_code BIGINT;
    key_name TEXT;
    key_rev BIGINT;
BEGIN
    BEGIN
        PERFORM niu_reserve_and_dispatch_gateway(p_organization_id,p_project_id,p_key_id,p_attempt_id,p_price_revision_id,p_resource_id,p_offer_revision,p_prompt_bound,p_completion_bound);
        RETURN 1;
    EXCEPTION
        WHEN SQLSTATE 'P0010' THEN
            GET STACKED DIAGNOSTICS rejection = PG_EXCEPTION_DETAIL;
            metadata := rejection::jsonb;
            INSERT INTO dispatch_guardrail_rejections(organization_id,project_id,attempt_id,key_id,reason,workspace_revision,key_policy_revision,key_assignment_revision)
            VALUES(p_organization_id,p_project_id,p_attempt_id,p_key_id,metadata->>'reason',(metadata->>'workspace_revision')::BIGINT,(metadata->>'key_policy_revision')::BIGINT,(metadata->>'key_assignment_revision')::BIGINT);
            RETURN -1;
        WHEN SQLSTATE 'P0026' THEN
            IF NOT COALESCE(p_audit_rate_denial, FALSE) THEN
                RAISE;
            END IF;
            denial_kind := 'key_request_rate_disabled';
            denial_code := -2;
        WHEN SQLSTATE 'P0020' THEN
            IF NOT COALESCE(p_audit_rate_denial, FALSE) THEN
                RAISE;
            END IF;
            denial_kind := 'key_request_rate_exceeded';
            denial_code := -3;
    END;

    SELECT name, revision INTO key_name, key_rev
    FROM api_keys
    WHERE id = p_key_id AND organization_id = p_organization_id AND project_id = p_project_id;
    IF FOUND THEN
        INSERT INTO gateway_admission_denials
            (attempt_id,organization_id,project_id,requested_key_id,requested_key_name,requested_key_revision,kind,http_status)
        VALUES (p_attempt_id,p_organization_id,p_project_id,p_key_id,key_name,key_rev,denial_kind,429)
        ON CONFLICT (attempt_id) DO NOTHING;
    END IF;
    RETURN denial_code;
END;
$$;

CREATE OR REPLACE FUNCTION niu_reserve_and_dispatch_gateway_audited(
    p_organization_id UUID, p_project_id UUID, p_key_id UUID, p_attempt_id UUID,
    p_price_revision_id UUID, p_resource_id TEXT, p_offer_revision TEXT,
    p_prompt_bound BIGINT, p_completion_bound BIGINT
) RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    RETURN niu_reserve_and_dispatch_gateway_audited(
        p_organization_id, p_project_id, p_key_id, p_attempt_id,
        p_price_revision_id, p_resource_id, p_offer_revision,
        p_prompt_bound, p_completion_bound, FALSE
    ) = 1;
END;
$$;

-- @niu-legacy-migration 0355_restore_demo_platform_admin.sql 567
-- Restore platform_admin access for the built-in demo@niu.io account so
-- platform administration (including Providers management) is accessible.
WITH granted AS (
    UPDATE admin_operators AS operator
    SET platform_admin = true
    FROM member_password_credentials AS credential
    WHERE credential.operator_id = operator.id
      AND credential.email = 'demo@niu.io'
      AND NOT operator.platform_admin
    RETURNING operator.id
)
INSERT INTO platform_admin_events (operator_id, granted, actor_kind)
SELECT id, true, 'database_administrator'
FROM granted;

-- @niu-legacy-migration 0356_workspace_slugs.sql 3271
-- Human-chosen slugs are stable URL references; internal UUIDs remain unchanged.
-- Keep previously issued URLs resolvable after replacing UUID-suffixed slugs.
CREATE TABLE workspace_slug_aliases (
    slug TEXT PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX workspace_slug_aliases_project ON workspace_slug_aliases(project_id);

CREATE FUNCTION niu_available_workspace_slug(workspace_name TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    base TEXT;
    candidate TEXT;
    suffix BIGINT := 1;
BEGIN
    -- Serialize the shared URL namespace, including explicit slug reservations.
    PERFORM pg_advisory_xact_lock(hashtextextended('niu-workspace-slugs', 0));
    base := COALESCE(NULLIF(trim(both '-' FROM left(
        regexp_replace(lower(workspace_name COLLATE "C"), '[^a-z0-9]+', '-', 'g'), 48)), ''), 'workspace');
    candidate := base;
    WHILE candidate = 'default'
        OR EXISTS(SELECT 1 FROM projects WHERE route_slug = candidate)
        OR EXISTS(SELECT 1 FROM workspace_slug_aliases WHERE slug = candidate)
    LOOP
        suffix := suffix + 1;
        candidate := trim(trailing '-' FROM left(base, 48 - length(suffix::text) - 1)) || '-' || suffix;
    END LOOP;
    RETURN candidate;
END;
$$;

ALTER TABLE projects DROP CONSTRAINT workspace_route_slug_format;
ALTER TABLE projects ADD CONSTRAINT workspace_route_slug_format
    CHECK (route_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(route_slug)<=81 AND route_slug=lower(route_slug));

ALTER TABLE projects DISABLE TRIGGER immutable_workspace_route_slug;
DO $$
DECLARE workspace RECORD;
BEGIN
    FOR workspace IN SELECT id,name,route_slug FROM projects
        WHERE right(route_slug,33) = '-' || replace(id::text,'-','')
        ORDER BY created_at,id
    LOOP
        INSERT INTO workspace_slug_aliases(slug,project_id) VALUES(workspace.route_slug,workspace.id);
        UPDATE projects SET route_slug=niu_available_workspace_slug(
            CASE WHEN workspace.name='Default project' THEN 'Default workspace' ELSE workspace.name END
        ) WHERE id=workspace.id;
    END LOOP;
END;
$$;
UPDATE projects SET name='Default workspace' WHERE name='Default project';
ALTER TABLE projects ENABLE TRIGGER immutable_workspace_route_slug;

CREATE OR REPLACE FUNCTION preserve_workspace_route_slug() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.name = 'Default project' THEN NEW.name := 'Default workspace'; END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended('niu-workspace-slugs', 0));
        IF NEW.route_slug IS NULL THEN
            NEW.route_slug := niu_available_workspace_slug(NEW.name);
        ELSE
            IF NEW.route_slug = 'default' OR length(NEW.route_slug)>48 THEN
                RAISE EXCEPTION 'invalid workspace slug' USING ERRCODE = '23514';
            END IF;
            IF EXISTS(SELECT 1 FROM workspace_slug_aliases WHERE slug=NEW.route_slug) THEN
                RAISE EXCEPTION 'workspace slug is already in use' USING ERRCODE = '23505';
            END IF;
        END IF;
    ELSIF NEW.route_slug IS DISTINCT FROM OLD.route_slug THEN
        RAISE EXCEPTION 'workspace slug is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0357_provider_slugs.sql 1953
ALTER TABLE provider_businesses ADD COLUMN slug TEXT;
CREATE FUNCTION niu_available_provider_slug(provider_name TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE base TEXT; candidate TEXT; suffix BIGINT := 1;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('niu-provider-slugs',0));
    base := COALESCE(NULLIF(trim(both '-' FROM left(regexp_replace(lower(provider_name COLLATE "C"),'[^a-z0-9]+','-','g'),48)),''),'provider');
    candidate := base;
    WHILE candidate IN ('overview','models','usage','consumption','settlements','members','api-keys','configuration','settings','manage') OR EXISTS(SELECT 1 FROM provider_businesses WHERE slug=candidate) LOOP
        suffix := suffix+1;
        candidate := trim(trailing '-' FROM left(base,48-length(suffix::text)-1)) || '-' || suffix;
    END LOOP;
    RETURN candidate;
END;
$$;
DO $$ DECLARE provider RECORD; BEGIN
    FOR provider IN SELECT id,name FROM provider_businesses ORDER BY created_at,id LOOP
        UPDATE provider_businesses SET slug=niu_available_provider_slug(provider.name) WHERE id=provider.id;
    END LOOP;
END; $$;
ALTER TABLE provider_businesses ALTER COLUMN slug SET NOT NULL;
ALTER TABLE provider_businesses ADD CONSTRAINT provider_slug_unique UNIQUE(slug);
ALTER TABLE provider_businesses ADD CONSTRAINT provider_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug)<=48);
CREATE FUNCTION preserve_provider_slug() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='INSERT' THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('niu-provider-slugs',0));
        NEW.slug := niu_available_provider_slug(COALESCE(NEW.slug,NEW.name));
    ELSIF NEW.slug IS DISTINCT FROM OLD.slug THEN
        RAISE EXCEPTION 'provider slug is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER immutable_provider_slug BEFORE INSERT OR UPDATE ON provider_businesses FOR EACH ROW EXECUTE FUNCTION preserve_provider_slug();

-- @niu-legacy-migration 0358_key_slugs.sql 1854
-- Keys retain their private identity and independent secrets. Slugs only address
-- the management page within an already authorized workspace.
ALTER TABLE api_keys ADD COLUMN slug TEXT;
CREATE FUNCTION niu_available_key_slug(workspace UUID,key_name TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE base TEXT; candidate TEXT; suffix BIGINT := 1;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('niu-key-slugs:' || workspace::text,0));
    base := COALESCE(NULLIF(trim(both '-' FROM left(regexp_replace(lower(key_name COLLATE "C"),'[^a-z0-9]+','-','g'),48)),''),'key');
    candidate := base;
    WHILE candidate='new' OR EXISTS(SELECT 1 FROM api_keys WHERE project_id=workspace AND slug=candidate) LOOP
        suffix := suffix+1;
        candidate := trim(trailing '-' FROM left(base,48-length(suffix::text)-1)) || '-' || suffix;
    END LOOP;
    RETURN candidate;
END;
$$;
DO $$ DECLARE key RECORD; BEGIN
    FOR key IN SELECT id,project_id,name FROM api_keys ORDER BY created_at,id LOOP
        UPDATE api_keys SET slug=niu_available_key_slug(key.project_id,key.name) WHERE id=key.id;
    END LOOP;
END; $$;
ALTER TABLE api_keys ALTER COLUMN slug SET NOT NULL;
ALTER TABLE api_keys ADD CONSTRAINT key_workspace_slug_unique UNIQUE(project_id,slug);
ALTER TABLE api_keys ADD CONSTRAINT key_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug)<=48);
CREATE FUNCTION preserve_key_slug() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='INSERT' THEN
        NEW.slug := niu_available_key_slug(NEW.project_id,COALESCE(NEW.slug,NEW.name));
    ELSIF NEW.slug IS DISTINCT FROM OLD.slug THEN
        RAISE EXCEPTION 'key slug is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER immutable_key_slug BEFORE INSERT OR UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION preserve_key_slug();

-- @niu-legacy-migration 0359_platform_currency.sql 2511
-- One installation currency. Historical records are never converted or relabeled.
CREATE TABLE platform_currency (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    configured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE FUNCTION niu_platform_currency_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Platform currency is configured once' USING ERRCODE='23514', CONSTRAINT='platform_currency_guard'; END $$;
CREATE TRIGGER platform_currency_immutable BEFORE UPDATE OR DELETE ON platform_currency
FOR EACH ROW EXECUTE FUNCTION niu_platform_currency_immutable();
CREATE TRIGGER platform_currency_no_truncate BEFORE TRUNCATE ON platform_currency
FOR EACH STATEMENT EXECUTE FUNCTION niu_platform_currency_immutable();

-- Restrict new configuration, not historical settlement/refund records.
CREATE FUNCTION niu_require_platform_currency() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE configured TEXT; supplied TEXT;
BEGIN
    PERFORM pg_advisory_xact_lock_shared(hashtextextended('niu-platform-currency',0));
    SELECT currency INTO configured FROM platform_currency WHERE singleton;
    -- Existing installations may continue operating until an administrator completes setup.
    IF configured IS NULL THEN RETURN NEW; END IF;
    supplied := CASE WHEN TG_ARGV[0]='document' THEN to_jsonb(NEW)->'document'->'tariff'->>'currency' ELSE to_jsonb(NEW)->>'currency' END;
    IF supplied IS DISTINCT FROM configured THEN
        RAISE EXCEPTION 'Use the configured platform currency %', configured USING ERRCODE='23514', CONSTRAINT='platform_currency_guard';
    END IF;
    RETURN NEW;
END $$;
DO $$ DECLARE resource TEXT; BEGIN
    FOREACH resource IN ARRAY ARRAY['customer_balance_accounts','customer_topup_orders','customer_balance_grants','provider_offer_revisions','customer_tariff_revisions','platform_retail_price_heads','customer_workspace_spending_limits','customer_key_spending_limits'] LOOP
        EXECUTE format('CREATE TRIGGER platform_currency_guard BEFORE INSERT OR UPDATE OF currency ON %I FOR EACH ROW EXECUTE FUNCTION niu_require_platform_currency()',resource);
    END LOOP;
    FOREACH resource IN ARRAY ARRAY['customer_media_rate_cards','supplier_media_rate_cards'] LOOP
        EXECUTE format('CREATE TRIGGER platform_currency_guard BEFORE INSERT OR UPDATE OF document ON %I FOR EACH ROW EXECUTE FUNCTION niu_require_platform_currency(''document'')',resource);
    END LOOP;
END $$;

-- @niu-legacy-migration 0360_platform_currency_configuration_guards.sql 1237
-- Configuration updates must follow the unit too, even when currency itself
-- is not included in UPDATE. Historical settlement rows remain untouched.
DROP TRIGGER platform_currency_guard ON customer_balance_accounts;
CREATE TRIGGER platform_currency_guard BEFORE INSERT OR UPDATE ON customer_balance_accounts
FOR EACH ROW EXECUTE FUNCTION niu_require_platform_currency();
DROP TRIGGER platform_currency_guard ON customer_workspace_spending_limits;
CREATE TRIGGER platform_currency_guard BEFORE INSERT OR UPDATE ON customer_workspace_spending_limits
FOR EACH ROW EXECUTE FUNCTION niu_require_platform_currency();
DROP TRIGGER platform_currency_guard ON customer_key_spending_limits;
CREATE TRIGGER platform_currency_guard BEFORE INSERT OR UPDATE ON customer_key_spending_limits
FOR EACH ROW EXECUTE FUNCTION niu_require_platform_currency();
DROP TRIGGER platform_currency_guard ON platform_retail_price_heads;
CREATE TRIGGER platform_currency_guard BEFORE INSERT OR UPDATE ON platform_retail_price_heads
FOR EACH ROW EXECUTE FUNCTION niu_require_platform_currency();
CREATE TRIGGER platform_currency_guard BEFORE INSERT OR UPDATE OF currency,limit_nanos ON project_budgets
FOR EACH ROW EXECUTE FUNCTION niu_require_platform_currency();

-- @niu-legacy-migration 0361_key_mutation_requests.sql 626
-- Refs #108. Durable mutation outcomes contain no secret or encrypted secret.
CREATE TABLE key_mutation_requests (
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('create', 'rotate')),
    intent_hash BYTEA NOT NULL CHECK (octet_length(intent_hash)=32),
    key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id, project_id, request_id)
);

-- @niu-legacy-migration 0362_operator_creation_receipts.sql 681
-- Identity-only onboarding can be replayed without storing or reissuing a secret.
-- Retain receipts after revocation/deletion so retries cannot restore access.
CREATE TABLE operator_creation_receipts (
    organization_id UUID NOT NULL,
    key_sha256 BYTEA NOT NULL CHECK (octet_length(key_sha256)=32),
    request_sha256 BYTEA NOT NULL CHECK (octet_length(request_sha256)=32),
    operator_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, key_sha256)
);
CREATE TRIGGER immutable_operator_creation_receipt BEFORE UPDATE OR DELETE
    ON operator_creation_receipts FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0363_media_offer_currency_guard.sql 568
-- Media offer revisions identify qualified supply; their prices live in
-- supplier_media_rate_cards. The existing shape constraint requires their
-- currency and text rates to be NULL. Guard only monetary text revisions here;
-- the separate media rate-card guard continues to enforce platform currency.
DROP TRIGGER platform_currency_guard ON provider_offer_revisions;
CREATE TRIGGER platform_currency_guard
BEFORE INSERT OR UPDATE OF currency ON provider_offer_revisions
FOR EACH ROW WHEN (NEW.rate_kind = 'text')
EXECUTE FUNCTION niu_require_platform_currency();

-- @niu-legacy-migration 0364_media_earnings_cached_tokens.sql 553
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

-- @niu-legacy-migration 0365_public_run_references.sql 998
-- Public support/bookmark references are independent of internal attempt UUIDs.
-- They carry no prompt content and confer no authority. Gaps are intentional.
CREATE SEQUENCE product_run_reference_sequence START WITH 1000;
ALTER TABLE attempts ADD COLUMN public_reference TEXT NOT NULL
    DEFAULT ('run-' || nextval('product_run_reference_sequence')::text);
CREATE UNIQUE INDEX attempts_public_reference ON attempts(public_reference);
ALTER TABLE attempts ADD CONSTRAINT attempts_public_reference_format
    CHECK (public_reference ~ '^run-[1-9][0-9]{0,18}$');

CREATE FUNCTION preserve_attempt_public_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.public_reference IS DISTINCT FROM OLD.public_reference THEN
        RAISE EXCEPTION 'public run references are permanent';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_attempt_public_reference BEFORE UPDATE OF public_reference ON attempts
    FOR EACH ROW EXECUTE FUNCTION preserve_attempt_public_reference();

-- @niu-legacy-migration 0366_public_chat_references.sql 943
-- References are independent of private titles/prompts and never grant access.
CREATE SEQUENCE product_chat_reference_sequence START WITH 1000;
ALTER TABLE chat_sessions ADD COLUMN public_reference TEXT NOT NULL
    DEFAULT ('chat-' || nextval('product_chat_reference_sequence')::text);
CREATE UNIQUE INDEX chat_sessions_public_reference ON chat_sessions(public_reference);
ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_public_reference_format
    CHECK (public_reference ~ '^chat-[1-9][0-9]{0,18}$');
CREATE FUNCTION preserve_chat_public_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.public_reference IS DISTINCT FROM OLD.public_reference THEN
        RAISE EXCEPTION 'public chat references are permanent';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_chat_public_reference BEFORE UPDATE OF public_reference ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION preserve_chat_public_reference();

-- @niu-legacy-migration 0367_public_video_session_references.sql 1044
-- Private Video timeline references contain neither internal IDs nor prompt text.
CREATE SEQUENCE product_video_session_reference_sequence START WITH 1000;
ALTER TABLE generations_sessions ADD COLUMN public_reference TEXT NOT NULL
    DEFAULT ('video-' || nextval('product_video_session_reference_sequence')::text);
CREATE UNIQUE INDEX generations_sessions_public_reference ON generations_sessions(public_reference);
ALTER TABLE generations_sessions ADD CONSTRAINT generations_sessions_public_reference_format
    CHECK (public_reference ~ '^video-[1-9][0-9]{0,18}$');
CREATE FUNCTION preserve_video_session_public_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.public_reference IS DISTINCT FROM OLD.public_reference THEN
        RAISE EXCEPTION 'public Video session references are permanent';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_video_session_public_reference BEFORE UPDATE OF public_reference ON generations_sessions
    FOR EACH ROW EXECUTE FUNCTION preserve_video_session_public_reference();

-- @niu-legacy-migration 0368_public_video_input_references.sql 1037
-- Readable saved-input bookmarks do not change immutable dispatch identity.
CREATE SEQUENCE product_video_input_reference_sequence START WITH 1000;
ALTER TABLE video_submission_intents ADD COLUMN public_reference TEXT NOT NULL
    DEFAULT ('input-' || nextval('product_video_input_reference_sequence')::text);
CREATE UNIQUE INDEX video_submission_intents_public_reference ON video_submission_intents(public_reference);
ALTER TABLE video_submission_intents ADD CONSTRAINT video_input_public_reference_format
    CHECK (public_reference ~ '^input-[1-9][0-9]{0,18}$');
CREATE FUNCTION preserve_video_input_public_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.public_reference IS DISTINCT FROM OLD.public_reference THEN
        RAISE EXCEPTION 'public Video input references are permanent';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_video_input_public_reference BEFORE UPDATE OF public_reference ON video_submission_intents
    FOR EACH ROW EXECUTE FUNCTION preserve_video_input_public_reference();

-- @niu-legacy-migration 0369_payment_verification_evidence.sql 1104
-- Server-owned verification attempts; no merchant responses or secrets are retained.
CREATE TABLE payment_verification_evidence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    gateway text NOT NULL CHECK (gateway IN ('stripe', 'epay', 'zhifux')),
    configuration_digest bytea NOT NULL CHECK (octet_length(configuration_digest) = 32),
    evidence_kind text NOT NULL CHECK (evidence_kind IN ('account', 'callback')),
    outcome text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending', 'passed', 'failed')),
    started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    completed_at timestamptz,
    expires_at timestamptz,
    CHECK ((outcome = 'pending' AND completed_at IS NULL AND expires_at IS NULL)
        OR (outcome = 'failed' AND completed_at IS NOT NULL AND expires_at IS NULL)
        OR (outcome = 'passed' AND completed_at IS NOT NULL AND expires_at > completed_at))
);
CREATE INDEX payment_verification_current ON payment_verification_evidence
    (gateway, configuration_digest, evidence_kind, sequence DESC);

-- @niu-legacy-migration 0370_payment_verification_outages.sql 703
-- A temporary inability to check does not revoke unexpired prior evidence.
ALTER TABLE payment_verification_evidence DROP CONSTRAINT payment_verification_evidence_outcome_check;
ALTER TABLE payment_verification_evidence DROP CONSTRAINT payment_verification_evidence_check;
ALTER TABLE payment_verification_evidence ADD CHECK (outcome IN ('pending', 'passed', 'failed', 'unavailable'));
ALTER TABLE payment_verification_evidence ADD CHECK (
    (outcome = 'pending' AND completed_at IS NULL AND expires_at IS NULL)
    OR (outcome IN ('failed', 'unavailable') AND completed_at IS NOT NULL AND expires_at IS NULL)
    OR (outcome = 'passed' AND completed_at IS NOT NULL AND expires_at > completed_at)
);

-- @niu-legacy-migration 0371_payment_checkout_verification.sql 1410
-- Capture effective configuration before checkout creation. Existing orders are
-- deliberately not backfilled: their original configuration cannot be proven.
CREATE TABLE payment_checkout_verification (
    order_id uuid PRIMARY KEY REFERENCES customer_topup_orders(id),
    gateway text NOT NULL CHECK (gateway IN ('stripe', 'epay', 'zhifux')),
    configuration_digest bytea NOT NULL CHECK (octet_length(configuration_digest) = 32),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_payment_checkout_verification BEFORE UPDATE OR DELETE
    ON payment_checkout_verification FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE INDEX payment_checkout_verification_configuration
    ON payment_checkout_verification(gateway, configuration_digest, order_id);

-- A signed callback qualifies only an independently settled, configuration-bound
-- checkout. Replaying it cannot refresh its original receipt time.
CREATE TABLE payment_callback_verification (
    order_id uuid PRIMARY KEY REFERENCES payment_checkout_verification(order_id),
    FOREIGN KEY (order_id) REFERENCES customer_topup_settlements(order_id),
    verified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_payment_callback_verification BEFORE UPDATE OR DELETE
    ON payment_callback_verification FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0372_payment_signed_notifications.sql 526
-- Native ZhifuX acknowledges signed notification before its independent query
-- settles the order. Preserve that configuration-bound receipt in either order.
CREATE TABLE payment_signed_notifications (
    order_id uuid PRIMARY KEY REFERENCES payment_checkout_verification(order_id),
    received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_payment_signed_notifications BEFORE UPDATE OR DELETE
    ON payment_signed_notifications FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0373_customer_balance_account_posted_sum.sql 7641
-- Maintain an incremental O(1) posted balance counter on customer_balance_accounts
-- synchronized in the same transaction as append-only customer_balance_entries,
-- and attach explicit constraint identifiers to reservation spending-limit triggers.

ALTER TABLE customer_balance_accounts
    ADD COLUMN posted_balance_nanos NUMERIC NOT NULL DEFAULT 0;

-- Restrict platform_currency_guard on customer_balance_accounts to configuration
-- columns so ledger postings on historical currency accounts remain permitted.
DROP TRIGGER platform_currency_guard ON customer_balance_accounts;
CREATE TRIGGER platform_currency_guard
    BEFORE INSERT OR UPDATE OF organization_id, currency, credit_limit_nanos, warning_threshold_nanos, policy_revision
    ON customer_balance_accounts
    FOR EACH ROW EXECUTE FUNCTION niu_require_platform_currency();

UPDATE customer_balance_accounts a
SET posted_balance_nanos = COALESCE(
    (SELECT SUM(e.amount_nanos) FROM customer_balance_entries e WHERE e.account_id = a.id),
    0
);

CREATE OR REPLACE FUNCTION protect_customer_account_posted_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.posted_balance_nanos <> 0 THEN
        RAISE EXCEPTION 'posted_balance_nanos must start at zero'
            USING ERRCODE = '23514', CONSTRAINT = 'customer_account_posted_balance_guard';
    END IF;
    IF TG_OP = 'UPDATE'
       AND NEW.posted_balance_nanos IS DISTINCT FROM OLD.posted_balance_nanos
       AND current_setting('niu.updating_posted_balance_account', true) IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'posted_balance_nanos is maintained only by ledger entries'
            USING ERRCODE = '23514', CONSTRAINT = 'customer_account_posted_balance_guard';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER guard_customer_account_posted_balance
    BEFORE INSERT OR UPDATE OF posted_balance_nanos ON customer_balance_accounts
    FOR EACH ROW EXECUTE FUNCTION protect_customer_account_posted_balance();

CREATE OR REPLACE FUNCTION maintain_customer_account_posted_balance()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    delta RECORD;
BEGIN
    FOR delta IN
        SELECT account_id, SUM(amount_nanos) AS amount_nanos
        FROM inserted_rows
        GROUP BY account_id
    LOOP
        PERFORM set_config('niu.updating_posted_balance_account', delta.account_id::text, true);
        UPDATE customer_balance_accounts
        SET posted_balance_nanos = posted_balance_nanos + delta.amount_nanos
        WHERE id = delta.account_id;
    END LOOP;
    PERFORM set_config('niu.updating_posted_balance_account', '', true);
    RETURN NULL;
END;
$$;

CREATE TRIGGER a00_maintain_customer_account_posted_balance_on_entry
    AFTER INSERT ON customer_balance_entries
    REFERENCING NEW TABLE AS inserted_rows
    FOR EACH STATEMENT EXECUTE FUNCTION maintain_customer_account_posted_balance();

CREATE OR REPLACE FUNCTION niu_verify_customer_account_posted_balance(p_account UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM customer_balance_accounts a
        WHERE a.id = p_account
          AND a.posted_balance_nanos = COALESCE(
              (SELECT SUM(e.amount_nanos) FROM customer_balance_entries e WHERE e.account_id = a.id),
              0
          )
    );
$$;

CREATE OR REPLACE FUNCTION enforce_customer_media_debit_capacity() RETURNS TRIGGER AS $$
DECLARE funded BOOLEAN;
BEGIN
    IF NEW.kind <> 'charge' OR NOT EXISTS (SELECT 1 FROM customer_media_charges WHERE attempt_id = NEW.attempt_id) THEN
        RETURN NEW;
    END IF;
    PERFORM id FROM customer_balance_accounts WHERE id = NEW.account_id FOR NO KEY UPDATE;
    SELECT a.posted_balance_nanos + a.credit_limit_nanos - niu_customer_account_outstanding(a.id, NEW.attempt_id)
        >= -NEW.amount_nanos
    INTO funded
    FROM customer_balance_accounts a
    WHERE a.id = NEW.account_id;
    IF funded IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'media debit exceeds available approved capacity'
            USING ERRCODE = '23514', CONSTRAINT = 'media_debit_exceeds_approved_capacity';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_customer_key_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root UUID; maximum BIGINT; workspace UUID; workspace_maximum BIGINT;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR NO KEY UPDATE;
    SELECT project_id INTO workspace FROM customer_attempt_balance_accounts
        WHERE attempt_id=NEW.attempt_id AND organization_id=NEW.organization_id
          AND account_id=NEW.account_id AND currency=NEW.currency;
    SELECT limit_nanos INTO workspace_maximum FROM customer_workspace_spending_limits
        WHERE organization_id=NEW.organization_id AND project_id=workspace
          AND account_id=NEW.account_id AND currency=NEW.currency;
    IF workspace_maximum IS NOT NULL AND
        niu_customer_workspace_committed(NEW.organization_id,workspace,NEW.account_id)+NEW.amount_nanos>workspace_maximum THEN
        RAISE EXCEPTION 'customer workspace spending limit exceeded'
            USING ERRCODE='23514', CONSTRAINT='customer_workspace_spending_limit_exceeded';
    END IF;

    root := niu_customer_attempt_spending_root(NEW.attempt_id);
    IF workspace IS NULL THEN
        SELECT project_id INTO workspace FROM attempts WHERE id=NEW.attempt_id;
    END IF;
    IF root IS NULL AND EXISTS(SELECT 1 FROM customer_key_spending_limits
        WHERE organization_id=NEW.organization_id AND project_id=workspace
          AND account_id=NEW.account_id AND limit_nanos IS NOT NULL) THEN
        RAISE EXCEPTION 'key attribution required for bounded spending'
            USING ERRCODE='23514', CONSTRAINT='key_attribution_required_for_bounded_spending';
    END IF;
    SELECT limit_nanos INTO maximum FROM customer_key_spending_limits
        WHERE organization_id=NEW.organization_id AND spending_root_id=root AND account_id=NEW.account_id;
    IF maximum IS NOT NULL AND niu_customer_key_committed(root,NEW.account_id)+NEW.amount_nanos>maximum THEN
        RAISE EXCEPTION 'customer key spending limit exceeded'
            USING ERRCODE='23514', CONSTRAINT='customer_key_spending_limit_exceeded';
    END IF;
    PERFORM set_config('niu.verified_workspace_reservation_attempt', NEW.attempt_id::text, true);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_customer_workspace_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE workspace UUID; maximum BIGINT;
BEGIN
    IF current_setting('niu.verified_workspace_reservation_attempt', true) = NEW.attempt_id::text THEN
        PERFORM set_config('niu.verified_workspace_reservation_attempt', '', true);
        RETURN NEW;
    END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR NO KEY UPDATE;
    SELECT project_id INTO workspace FROM customer_attempt_balance_accounts
        WHERE attempt_id=NEW.attempt_id AND organization_id=NEW.organization_id
          AND account_id=NEW.account_id AND currency=NEW.currency;
    SELECT limit_nanos INTO maximum FROM customer_workspace_spending_limits
        WHERE organization_id=NEW.organization_id AND project_id=workspace
          AND account_id=NEW.account_id AND currency=NEW.currency;
    IF maximum IS NOT NULL AND
        niu_customer_workspace_committed(NEW.organization_id,workspace,NEW.account_id)+NEW.amount_nanos>maximum THEN
        RAISE EXCEPTION 'customer workspace spending limit exceeded'
            USING ERRCODE='23514', CONSTRAINT='customer_workspace_spending_limit_exceeded';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0374_restore_customer_scoped_demo.sql 732
-- The built-in demo is an ordinary customer identity. A later release restored
-- its implicit platform grant after the original repair; revoke that grant
-- again without changing credentials, sessions, customer scope or other admins.
-- Existing sessions consult the saved operator permissions on every request.
WITH revoked AS (
    UPDATE admin_operators AS operator
    SET platform_admin = false
    FROM member_password_credentials AS credential
    WHERE credential.operator_id = operator.id
      AND credential.email = 'demo@niu.io'
      AND operator.platform_admin
    RETURNING operator.id
)
INSERT INTO platform_admin_events (operator_id, granted, actor_kind)
SELECT id, false, 'database_administrator'
FROM revoked;

-- @niu-legacy-migration 0375_provider_integrations.sql 811
-- Integration identity is independent of inference adapters and monetary rates.
-- Existing records remain unspecified; no endpoint-based inference or repricing.
CREATE TABLE provider_integration_settings (
    provider_id UUID PRIMARY KEY REFERENCES provider_businesses(id) ON DELETE CASCADE,
    integration_type TEXT NOT NULL CHECK (integration_type IN ('openrouter', 'newapi', 'litellm', 'custom')),
    revision BIGINT NOT NULL CHECK (revision > 0)
);

CREATE TABLE vendor_integration_settings (
    vendor_id UUID PRIMARY KEY REFERENCES vendors(id) ON DELETE CASCADE,
    -- NULL explicitly restores inheritance while retaining the revision for CAS.
    integration_type TEXT CHECK (integration_type IN ('openrouter', 'newapi', 'litellm', 'custom')),
    revision BIGINT NOT NULL CHECK (revision > 0)
);

-- @niu-legacy-migration 0376_customer_unit_definitions.sql 2373
-- Versioned branded-unit configuration only. This migration does not enable
-- Credits, convert balances, issue units or change a monetary tariff.
CREATE TABLE customer_unit_configuration (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO customer_unit_configuration(singleton) VALUES (TRUE);

CREATE TABLE customer_unit_definitions (
    revision BIGINT PRIMARY KEY CHECK (revision > 0),
    expected_revision BIGINT NOT NULL CHECK (expected_revision >= 0 AND revision = expected_revision + 1),
    idempotency_key UUID NOT NULL UNIQUE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80 AND name = btrim(name)
        AND name !~ '[[:cntrl:]]'),
    display_precision SMALLINT NOT NULL CHECK (display_precision BETWEEN 0 AND 9),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((actor_kind = 'operator') = (actor_operator_id IS NOT NULL))
);
CREATE TRIGGER immutable_customer_unit_definition
    BEFORE UPDATE OR DELETE ON customer_unit_definitions
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE TABLE customer_unit_purchase_rules (
    revision BIGINT PRIMARY KEY CHECK (revision > 0),
    expected_revision BIGINT NOT NULL CHECK (expected_revision >= 0 AND revision = expected_revision + 1),
    idempotency_key UUID NOT NULL UNIQUE,
    definition_revision BIGINT NOT NULL REFERENCES customer_unit_definitions(revision),
    payment_currency TEXT NOT NULL CHECK (payment_currency ~ '^[A-Z]{3}$'),
    numerator BIGINT NOT NULL CHECK (numerator > 0),
    denominator BIGINT NOT NULL CHECK (denominator > 0),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((actor_kind = 'operator') = (actor_operator_id IS NOT NULL))
);
CREATE INDEX customer_unit_rules_current
    ON customer_unit_purchase_rules(definition_revision, payment_currency, revision DESC);
CREATE TRIGGER immutable_customer_unit_purchase_rule
    BEFORE UPDATE OR DELETE ON customer_unit_purchase_rules
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0377_customer_unit_purchase_quotes.sql 1998
-- A saved quote does not issue units, settle a payment or enable Credits mode.
CREATE TABLE customer_unit_purchase_quotes (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    idempotency_key UUID NOT NULL,
    rule_revision BIGINT NOT NULL REFERENCES customer_unit_purchase_rules(revision),
    payment_currency TEXT NOT NULL CHECK (payment_currency ~ '^[A-Z]{3}$'),
    payment_nanos BIGINT NOT NULL CHECK (payment_nanos > 0),
    credit_atoms BIGINT NOT NULL CHECK (credit_atoms > 0),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (statement_timestamp() + INTERVAL '15 minutes'),
    UNIQUE (organization_id, idempotency_key),
    UNIQUE (organization_id, id),
    CHECK (expires_at > created_at),
    CHECK ((actor_kind = 'operator') = (actor_operator_id IS NOT NULL))
);
CREATE INDEX customer_unit_quote_expiration ON customer_unit_purchase_quotes(expires_at);

CREATE FUNCTION validate_customer_unit_quote() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM customer_unit_purchase_rules r
        WHERE r.revision = NEW.rule_revision AND r.payment_currency = NEW.payment_currency
            AND NEW.payment_nanos::numeric * r.numerator::numeric
                = NEW.credit_atoms::numeric * r.denominator::numeric
    ) THEN
        RAISE EXCEPTION 'Credits quote must match its exact immutable purchase rule'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_quote BEFORE INSERT ON customer_unit_purchase_quotes
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_quote();
CREATE TRIGGER immutable_customer_unit_quote BEFORE UPDATE OR DELETE ON customer_unit_purchase_quotes
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0378_customer_unit_purchase_lots.sql 10138
-- Mode activation is a separate guarded operation; migration retains currency mode.
ALTER TABLE customer_unit_configuration ADD COLUMN billing_mode TEXT NOT NULL DEFAULT 'currency'
    CHECK (billing_mode IN ('currency', 'credits'));

-- Separate consumption-unit issuance from monetary wallet funding. Existing
-- payment references remain globally unique across both settlement kinds.
CREATE TABLE customer_unit_accounts (
    organization_id UUID PRIMARY KEY REFERENCES organizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_unit_topups (
    order_id UUID PRIMARY KEY REFERENCES customer_topup_orders(id),
    organization_id UUID NOT NULL,
    quote_id UUID NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, quote_id)
        REFERENCES customer_unit_purchase_quotes(organization_id, id)
);
CREATE TRIGGER immutable_customer_unit_topup BEFORE UPDATE OR DELETE ON customer_unit_topups
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION validate_customer_unit_topup() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM id FROM customer_topup_orders WHERE id=NEW.order_id FOR UPDATE;
    IF NOT EXISTS (
        SELECT 1 FROM customer_topup_orders o JOIN customer_unit_purchase_quotes q
            ON q.organization_id=o.organization_id AND q.payment_currency=o.currency
                AND q.payment_nanos=o.amount_nanos
        WHERE o.id=NEW.order_id AND o.organization_id=NEW.organization_id
            AND q.id=NEW.quote_id AND q.expires_at>clock_timestamp()
    ) OR EXISTS (SELECT 1 FROM customer_topup_provider_orders WHERE order_id=NEW.order_id)
      OR EXISTS (SELECT 1 FROM customer_topup_checkout WHERE order_id=NEW.order_id)
      OR EXISTS (SELECT 1 FROM customer_topup_creation_claims WHERE order_id=NEW.order_id)
      OR EXISTS (SELECT 1 FROM customer_topup_settlements WHERE order_id=NEW.order_id)
      OR EXISTS (SELECT 1 FROM customer_topup_closures WHERE order_id=NEW.order_id) THEN
        RAISE EXCEPTION 'Credits binding requires an unexpired matching quote and an unsubmitted order'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_topup BEFORE INSERT ON customer_unit_topups
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_topup();

CREATE TABLE customer_unit_purchase_lots (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES customer_unit_accounts(organization_id),
    order_id UUID NOT NULL UNIQUE REFERENCES customer_unit_topups(order_id),
    definition_revision BIGINT NOT NULL REFERENCES customer_unit_definitions(revision),
    credit_atoms BIGINT NOT NULL CHECK (credit_atoms > 0),
    provenance TEXT NOT NULL CHECK (provenance IN ('purchased', 'simulated')),
    payment_currency TEXT NOT NULL CHECK (payment_currency ~ '^[A-Z]{3}$'),
    payment_nanos BIGINT NOT NULL CHECK (payment_nanos > 0),
    backing_nanos BIGINT NOT NULL CHECK (backing_nanos >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id),
    CHECK ((provenance='purchased' AND backing_nanos=payment_nanos)
        OR (provenance='simulated' AND backing_nanos=0))
);
CREATE INDEX customer_unit_lots_consumption ON customer_unit_purchase_lots(organization_id, created_at, id);
CREATE TRIGGER immutable_customer_unit_purchase_lot BEFORE UPDATE OR DELETE ON customer_unit_purchase_lots
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION validate_customer_unit_purchase_lot() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM customer_unit_topups t
        JOIN customer_topup_orders o ON o.id=t.order_id
        JOIN customer_unit_purchase_quotes q ON q.id=t.quote_id
        JOIN customer_unit_purchase_rules r ON r.revision=q.rule_revision
        WHERE t.order_id=NEW.order_id AND t.organization_id=NEW.organization_id
            AND q.credit_atoms=NEW.credit_atoms AND r.definition_revision=NEW.definition_revision
            AND q.payment_currency=NEW.payment_currency AND q.payment_nanos=NEW.payment_nanos
            AND NEW.provenance=CASE WHEN o.aggregator='stripe' AND o.merchant='NiuMockPayments'
                THEN 'simulated' ELSE 'purchased' END
    ) THEN
        RAISE EXCEPTION 'Credits lot must match its original quote and immutable payment provenance'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_purchase_lot BEFORE INSERT ON customer_unit_purchase_lots
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_purchase_lot();

CREATE TABLE customer_unit_funding_receipts (
    unit_lot_id UUID PRIMARY KEY,
    channel TEXT NOT NULL CHECK (length(trim(channel)) BETWEEN 1 AND 100),
    payment_reference TEXT NOT NULL CHECK (length(trim(payment_reference)) BETWEEN 1 AND 200),
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (channel, payment_reference),
    FOREIGN KEY (organization_id, unit_lot_id)
        REFERENCES customer_unit_purchase_lots(organization_id, id),
    FOREIGN KEY (organization_id, account_id, currency)
        REFERENCES customer_balance_accounts(organization_id, id, currency)
);
CREATE TRIGGER immutable_customer_unit_receipt BEFORE UPDATE OR DELETE ON customer_unit_funding_receipts
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- This registry shares payment identity without feeding Credits purchases into
-- monetary wallet allocation or credit-repayment triggers.
CREATE TABLE customer_payment_references (
    channel TEXT NOT NULL,
    payment_reference TEXT NOT NULL,
    entry_id UUID UNIQUE REFERENCES customer_balance_entries(id),
    unit_lot_id UUID UNIQUE REFERENCES customer_unit_purchase_lots(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (channel, payment_reference),
    CHECK ((entry_id IS NOT NULL) <> (unit_lot_id IS NOT NULL))
);
INSERT INTO customer_payment_references(channel,payment_reference,entry_id,created_at)
    SELECT channel,payment_reference,entry_id,created_at FROM customer_funding_receipts;
CREATE TRIGGER immutable_customer_payment_reference BEFORE UPDATE OR DELETE ON customer_payment_references
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE FUNCTION register_customer_payment_reference() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE money_entry UUID; unit_lot UUID;
BEGIN
    IF TG_TABLE_NAME='customer_funding_receipts' THEN money_entry:=NEW.entry_id;
    ELSE unit_lot:=NEW.unit_lot_id; END IF;
    INSERT INTO customer_payment_references(channel,payment_reference,entry_id,unit_lot_id,created_at)
        VALUES(NEW.channel,NEW.payment_reference,money_entry,unit_lot,NEW.created_at)
        ON CONFLICT(channel,payment_reference) DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM customer_payment_references r
        WHERE r.channel=NEW.channel AND r.payment_reference=NEW.payment_reference
            AND r.entry_id IS NOT DISTINCT FROM money_entry AND r.unit_lot_id IS NOT DISTINCT FROM unit_lot) THEN
        RAISE EXCEPTION 'Payment reference already belongs to a different funding target'
            USING ERRCODE='23514', CONSTRAINT='customer_payment_reference_target';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER register_customer_payment_reference BEFORE INSERT ON customer_funding_receipts
    FOR EACH ROW EXECUTE FUNCTION register_customer_payment_reference();
CREATE TRIGGER register_customer_unit_payment_reference BEFORE INSERT ON customer_unit_funding_receipts
    FOR EACH ROW EXECUTE FUNCTION register_customer_payment_reference();

ALTER TABLE customer_topup_settlements ALTER COLUMN entry_id DROP NOT NULL;
ALTER TABLE customer_topup_settlements ADD COLUMN unit_lot_id UUID UNIQUE;
ALTER TABLE customer_topup_settlements ADD CONSTRAINT topup_settlement_target
    CHECK ((entry_id IS NOT NULL) <> (unit_lot_id IS NOT NULL));
ALTER TABLE customer_topup_settlements ADD FOREIGN KEY (organization_id, unit_lot_id)
    REFERENCES customer_unit_purchase_lots(organization_id, id);

CREATE FUNCTION validate_customer_unit_settlement() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME='customer_unit_funding_receipts' THEN
        IF NEW.unit_lot_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM customer_unit_purchase_lots l
            JOIN customer_topup_orders o ON o.id=l.order_id
            JOIN customer_topup_provider_orders p ON p.order_id=o.id
            WHERE l.id=NEW.unit_lot_id AND l.organization_id=NEW.organization_id
                AND l.payment_currency=NEW.currency AND l.payment_nanos=NEW.amount_nanos
                AND o.account_id=NEW.account_id AND NEW.channel=o.aggregator || ':' || o.merchant
                AND NEW.payment_reference=p.platform_reference
        ) THEN
            RAISE EXCEPTION 'Credits receipt must match its bound payment' USING ERRCODE='23514';
        END IF;
    ELSE
        IF (NEW.unit_lot_id IS NOT NULL) <> EXISTS (
            SELECT 1 FROM customer_unit_topups WHERE order_id=NEW.order_id
        ) OR (NEW.unit_lot_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM customer_unit_purchase_lots l
            JOIN customer_unit_funding_receipts f ON f.unit_lot_id=l.id
            WHERE l.id=NEW.unit_lot_id AND l.order_id=NEW.order_id
                AND l.organization_id=NEW.organization_id AND f.account_id=NEW.account_id
                AND f.currency=NEW.currency
        )) THEN
            RAISE EXCEPTION 'Credits settlement must match its issued lot and receipt'
                USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_receipt BEFORE INSERT ON customer_unit_funding_receipts
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_settlement();
CREATE TRIGGER validate_customer_unit_settlement BEFORE INSERT ON customer_topup_settlements
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_settlement();

-- @niu-legacy-migration 0379_customer_unit_grants.sql 5200
-- Preserve purchased lots and references while adding noncash grant origins.
ALTER TABLE customer_unit_purchase_lots RENAME TO customer_unit_lots;
ALTER TABLE customer_unit_lots ALTER COLUMN order_id DROP NOT NULL;
ALTER TABLE customer_unit_lots ALTER COLUMN payment_currency DROP NOT NULL;
ALTER TABLE customer_unit_lots ALTER COLUMN payment_nanos DROP NOT NULL;
ALTER TABLE customer_unit_lots DROP CONSTRAINT customer_unit_purchase_lots_provenance_check;
ALTER TABLE customer_unit_lots DROP CONSTRAINT customer_unit_purchase_lots_check;
ALTER TABLE customer_unit_lots ADD COLUMN grant_idempotency_key UUID;
ALTER TABLE customer_unit_lots ADD COLUMN grant_reason TEXT;
ALTER TABLE customer_unit_lots ADD COLUMN grant_actor_kind TEXT;
ALTER TABLE customer_unit_lots ADD COLUMN grant_actor_operator_id UUID REFERENCES admin_operators(id);
ALTER TABLE customer_unit_lots ADD COLUMN expires_at TIMESTAMPTZ;
ALTER TABLE customer_unit_lots ADD CONSTRAINT customer_unit_provenance
    CHECK (provenance IN ('purchased','promotional','simulated'));
ALTER TABLE customer_unit_lots ADD CONSTRAINT customer_unit_backing
    CHECK ((provenance='purchased' AND backing_nanos=payment_nanos AND payment_nanos IS NOT NULL)
        OR (provenance IN ('promotional','simulated') AND backing_nanos=0));
ALTER TABLE customer_unit_lots ADD CONSTRAINT customer_unit_origin CHECK (
    (order_id IS NOT NULL AND grant_idempotency_key IS NULL AND grant_reason IS NULL
        AND grant_actor_kind IS NULL AND grant_actor_operator_id IS NULL
        AND expires_at IS NULL AND payment_currency IS NOT NULL AND payment_nanos IS NOT NULL
        AND provenance IN ('purchased','simulated'))
    OR (order_id IS NULL AND grant_idempotency_key IS NOT NULL AND grant_reason IS NOT NULL
        AND char_length(grant_reason) BETWEEN 1 AND 500 AND grant_reason=btrim(grant_reason)
        AND grant_reason !~ '[[:cntrl:]]' AND grant_actor_kind IS NOT NULL
        AND grant_actor_kind IN ('installation','operator')
        AND ((grant_actor_kind='operator')=(grant_actor_operator_id IS NOT NULL))
        AND payment_currency IS NULL AND payment_nanos IS NULL
        AND provenance IN ('promotional','simulated') AND backing_nanos=0)
);
ALTER TABLE customer_unit_lots ADD CONSTRAINT customer_unit_grant_expiry
    CHECK (expires_at IS NULL OR expires_at>created_at);
CREATE UNIQUE INDEX customer_unit_grant_identity
    ON customer_unit_lots(organization_id,grant_idempotency_key) WHERE grant_idempotency_key IS NOT NULL;
CREATE INDEX customer_unit_expiring_lots ON customer_unit_lots(organization_id,expires_at,created_at,id);

CREATE OR REPLACE FUNCTION validate_customer_unit_purchase_lot() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.order_id IS NULL THEN RETURN NEW; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM customer_unit_topups t
        JOIN customer_topup_orders o ON o.id=t.order_id
        JOIN customer_unit_purchase_quotes q ON q.id=t.quote_id
        JOIN customer_unit_purchase_rules r ON r.revision=q.rule_revision
        WHERE t.order_id=NEW.order_id AND t.organization_id=NEW.organization_id
            AND q.credit_atoms=NEW.credit_atoms AND r.definition_revision=NEW.definition_revision
            AND q.payment_currency=NEW.payment_currency AND q.payment_nanos=NEW.payment_nanos
            AND NEW.provenance=CASE WHEN o.aggregator='stripe' AND o.merchant='NiuMockPayments'
                THEN 'simulated' ELSE 'purchased' END
    ) THEN
        RAISE EXCEPTION 'Credits lot must match its original quote and immutable payment provenance'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_customer_unit_settlement() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME='customer_unit_funding_receipts' THEN
        IF NEW.unit_lot_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM customer_unit_lots l
            JOIN customer_topup_orders o ON o.id=l.order_id
            JOIN customer_topup_provider_orders p ON p.order_id=o.id
            WHERE l.id=NEW.unit_lot_id AND l.organization_id=NEW.organization_id
                AND l.payment_currency=NEW.currency AND l.payment_nanos=NEW.amount_nanos
                AND o.account_id=NEW.account_id AND NEW.channel=o.aggregator || ':' || o.merchant
                AND NEW.payment_reference=p.platform_reference
        ) THEN
            RAISE EXCEPTION 'Credits receipt must match its bound payment' USING ERRCODE='23514';
        END IF;
    ELSE
        IF (NEW.unit_lot_id IS NOT NULL) <> EXISTS (
            SELECT 1 FROM customer_unit_topups WHERE order_id=NEW.order_id
        ) OR (NEW.unit_lot_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM customer_unit_lots l
            JOIN customer_unit_funding_receipts f ON f.unit_lot_id=l.id
            WHERE l.id=NEW.unit_lot_id AND l.order_id=NEW.order_id
                AND l.organization_id=NEW.organization_id AND f.account_id=NEW.account_id
                AND f.currency=NEW.currency
        )) THEN
            RAISE EXCEPTION 'Credits settlement must match its issued lot and receipt'
                USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0380_customer_unit_ranges.sql 8603
-- Immutable range accounting, independent of monetary wallet entries. Request
-- pricing/admission must call this ledger inside its own atomic transaction.
CREATE TABLE customer_unit_reservations (
    attempt_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES customer_unit_accounts(organization_id),
    project_id UUID NOT NULL,
    definition_revision BIGINT NOT NULL REFERENCES customer_unit_definitions(revision),
    maximum_atoms BIGINT NOT NULL CHECK (maximum_atoms >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (organization_id, attempt_id),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES attempts(organization_id, project_id, id)
);
CREATE TABLE customer_unit_reserved_ranges (
    attempt_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    ordinal BIGINT NOT NULL CHECK (ordinal >= 0),
    lot_id UUID NOT NULL,
    first_atom BIGINT NOT NULL CHECK (first_atom >= 0),
    end_atom BIGINT NOT NULL CHECK (end_atom > first_atom),
    PRIMARY KEY (attempt_id, ordinal),
    FOREIGN KEY (organization_id, attempt_id)
        REFERENCES customer_unit_reservations(organization_id, attempt_id),
    FOREIGN KEY (organization_id, lot_id) REFERENCES customer_unit_lots(organization_id, id)
);
CREATE INDEX customer_unit_reserved_lot ON customer_unit_reserved_ranges(lot_id);
CREATE TABLE customer_unit_resolutions (
    attempt_id UUID PRIMARY KEY REFERENCES customer_unit_reservations(attempt_id),
    kind TEXT NOT NULL CHECK (kind IN ('charge', 'release')),
    charged_atoms BIGINT NOT NULL CHECK (charged_atoms >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK (kind='charge' OR charged_atoms=0)
);
CREATE TABLE customer_unit_restorations (
    id UUID PRIMARY KEY,
    attempt_id UUID NOT NULL REFERENCES customer_unit_resolutions(attempt_id),
    idempotency_key UUID NOT NULL,
    first_atom BIGINT NOT NULL CHECK (first_atom >= 0),
    end_atom BIGINT NOT NULL CHECK (end_atom > first_atom),
    reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500
        AND reason=btrim(reason) AND reason !~ '[[:cntrl:]]'),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (attempt_id, idempotency_key),
    CHECK ((actor_kind='operator')=(actor_operator_id IS NOT NULL))
);

-- Charge positions follow allocation order, rather than current purchase rules.
-- A restoration removes an original charge interval; it never extends lot expiry.
CREATE VIEW customer_unit_range_positions AS
SELECT r.*, COALESCE(sum(end_atom-first_atom) OVER (
    PARTITION BY attempt_id ORDER BY ordinal ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
),0)::bigint AS charge_offset
FROM customer_unit_reserved_ranges r;

CREATE VIEW customer_unit_consumed_ranges AS
SELECT p.attempt_id,p.organization_id,p.ordinal,p.lot_id,p.first_atom,
    (p.first_atom+LEAST(p.end_atom-p.first_atom,c.charged_atoms-p.charge_offset)) AS end_atom,
    p.charge_offset
FROM customer_unit_range_positions p
JOIN customer_unit_resolutions c USING (attempt_id)
WHERE c.kind='charge' AND c.charged_atoms>p.charge_offset;

CREATE VIEW customer_unit_occupied_ranges AS
SELECT r.organization_id,r.attempt_id,r.lot_id,int8range(r.first_atom,r.end_atom,'[)') AS atoms
FROM customer_unit_reserved_ranges r
WHERE NOT EXISTS (SELECT 1 FROM customer_unit_resolutions c WHERE c.attempt_id=r.attempt_id)
UNION ALL
SELECT c.organization_id,c.attempt_id,c.lot_id,remaining.atoms
FROM customer_unit_consumed_ranges c
CROSS JOIN LATERAL unnest(
    int8multirange(int8range(c.first_atom,c.end_atom,'[)')) - COALESCE((
        SELECT range_agg(int8range(
            c.first_atom+GREATEST(0,r.first_atom-c.charge_offset),
            c.first_atom+LEAST(c.end_atom-c.first_atom,r.end_atom-c.charge_offset),'[)'))
        FROM customer_unit_restorations r
        WHERE r.attempt_id=c.attempt_id
          AND r.first_atom<c.charge_offset+(c.end_atom-c.first_atom)
          AND r.end_atom>c.charge_offset
    ),'{}'::int8multirange)
) AS remaining(atoms);

CREATE FUNCTION validate_customer_unit_range() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE lot customer_unit_lots;
BEGIN
    PERFORM organization_id FROM customer_unit_accounts
        WHERE organization_id=NEW.organization_id FOR NO KEY UPDATE;
    SELECT * INTO STRICT lot FROM customer_unit_lots
        WHERE organization_id=NEW.organization_id AND id=NEW.lot_id;
    IF NEW.end_atom>lot.credit_atoms OR (lot.expires_at IS NOT NULL AND lot.expires_at<=clock_timestamp())
       OR EXISTS (SELECT 1 FROM customer_unit_resolutions WHERE attempt_id=NEW.attempt_id)
       OR EXISTS (SELECT 1 FROM customer_unit_occupied_ranges o WHERE o.lot_id=NEW.lot_id
            AND o.atoms && int8range(NEW.first_atom,NEW.end_atom,'[)')) THEN
        RAISE EXCEPTION 'Credits range is expired, unavailable or already resolved' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_range BEFORE INSERT ON customer_unit_reserved_ranges
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_range();

CREATE FUNCTION validate_customer_unit_reservation_total() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT COALESCE(sum(end_atom-first_atom),0) FROM customer_unit_reserved_ranges
        WHERE attempt_id=NEW.attempt_id) <>
       (SELECT maximum_atoms FROM customer_unit_reservations WHERE attempt_id=NEW.attempt_id) THEN
        RAISE EXCEPTION 'Credits reservation must be fully backed by disjoint ranges' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER customer_unit_reservation_total AFTER INSERT ON customer_unit_reservations
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_reservation_total();
CREATE CONSTRAINT TRIGGER customer_unit_range_total AFTER INSERT ON customer_unit_reserved_ranges
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_reservation_total();

CREATE FUNCTION validate_customer_unit_resolution() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE maximum BIGINT;
BEGIN
    PERFORM a.organization_id FROM customer_unit_accounts a JOIN customer_unit_reservations r
        ON r.organization_id=a.organization_id WHERE r.attempt_id=NEW.attempt_id FOR NO KEY UPDATE OF a;
    SELECT maximum_atoms INTO STRICT maximum FROM customer_unit_reservations WHERE attempt_id=NEW.attempt_id;
    IF NEW.charged_atoms>maximum THEN
        RAISE EXCEPTION 'Credits charge exceeds reserved capacity; retain the unresolved hold' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_resolution BEFORE INSERT ON customer_unit_resolutions
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_resolution();

CREATE FUNCTION validate_customer_unit_restoration() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE charged BIGINT; restored BIGINT;
BEGIN
    PERFORM a.organization_id FROM customer_unit_accounts a JOIN customer_unit_reservations r
        ON r.organization_id=a.organization_id WHERE r.attempt_id=NEW.attempt_id FOR NO KEY UPDATE OF a;
    SELECT charged_atoms INTO STRICT charged FROM customer_unit_resolutions
        WHERE attempt_id=NEW.attempt_id AND kind='charge';
    SELECT COALESCE(max(end_atom),0) INTO restored FROM customer_unit_restorations
        WHERE attempt_id=NEW.attempt_id;
    IF NEW.first_atom<>restored OR NEW.end_atom>charged THEN
        RAISE EXCEPTION 'Credits restoration must restore original, not previously restored charge positions'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_restoration BEFORE INSERT ON customer_unit_restorations
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_restoration();

CREATE TRIGGER immutable_customer_unit_reservation BEFORE UPDATE OR DELETE ON customer_unit_reservations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_unit_reserved_range BEFORE UPDATE OR DELETE ON customer_unit_reserved_ranges
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_unit_resolution BEFORE UPDATE OR DELETE ON customer_unit_resolutions
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_unit_restoration BEFORE UPDATE OR DELETE ON customer_unit_restorations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0381_customer_unit_text_tariffs.sql 1254
-- Explicit Credits prices, never reinterpret a monetary price or a purchase
-- conversion as a consumption tariff. Publications share the installation CAS.
CREATE TABLE customer_unit_text_tariffs (
    revision BIGINT PRIMARY KEY CHECK (revision > 0),
    expected_revision BIGINT NOT NULL CHECK (expected_revision >= 0 AND revision=expected_revision+1),
    definition_revision BIGINT NOT NULL REFERENCES customer_unit_definitions(revision),
    model_alias TEXT NOT NULL CHECK (char_length(model_alias) BETWEEN 1 AND 200
        AND model_alias=btrim(model_alias) AND model_alias !~ '[[:cntrl:]]'),
    price JSONB NOT NULL CHECK (jsonb_typeof(price)='object'),
    idempotency_key UUID NOT NULL UNIQUE,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((actor_kind='operator')=(actor_operator_id IS NOT NULL))
);
CREATE INDEX customer_unit_text_tariff_current ON customer_unit_text_tariffs(model_alias,revision DESC);
CREATE TRIGGER immutable_customer_unit_text_tariff BEFORE UPDATE OR DELETE ON customer_unit_text_tariffs
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- @niu-legacy-migration 0382_customer_unit_text_admission.sql 5650
CREATE TABLE customer_unit_operation_tariffs (
    operation_id UUID PRIMARY KEY REFERENCES operations(id),
    revision BIGINT NOT NULL REFERENCES customer_unit_text_tariffs(revision),
    UNIQUE (operation_id,revision)
);
CREATE TABLE customer_unit_attempt_tariffs (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    operation_id UUID NOT NULL,
    revision BIGINT NOT NULL,
    UNIQUE (attempt_id,revision),
    FOREIGN KEY (operation_id,revision) REFERENCES customer_unit_operation_tariffs(operation_id,revision)
);
CREATE FUNCTION validate_customer_unit_tariff_binding() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM operations o JOIN customer_unit_text_tariffs p
        ON p.model_alias=o.model_alias WHERE o.id=NEW.operation_id AND p.revision=NEW.revision)
        OR (TG_TABLE_NAME='customer_unit_attempt_tariffs' AND NOT EXISTS (
            SELECT 1 FROM attempts a WHERE a.id=(to_jsonb(NEW)->>'attempt_id')::uuid
                AND a.operation_id=NEW.operation_id AND a.execution='not_sent'
                AND NOT EXISTS(SELECT 1 FROM customer_attempt_tariffs m WHERE m.attempt_id=a.id)
        )) THEN
        RAISE EXCEPTION 'Credits tariff must match the original operation and unsent attempt'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_operation_tariff BEFORE INSERT ON customer_unit_operation_tariffs
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_tariff_binding();
CREATE TRIGGER validate_customer_unit_attempt_tariff BEFORE INSERT ON customer_unit_attempt_tariffs
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_tariff_binding();
CREATE TRIGGER immutable_customer_unit_operation_tariff BEFORE UPDATE OR DELETE ON customer_unit_operation_tariffs
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_unit_attempt_tariff BEFORE UPDATE OR DELETE ON customer_unit_attempt_tariffs
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- A known liability is preserved even if additional capacity is not available.
CREATE TABLE customer_unit_text_charges (
    attempt_id UUID PRIMARY KEY,
    revision BIGINT NOT NULL,
    charged_atoms BIGINT NOT NULL CHECK (charged_atoms>=0),
    usage JSONB NOT NULL CHECK (jsonb_typeof(usage)='object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (attempt_id,revision) REFERENCES customer_unit_attempt_tariffs(attempt_id,revision)
);
CREATE TRIGGER immutable_customer_unit_text_charge BEFORE UPDATE OR DELETE ON customer_unit_text_charges
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE TABLE customer_unit_reservation_extensions (
    attempt_id UUID PRIMARY KEY REFERENCES customer_unit_reservations(attempt_id),
    additional_atoms BIGINT NOT NULL CHECK (additional_atoms>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION validate_customer_unit_extension() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM a.organization_id FROM customer_unit_accounts a JOIN customer_unit_reservations r
        ON r.organization_id=a.organization_id WHERE r.attempt_id=NEW.attempt_id FOR NO KEY UPDATE OF a;
    IF NOT EXISTS (SELECT 1 FROM customer_unit_reservations r JOIN customer_unit_text_charges c USING(attempt_id)
        WHERE r.attempt_id=NEW.attempt_id AND c.charged_atoms-r.maximum_atoms=NEW.additional_atoms)
        OR EXISTS(SELECT 1 FROM customer_unit_resolutions WHERE attempt_id=NEW.attempt_id) THEN
        RAISE EXCEPTION 'Additional Credits capacity must match the unresolved original liability' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_extension BEFORE INSERT ON customer_unit_reservation_extensions
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_extension();
CREATE TRIGGER immutable_customer_unit_extension BEFORE UPDATE OR DELETE ON customer_unit_reservation_extensions
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE OR REPLACE FUNCTION validate_customer_unit_reservation_total() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT COALESCE(sum(end_atom-first_atom),0) FROM customer_unit_reserved_ranges WHERE attempt_id=NEW.attempt_id)
        <> (SELECT r.maximum_atoms::numeric+COALESCE(e.additional_atoms,0) FROM customer_unit_reservations r
            LEFT JOIN customer_unit_reservation_extensions e USING(attempt_id) WHERE r.attempt_id=NEW.attempt_id) THEN
        RAISE EXCEPTION 'Credits reservation must be fully backed by disjoint ranges' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER customer_unit_extension_total AFTER INSERT ON customer_unit_reservation_extensions
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_reservation_total();

CREATE OR REPLACE FUNCTION validate_customer_unit_resolution() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE maximum NUMERIC;
BEGIN
    PERFORM a.organization_id FROM customer_unit_accounts a JOIN customer_unit_reservations r
        ON r.organization_id=a.organization_id WHERE r.attempt_id=NEW.attempt_id FOR NO KEY UPDATE OF a;
    SELECT r.maximum_atoms::numeric+COALESCE(e.additional_atoms,0) INTO STRICT maximum
        FROM customer_unit_reservations r LEFT JOIN customer_unit_reservation_extensions e USING(attempt_id)
        WHERE r.attempt_id=NEW.attempt_id;
    IF NEW.charged_atoms>maximum THEN
        RAISE EXCEPTION 'Credits charge exceeds reserved capacity; retain the unresolved hold' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

-- @niu-legacy-migration 0383_customer_unit_dispatch_requirement.sql 7304
-- Preserve the existing monetary/personal gate while explicitly requiring
-- unit-price-backed ranges for Credits dispatch, including explicit zero prices.
CREATE FUNCTION niu_customer_unit_text_bound(price JSONB,input_tokens BIGINT,output_tokens BIGINT)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE STRICT AS $$
    SELECT CASE WHEN input_tokens<0 OR output_tokens<0 THEN NULL ELSE
        GREATEST(ceil(max(
            GREATEST((tier->>'prompt_rate')::numeric,
                COALESCE((tier->>'cached_prompt_rate')::numeric,(tier->>'prompt_rate')::numeric),
                COALESCE((tier->>'cache_write_prompt_rate')::numeric,(tier->>'prompt_rate')::numeric))*input_tokens
            + GREATEST((tier->>'completion_rate')::numeric,
                COALESCE((tier->>'reasoning_completion_rate')::numeric,(tier->>'completion_rate')::numeric))*output_tokens
        )/1000000)+(price->>'request_fee_atoms')::numeric,(price->>'minimum_charge_atoms')::numeric)
    END
    FROM jsonb_array_elements(jsonb_build_array(price) || (price->'context_tiers')) tier
    WHERE COALESCE((tier->>'minimum_input_tokens')::bigint,0)<=input_tokens;
$$;

CREATE OR REPLACE FUNCTION require_customer_balance_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mode TEXT;
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    END IF;
    SELECT billing_mode INTO STRICT mode FROM customer_unit_configuration WHERE singleton FOR SHARE;
    -- Funding/account activation takes an organization update lock. Admission
    -- holds a shared lock until commit so activation cannot race this check.
    PERFORM id FROM organizations WHERE id=NEW.organization_id FOR SHARE;
    IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id=NEW.id) THEN
        -- Recheck under locks at the dispatch boundary, not merely at resolution.
        PERFORM v.id FROM vendors v JOIN personal_attempt_routes b ON b.vendor_id=v.id
            WHERE b.attempt_id=NEW.id FOR SHARE OF v;
        PERFORM m.alias FROM vendor_models m WHERE m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id) FOR SHARE;
        IF NOT EXISTS (
            SELECT 1 FROM personal_attempt_routes b
            JOIN personal_vendor_ownership o ON o.vendor_id=b.vendor_id
            JOIN vendors v ON v.id=b.vendor_id
            JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id)
            JOIN api_keys k ON k.id=NEW.api_key_id
            JOIN inspected_guardrail_bindings g ON g.attempt_id=NEW.id AND g.key_id=k.id
            WHERE b.attempt_id=NEW.id AND o.organization_id=NEW.organization_id
                AND v.enabled AND m.enabled
                AND v.revision=b.vendor_revision AND m.revision=b.model_revision
                AND NEW.dispatch_provider=v.adapter
                AND k.organization_id=NEW.organization_id AND k.project_id=NEW.project_id
                AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp()
                AND ('*'=ANY(k.allowed_models) OR NEW.resource_id=ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION 'personal dispatch ownership, policy or route changed' USING ERRCODE='P0011';
        END IF;
        IF EXISTS (SELECT 1 FROM customer_unit_attempt_tariffs WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM customer_unit_reservations WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM provider_attempt_offers WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM account_assignments WHERE attempt_id=NEW.id) THEN
            RAISE EXCEPTION 'personal dispatch has incompatible accounting' USING ERRCODE='P0011';
        END IF;
        RETURN NEW;
    END IF;
    IF mode='credits' THEN
        IF EXISTS(SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=NEW.id)
            OR EXISTS(SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id=NEW.id)
            OR NOT EXISTS (
                SELECT 1 FROM customer_unit_attempt_tariffs t
                JOIN customer_unit_text_tariffs p USING(revision)
                JOIN customer_unit_reservations r ON r.attempt_id=t.attempt_id AND r.definition_revision=p.definition_revision
                JOIN cost_reservations b ON b.attempt_id=r.attempt_id AND b.state='held'
                WHERE t.attempt_id=NEW.id AND r.organization_id=NEW.organization_id AND r.project_id=NEW.project_id
                    AND r.maximum_atoms=niu_customer_unit_text_bound(p.price,b.prompt_bound,b.completion_bound)
                    AND r.maximum_atoms=(SELECT COALESCE(sum(end_atom-first_atom),0)
                        FROM customer_unit_reserved_ranges WHERE attempt_id=NEW.id)
                    AND NOT EXISTS(SELECT 1 FROM customer_unit_resolutions WHERE attempt_id=NEW.id)
            ) THEN
            RAISE EXCEPTION 'Credits dispatch requires its pinned unit price and fully funded ranges' USING ERRCODE='P0009';
        END IF;
        RETURN NEW;
    END IF;
    IF EXISTS(SELECT 1 FROM customer_unit_attempt_tariffs WHERE attempt_id=NEW.id)
        OR EXISTS(SELECT 1 FROM customer_unit_reservations WHERE attempt_id=NEW.id) THEN
        RAISE EXCEPTION 'Currency dispatch cannot reuse Credits accounting' USING ERRCODE='P0009';
    END IF;
    IF EXISTS (SELECT 1 FROM customer_balance_accounts WHERE organization_id=NEW.organization_id)
        AND NOT EXISTS (SELECT 1 FROM customer_balance_reservations
            WHERE attempt_id=NEW.id AND organization_id=NEW.organization_id AND released_at IS NULL)
        AND NOT EXISTS (
            SELECT 1 FROM customer_attempt_tariffs t
            JOIN customer_tariff_revisions r ON r.id=t.revision_id
            JOIN customer_attempt_balance_accounts b ON b.attempt_id=t.attempt_id AND b.currency=r.currency
            WHERE t.attempt_id=NEW.id AND b.organization_id=NEW.organization_id
                AND r.prompt_rate=0 AND r.completion_rate=0 AND COALESCE(r.cached_prompt_rate,0)=0
                AND COALESCE(r.reasoning_completion_rate,0)=0 AND COALESCE(r.cache_write_prompt_rate,0)=0
                AND r.minimum_charge_nanos=0 AND r.request_fee_nanos=0
                AND NOT EXISTS (
                    SELECT 1 FROM jsonb_array_elements(r.context_tiers) tier
                    JOIN cost_reservations bound ON bound.attempt_id=NEW.id
                    WHERE (tier->>'minimum_input_tokens')::bigint <= bound.prompt_bound
                      AND ((tier->>'prompt_rate')::bigint > 0 OR (tier->>'completion_rate')::bigint > 0
                        OR COALESCE((tier->>'cached_prompt_rate')::bigint,0) > 0
                        OR COALESCE((tier->>'cache_write_prompt_rate')::bigint,0) > 0
                        OR COALESCE((tier->>'reasoning_completion_rate')::bigint,0) > 0)
                )
        ) THEN
        RAISE EXCEPTION 'prepaid dispatch requires a funded retail reservation' USING ERRCODE='P0009';
    END IF;
    RETURN NEW;
END;
$$;

