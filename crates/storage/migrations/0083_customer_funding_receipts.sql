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
