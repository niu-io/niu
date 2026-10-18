-- Traverse a bounded page before inspecting observations. Completed history
-- advances the cursor without repeatedly searching its retained observations.
-- Each scalar probe is unique on (attempt_id, status); avoid a hashed EXISTS
-- alternative that could materialize unrelated observation history.
WITH candidates AS MATERIALIZED (
    SELECT a.id,a.organization_id,a.project_id
    FROM media_jobs j
    JOIN attempts a ON a.id=j.attempt_id
    WHERE a.execution='may_have_executed'
      AND ($1::uuid IS NULL OR j.attempt_id>$1)
    ORDER BY j.attempt_id
    LIMIT $2
)
SELECT a.id,a.organization_id,a.project_id,
    ((SELECT true FROM media_job_observations o
      WHERE o.attempt_id=a.id AND o.status='succeeded') IS TRUE
     AND (SELECT true FROM media_job_observations o
          WHERE o.attempt_id=a.id AND o.status='failed') IS NOT TRUE) AS needs_recovery
FROM candidates a
ORDER BY a.id
