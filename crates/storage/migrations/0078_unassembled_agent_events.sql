-- Previous adapters stored isolated native events as runs. Retain them as evidence,
-- but exclude them from the default session/run report when correlation was lost.
ALTER TABLE personal_agent_traces ADD COLUMN unassembled_event BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE personal_agent_traces ADD COLUMN superseded_by UUID REFERENCES personal_agent_traces(id) ON DELETE CASCADE;
UPDATE personal_agent_traces SET unassembled_event=TRUE
WHERE source='codex' AND session_key IS NULL
  AND name IN ('Codex API request','Codex response completion','Codex tool')
  AND record->>'task_id' = 'task-' || record_id
  AND record_id ~ '^[a-f0-9]{64}$';
