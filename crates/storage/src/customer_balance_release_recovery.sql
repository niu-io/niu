-- Limit traversal before checking execution. In-flight and uncertain liabilities
-- advance the sweep cursor but must remain reserved.
WITH candidates AS MATERIALIZED (
    SELECT r.attempt_id
    FROM customer_balance_reservations r
    WHERE r.released_at IS NULL
      AND ($1::uuid IS NULL OR r.attempt_id>$1)
    ORDER BY r.attempt_id
    LIMIT $2
)
SELECT a.id,a.organization_id,a.project_id,
    a.execution IN ('not_sent','confirmed_not_executed') AS needs_recovery
FROM candidates r
JOIN attempts a ON a.id=r.attempt_id
ORDER BY a.id
