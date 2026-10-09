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
