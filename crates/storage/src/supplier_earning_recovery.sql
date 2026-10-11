-- Page bindings before checking eligibility so settled or unfinished history
-- cannot force an unbounded anomaly search. The cursor advances for every row.
WITH candidates AS MATERIALIZED (
    SELECT b.attempt_id
    FROM provider_attempt_offers b
    WHERE ($1::uuid IS NULL OR b.attempt_id>$1)
    ORDER BY b.attempt_id
    LIMIT 100
)
SELECT a.id,a.organization_id,a.project_id,
    (e.attempt_id IS NULL AND a.execution='confirmed_completed'
     AND (a.usage_confidence='provider_reported' OR EXISTS (
         SELECT 1 FROM supplier_media_attempt_pricing p WHERE p.attempt_id=a.id
     ))) AS needs_recovery
FROM candidates b
JOIN attempts a ON a.id=b.attempt_id
LEFT JOIN provider_earnings e ON e.attempt_id=a.id
ORDER BY a.id
