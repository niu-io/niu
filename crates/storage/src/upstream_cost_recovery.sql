-- Traverse held procurement reservations before checking eligibility. Unknown
-- and in-flight attempts advance traversal without releasing their liabilities.
WITH candidates AS MATERIALIZED (
    SELECT r.attempt_id
    FROM cost_reservations r
    WHERE r.state='held'
      AND ($1::uuid IS NULL OR r.attempt_id>$1)
    ORDER BY r.attempt_id
    LIMIT $2
)
SELECT a.id,a.organization_id,a.project_id,
    (a.execution='confirmed_not_executed'
     OR (a.execution='confirmed_completed'
         AND a.usage_confidence='provider_reported')) AS needs_recovery
FROM candidates r
JOIN attempts a ON a.id=r.attempt_id
ORDER BY a.id
