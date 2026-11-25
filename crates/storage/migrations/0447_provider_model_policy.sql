-- Persist Provider-level model access policy (all / allowlist / blocklist),
-- explicit allowlist/blocklist model aliases, and default purchase discount
-- in basis points (10000 = 100% = no discount).
ALTER TABLE provider_businesses
    ADD COLUMN model_access_mode TEXT NOT NULL DEFAULT 'all'
    CHECK (model_access_mode IN ('all', 'allowlist', 'blocklist')),
    ADD COLUMN default_discount_bps INTEGER NOT NULL DEFAULT 10000
    CHECK (default_discount_bps BETWEEN 10 AND 100000),
    ADD COLUMN allowlisted_models TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
    ADD COLUMN blocklisted_models TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
