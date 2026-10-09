-- Shared admission state, not payment evidence or an accounting record.
CREATE TABLE payment_query_limits (
    aggregator TEXT NOT NULL CHECK (aggregator ~ '^[a-z0-9]{1,32}$'),
    merchant TEXT NOT NULL CHECK (merchant ~ '^[A-Za-z0-9]{1,64}$'),
    next_query_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (aggregator, merchant)
);
