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
