ALTER TABLE chat_sessions ADD COLUMN archived BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX chat_sessions_archive_recent
ON chat_sessions (organization_id, project_id, owner, archived, updated_at DESC);
