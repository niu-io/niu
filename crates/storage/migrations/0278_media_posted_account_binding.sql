-- One posted-media predicate for reporting, recovery and invoice issuance.
-- Keep the original attempt account binding; a different account cannot settle it.
CREATE OR REPLACE VIEW customer_activity_charges AS
SELECT organization_id, project_id, attempt_id, currency, amount_nanos
FROM customer_charges
UNION ALL
SELECT m.organization_id, m.project_id, m.attempt_id, m.currency, m.amount_nanos
FROM customer_media_charges m
JOIN customer_attempt_balance_accounts b
    ON b.attempt_id=m.attempt_id AND b.organization_id=m.organization_id
    AND b.project_id=m.project_id AND b.currency=m.currency
WHERE NOT EXISTS (SELECT 1 FROM customer_charges t WHERE t.attempt_id=m.attempt_id)
AND (
    (m.amount_nanos>0 AND EXISTS (
        SELECT 1 FROM customer_balance_entries e
        WHERE e.account_id=b.account_id AND e.organization_id=m.organization_id
          AND e.project_id=m.project_id AND e.attempt_id=m.attempt_id
          AND e.currency=m.currency AND e.kind='charge'
          AND e.amount_nanos=-m.amount_nanos
    ))
    OR (m.amount_nanos=0 AND EXISTS (
        SELECT 1 FROM customer_balance_reservations r
        WHERE r.account_id=b.account_id AND r.organization_id=m.organization_id
          AND r.attempt_id=m.attempt_id AND r.released_at IS NOT NULL
    ))
);
