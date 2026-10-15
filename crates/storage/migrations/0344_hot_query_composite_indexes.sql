-- Add composite indexes for chat_sessions pagination, quota_observations,
-- execution_imports, account_assignments, and dispatched attempts (#27 #138).

CREATE INDEX IF NOT EXISTS chat_sessions_owner_archived_created_idx
    ON chat_sessions(organization_id, project_id, owner, archived, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS chat_sessions_project_created_idx
    ON chat_sessions(organization_id, project_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS quota_observations_by_project
    ON quota_observations(organization_id, project_id);

CREATE INDEX IF NOT EXISTS execution_imports_by_project_imported
    ON execution_imports(organization_id, project_id, imported_at DESC, id);

CREATE INDEX IF NOT EXISTS account_assignments_by_project_account
    ON account_assignments(organization_id, project_id, account_id, attempt_id);

CREATE INDEX IF NOT EXISTS attempts_by_project_dispatched
    ON attempts(organization_id, project_id, dispatched_at, id)
    WHERE dispatched_at IS NOT NULL AND execution <> 'confirmed_not_executed';
