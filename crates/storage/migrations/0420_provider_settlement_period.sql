-- Record a payout for every unpaid earning in one currency through a cutoff,
-- without requiring an explicit request-level selection. Existing settlements
-- keep NULL period bounds and remain valid.
-- The cutoff is inclusive; period_start_ms is optional and inclusive.
ALTER TABLE provider_settlements
    ADD COLUMN period_start_ms BIGINT,
    ADD COLUMN cutoff_ms BIGINT;
ALTER TABLE provider_settlements
    ADD CONSTRAINT provider_settlement_period_shape CHECK (
        (period_start_ms IS NULL AND cutoff_ms IS NULL)
        OR (cutoff_ms BETWEEN 0 AND 253402300799999
            AND (period_start_ms IS NULL
                 OR (period_start_ms BETWEEN 0 AND 253402300799999
                     AND period_start_ms < cutoff_ms)))
    );
-- Period settlement reads unpaid rows by currency and time before inserting
-- entries. Keep that selection on the existing Provider ledger index family.
CREATE INDEX provider_earnings_currency_history
    ON provider_earnings(provider_id, currency, created_at, attempt_id);
