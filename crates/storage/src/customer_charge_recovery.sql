-- Repair the complete prepaid posting, including historical charges whose
-- debit was skipped. Legacy invoice-only charges need no prepaid ledger entry.
SELECT a.id,a.organization_id,a.project_id
FROM attempts a
JOIN customer_attempt_tariffs t ON t.attempt_id=a.id
LEFT JOIN customer_charges c ON c.attempt_id=a.id
WHERE a.execution='confirmed_completed' AND a.usage_confidence='provider_reported'
  AND ($1::uuid IS NULL OR a.id>$1)
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
ORDER BY a.id
LIMIT 100
