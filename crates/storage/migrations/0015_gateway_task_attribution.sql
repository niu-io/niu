-- Gateway requests are retained at ingestion. This optional caller-supplied
-- identifier lets agent integrations group their model calls into one task.
ALTER TABLE operations
    ADD COLUMN task_id TEXT
    CHECK (task_id IS NULL OR length(task_id) BETWEEN 1 AND 200);

CREATE INDEX operations_task_id
    ON operations (organization_id, project_id, task_id, created_at DESC)
    WHERE task_id IS NOT NULL;
