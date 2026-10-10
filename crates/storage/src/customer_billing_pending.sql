-- Text and media have separate immutable price bindings and charge ledgers.
-- Classify dispatched work using its own meter; personal routes are funded by
-- their owner and are outside the customer tariff lifecycle.
WITH pending AS (
    SELECT
        t.attempt_id IS NOT NULL OR m.attempt_id IS NOT NULL AS priced,
        (t.attempt_id IS NOT NULL AND c.attempt_id IS NULL)
            OR (m.attempt_id IS NOT NULL AND mc.attempt_id IS NULL) AS unresolved
    FROM attempts a
    LEFT JOIN customer_attempt_tariffs t ON t.attempt_id = a.id
    LEFT JOIN customer_charges c ON c.attempt_id = a.id
    LEFT JOIN customer_media_attempt_pricing m ON m.attempt_id = a.id
    LEFT JOIN customer_media_charges mc ON mc.attempt_id = a.id
    WHERE a.organization_id = $1 AND a.project_id = $2
        AND a.dispatched_at IS NOT NULL
        AND a.execution <> 'confirmed_not_executed'
        AND NOT EXISTS (
            SELECT 1 FROM personal_attempt_routes p WHERE p.attempt_id = a.id
        )
)
SELECT
    COUNT(*) FILTER (WHERE unresolved)::text,
    COUNT(*) FILTER (WHERE NOT priced)::text
FROM pending
