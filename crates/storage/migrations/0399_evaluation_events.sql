-- Receipts and their notifications commit together; immutable replay emits none.
ALTER TABLE workspace_events DROP CONSTRAINT workspace_events_event_type_check;
ALTER TABLE workspace_events ADD CHECK(event_type IN ('pool.changed','evaluation.recorded','subscription.test'));
ALTER TABLE workspace_events DROP CONSTRAINT workspace_events_resource_kind_check;
ALTER TABLE workspace_events ADD CHECK(resource_kind IN ('pool','evaluation','subscription'));
ALTER TABLE workspace_events ADD COLUMN resource_run TEXT;
ALTER TABLE workspace_events ADD CHECK (
    (event_type='evaluation.recorded' AND resource_kind='evaluation' AND resource_run IS NOT NULL
      AND resource_run ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(resource_run)<=80)
    OR (event_type<>'evaluation.recorded' AND resource_run IS NULL)
);
