-- Older receipts did not retain these terminal fields. Never invent their values.
ALTER TABLE openrouter_usage_reconciliations
    ADD COLUMN upstream_finish_reason TEXT,
    ADD COLUMN upstream_cancelled BOOLEAN;
ALTER TABLE openrouter_usage_reconciliations
    DROP CONSTRAINT openrouter_usage_reconciliations_source_version_check;
ALTER TABLE openrouter_usage_reconciliations
    ADD CONSTRAINT openrouter_usage_reconciliation_evidence_version CHECK (
        (source_version='openrouter-native-generation-v1'
            AND upstream_finish_reason IS NULL AND upstream_cancelled IS NULL)
        OR (source_version='openrouter-native-generation-v2'
            AND upstream_finish_reason IS NOT NULL
            AND upstream_finish_reason IN ('stop','length')
            AND upstream_cancelled IS FALSE)
    );
-- Keep the old default for older writers; new writers explicitly identify v2.
