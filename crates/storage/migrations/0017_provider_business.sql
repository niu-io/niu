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
