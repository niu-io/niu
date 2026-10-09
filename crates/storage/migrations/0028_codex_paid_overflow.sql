ALTER TABLE codex_usage_fee_settings
    ADD COLUMN paid_overflow_usd_cents BIGINT
        CHECK (paid_overflow_usd_cents IS NULL OR paid_overflow_usd_cents BETWEEN 0 AND 100000000);
