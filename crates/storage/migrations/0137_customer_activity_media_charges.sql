-- Customer-facing activity includes posted media charges, never Supplier costs.
-- A recorded media liability is not a paid charge until its exact debit exists;
-- qualified zero charges instead require their reservation to be released.
CREATE VIEW customer_activity_charges AS
SELECT organization_id, project_id, attempt_id, currency, amount_nanos
FROM customer_charges
UNION ALL
SELECT m.organization_id, m.project_id, m.attempt_id, m.currency, m.amount_nanos
FROM customer_media_charges m
WHERE NOT EXISTS (SELECT 1 FROM customer_charges t WHERE t.attempt_id=m.attempt_id)
AND (
    EXISTS (
        SELECT 1 FROM customer_balance_entries e
        WHERE e.organization_id=m.organization_id AND e.project_id=m.project_id
          AND e.attempt_id=m.attempt_id AND e.currency=m.currency
          AND e.kind='charge' AND e.amount_nanos=-m.amount_nanos
    )
    OR (m.amount_nanos=0 AND EXISTS (
        SELECT 1 FROM customer_balance_reservations r
        WHERE r.organization_id=m.organization_id AND r.attempt_id=m.attempt_id
          AND r.released_at IS NOT NULL
    ))
);

CREATE VIEW customer_activity_priced_attempts AS
SELECT attempt_id FROM customer_attempt_tariffs
UNION
SELECT attempt_id FROM customer_media_attempt_pricing;
