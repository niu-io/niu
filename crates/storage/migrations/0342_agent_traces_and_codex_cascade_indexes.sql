-- Add foreign-key cascade indexes on personal_agent_traces(superseded_by) and
-- codex_usage_responses(organization_id, project_id, import_id) (#27 #136).

CREATE INDEX IF NOT EXISTS personal_agent_traces_superseded_by
    ON personal_agent_traces(superseded_by)
    WHERE superseded_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS codex_usage_responses_by_import
    ON codex_usage_responses(organization_id, project_id, import_id);
