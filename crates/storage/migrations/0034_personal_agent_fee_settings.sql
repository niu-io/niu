CREATE TABLE agent_observation_fee_settings (
    owner_id UUID PRIMARY KEY REFERENCES admin_operators(id),
    period_from_ms BIGINT NOT NULL CHECK (period_from_ms >= 0),
    period_to_ms BIGINT NOT NULL CHECK (period_to_ms > period_from_ms AND period_to_ms - period_from_ms <= 31622400000),
    subscription_fee_usd_cents BIGINT CHECK (subscription_fee_usd_cents BETWEEN 0 AND 100000000),
    paid_overflow_usd_cents BIGINT CHECK (paid_overflow_usd_cents BETWEEN 0 AND 100000000),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
