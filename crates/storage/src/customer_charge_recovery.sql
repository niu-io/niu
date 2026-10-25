-- Bound inspected bindings, not merely matched anomalies. Healthy/unfinished
-- candidates advance the same durable cursor without running settlement writes.
WITH pending AS (
    SELECT t.attempt_id AS id,a.organization_id,a.project_id,a.execution,a.usage_confidence
    FROM customer_attempt_tariffs t
    JOIN attempts a ON a.id=t.attempt_id
    LEFT JOIN customer_charges c ON c.attempt_id=t.attempt_id
    WHERE ($1::uuid IS NULL OR t.attempt_id>$1)
      AND (
        c.attempt_id IS NULL
        OR EXISTS (
          SELECT 1 FROM customer_attempt_balance_accounts b
          WHERE b.attempt_id=a.id AND b.organization_id=a.organization_id AND b.project_id=a.project_id
            AND (
              EXISTS (SELECT 1 FROM customer_balance_reservations r
                      WHERE r.attempt_id=a.id AND r.released_at IS NULL)
              OR (c.amount_nanos>0 AND NOT EXISTS (
                SELECT 1 FROM customer_balance_entries e
                WHERE e.attempt_id=c.attempt_id AND e.kind='charge'
                  AND e.organization_id=c.organization_id AND e.project_id=c.project_id
                  AND e.account_id=b.account_id AND e.currency=c.currency
                  AND e.amount_nanos=-c.amount_nanos
              ))
            )
        )
      )
    UNION ALL
    SELECT b.attempt_id,a.organization_id,a.project_id,a.execution,a.usage_confidence
    FROM customer_unit_attempt_tariffs b JOIN attempts a ON a.id=b.attempt_id
    WHERE ($1::uuid IS NULL OR b.attempt_id>$1)
      AND NOT EXISTS(SELECT 1 FROM customer_unit_resolutions r WHERE r.attempt_id=b.attempt_id)
), candidates AS MATERIALIZED (
    SELECT * FROM pending ORDER BY id LIMIT $2
)
SELECT a.id,a.organization_id,a.project_id,
  (a.execution='confirmed_completed' AND a.usage_confidence='provider_reported') AS needs_recovery
FROM candidates a
ORDER BY a.id
