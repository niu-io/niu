-- Match tenant equality and the stable keyset order used by key metadata pages.
-- Preserve expired/revoked records: both remain part of the saved directory.
CREATE INDEX api_keys_workspace_created
    ON api_keys (organization_id, project_id, created_at, id);
