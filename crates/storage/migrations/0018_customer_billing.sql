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
