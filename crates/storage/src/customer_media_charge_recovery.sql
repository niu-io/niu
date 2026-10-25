-- Bound eligibility checks to one page of actual customer pricing bindings.
-- Personal media history has no binding and must not drive a settlement scan.
WITH pending AS (
    SELECT p.attempt_id
    FROM customer_media_attempt_pricing p
    WHERE ($1::uuid IS NULL OR p.attempt_id > $1)
      AND NOT EXISTS (
          SELECT 1 FROM customer_media_charges c
          JOIN customer_activity_charges posted
            ON posted.attempt_id = c.attempt_id
           AND posted.organization_id = c.organization_id
           AND posted.project_id = c.project_id
           AND posted.currency = c.currency
           AND posted.amount_nanos = c.amount_nanos
          WHERE c.attempt_id = p.attempt_id
      )
    UNION ALL
    SELECT b.attempt_id
    FROM customer_unit_media_attempt_tariffs b
    WHERE ($1::uuid IS NULL OR b.attempt_id > $1)
      AND NOT EXISTS (
          SELECT 1 FROM customer_unit_resolutions r
          WHERE r.attempt_id = b.attempt_id AND r.kind = 'charge'
      )
), candidates AS MATERIALIZED (
    SELECT attempt_id FROM pending ORDER BY attempt_id LIMIT $2
)
SELECT a.id, a.organization_id, a.project_id,
    (a.execution = 'confirmed_completed'
     AND EXISTS (SELECT 1 FROM media_job_observations o WHERE o.attempt_id = a.id AND o.status = 'succeeded')
     AND NOT EXISTS (SELECT 1 FROM media_job_observations o WHERE o.attempt_id = a.id AND o.status = 'failed')) AS needs_recovery
FROM candidates p
JOIN attempts a ON a.id = p.attempt_id
ORDER BY a.id
