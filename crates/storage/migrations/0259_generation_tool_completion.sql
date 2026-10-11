-- A completed client-tool turn is terminal provider work, not task completion.
ALTER TABLE openrouter_usage_reconciliations DROP CONSTRAINT openrouter_usage_reconciliation_evidence_version;
ALTER TABLE openrouter_usage_reconciliations ADD CONSTRAINT openrouter_usage_reconciliation_evidence_version CHECK (
 (source_version='openrouter-native-generation-v1' AND upstream_finish_reason IS NULL AND upstream_cancelled IS NULL)
 OR (source_version='openrouter-native-generation-v2' AND upstream_finish_reason IS NOT NULL
     AND upstream_finish_reason IN ('stop','length','tool_calls') AND upstream_cancelled IS FALSE)
);
