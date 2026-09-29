-- Keep recent workspace activity and its cursor pages bounded by the index.
CREATE INDEX attempts_project_recent
    ON attempts (organization_id, project_id, created_at DESC, id DESC);
