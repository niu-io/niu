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
