ALTER TABLE codex_usage_imports
    ADD COLUMN consent_version TEXT,
    ADD COLUMN consented_at TIMESTAMPTZ,
    ADD CONSTRAINT codex_usage_imports_consent_version
        CHECK (consent_version IS NULL OR consent_version = 'codex-rollout-import-v1'),
    ADD CONSTRAINT codex_usage_imports_consent_pair
        CHECK ((consent_version IS NULL) = (consented_at IS NULL));
