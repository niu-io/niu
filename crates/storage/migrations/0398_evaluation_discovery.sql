-- Discovery is a scoped snapshot, not a resumable chronological event feed.
CREATE INDEX evaluation_attempt_discovery ON evaluation_attempt_bindings
    (organization_id, project_id, evaluation_slug, evaluation_revision, sample, attempt_id);
