ALTER TABLE codex_usage_imports
    ADD COLUMN unconfirmed_response_count BIGINT NOT NULL DEFAULT 0
        CHECK (unconfirmed_response_count >= 0);
