-- Limit traversal before checking execution. In-flight and uncertain liabilities
-- advance the sweep cursor but must remain reserved.
WITH pending AS (
    SELECT r.attempt_id
    FROM customer_balance_reservations r
    WHERE r.released_at IS NULL
      AND ($1::uuid IS NULL OR r.attempt_id>$1)
    UNION ALL
    SELECT r.attempt_id FROM customer_unit_reservations r
    WHERE NOT EXISTS(SELECT 1 FROM customer_unit_resolutions c WHERE c.attempt_id=r.attempt_id)
      AND ($1::uuid IS NULL OR r.attempt_id>$1)
), candidates AS MATERIALIZED (
    SELECT * FROM pending ORDER BY attempt_id LIMIT $2
)
SELECT a.id,a.organization_id,a.project_id,
    a.execution IN ('not_sent','confirmed_not_executed') AS needs_recovery
FROM candidates r
JOIN attempts a ON a.id=r.attempt_id
ORDER BY a.id
