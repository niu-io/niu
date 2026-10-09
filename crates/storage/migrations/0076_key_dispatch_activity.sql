-- Last-used metadata comes from durable dispatch intent, not authentication or payload retention.
CREATE INDEX attempts_key_latest_dispatch
    ON attempts (organization_id, project_id, api_key_id, dispatched_at DESC)
    WHERE api_key_id IS NOT NULL AND dispatched_at IS NOT NULL;
