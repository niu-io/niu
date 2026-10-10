-- Count known unsettled media overruns in workspace and key commitments.
-- Original reservations remain immutable; posted charges and refunds retain
-- their existing exactly-once contribution.

CREATE OR REPLACE FUNCTION niu_customer_workspace_committed(p_organization UUID,p_project UUID,p_account UUID)
RETURNS NUMERIC LANGUAGE sql VOLATILE AS $$
    SELECT COALESCE((SELECT -SUM(e.amount_nanos) FROM customer_balance_entries e
        WHERE e.organization_id=p_organization AND e.project_id=p_project
          AND e.account_id=p_account AND e.kind='charge'),0)
        - COALESCE((SELECT SUM(r.amount_nanos) FROM customer_balance_entries r
            JOIN customer_balance_entries c ON c.id=r.reverses_entry_id
            WHERE r.account_id=p_account AND r.kind='refund'
              AND c.organization_id=p_organization AND c.project_id=p_project AND c.kind='charge'),0)
        + COALESCE((SELECT SUM(GREATEST(r.amount_nanos, COALESCE(m.amount_nanos, 0))) FROM customer_balance_reservations r
            LEFT JOIN customer_media_charges m ON m.attempt_id=r.attempt_id
            JOIN customer_attempt_balance_accounts b ON b.attempt_id=r.attempt_id
            WHERE b.organization_id=p_organization AND b.project_id=p_project
              AND r.account_id=p_account AND r.released_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM customer_balance_entries e
                  WHERE e.attempt_id=r.attempt_id AND e.kind='charge')),0)
$$;

CREATE OR REPLACE FUNCTION niu_customer_key_committed(p_root UUID,p_account UUID)
RETURNS NUMERIC LANGUAGE sql VOLATILE AS $$
    SELECT COALESCE((SELECT -SUM(e.amount_nanos) FROM customer_balance_entries e
        WHERE e.account_id=p_account AND e.kind='charge'
          AND niu_customer_attempt_spending_root(e.attempt_id)=p_root),0)
      - COALESCE((SELECT SUM(r.amount_nanos) FROM customer_balance_entries r
        JOIN customer_balance_entries c ON c.id=r.reverses_entry_id
        WHERE r.account_id=p_account AND r.kind='refund' AND c.kind='charge'
          AND niu_customer_attempt_spending_root(c.attempt_id)=p_root),0)
      + COALESCE((SELECT SUM(GREATEST(r.amount_nanos, COALESCE(m.amount_nanos, 0))) FROM customer_balance_reservations r
            LEFT JOIN customer_media_charges m ON m.attempt_id=r.attempt_id
        WHERE r.account_id=p_account AND r.released_at IS NULL
          AND niu_customer_attempt_spending_root(r.attempt_id)=p_root
          AND NOT EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.attempt_id=r.attempt_id AND e.kind='charge')),0)
$$;

