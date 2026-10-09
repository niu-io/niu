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
