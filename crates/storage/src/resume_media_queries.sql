-- Bound resumed jobs just like newly discovered jobs. Concurrent recovery
-- workers skip claimed rows instead of waiting behind another resumption batch.
WITH resumable AS (
    SELECT s.attempt_id
    FROM media_query_schedule s
    JOIN attempts a ON a.id = s.attempt_id
    JOIN api_keys original ON original.id = a.api_key_id
    WHERE s.stopped
      AND a.execution = 'may_have_executed'
      AND (original.revoked_at IS NOT NULL OR original.expires_at <= clock_timestamp())
      AND NOT EXISTS (
          SELECT 1 FROM media_job_observations o
          WHERE o.attempt_id = a.id AND o.status IN ('succeeded', 'failed')
      )
      AND EXISTS (
          SELECT 1 FROM api_keys current
          WHERE current.spending_root_id = original.spending_root_id
            AND current.organization_id = a.organization_id
            AND current.project_id = a.project_id
            AND current.revoked_at IS NULL
            AND current.expires_at > clock_timestamp()
            AND ('*' = ANY(current.allowed_models) OR a.resource_id = ANY(current.allowed_models))
      )
    ORDER BY s.attempt_id
    LIMIT 100
    FOR UPDATE OF s SKIP LOCKED
)
UPDATE media_query_schedule s
SET stopped = false, next_poll_at = now()
FROM resumable r
WHERE s.attempt_id = r.attempt_id
