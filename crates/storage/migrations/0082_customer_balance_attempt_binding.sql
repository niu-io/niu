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
