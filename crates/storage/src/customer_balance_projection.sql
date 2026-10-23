-- Shared customer/platform balance arithmetic; scoped company IDs are bound by the caller.
WITH accounts AS MATERIALIZED (
                SELECT a.*,
                    a.posted_balance_nanos AS balance,
                    COALESCE((SELECT SUM(r.amount_nanos) FROM customer_balance_reservations r
                        WHERE r.account_id=a.id AND r.released_at IS NULL),0) AS reserved,
                    COALESCE((SELECT SUM(GREATEST(r.amount_nanos, COALESCE(m.amount_nanos,0)))
                        FROM customer_balance_reservations r
                        LEFT JOIN customer_media_charges m ON m.attempt_id=r.attempt_id
                        WHERE r.account_id=a.id AND r.released_at IS NULL
                          AND NOT EXISTS (SELECT 1 FROM customer_balance_entries e
                              WHERE e.attempt_id=r.attempt_id AND e.kind='charge')),0) AS outstanding
                FROM customer_balance_accounts a WHERE a.organization_id=ANY($1::uuid[])
            )
            SELECT organization_id,jsonb_build_object(
                'currency',currency,'balance_nanos',balance::text,
                'credit_limit_nanos',credit_limit_nanos::text,
                'policy_revision',policy_revision::text,
                'warning_threshold_nanos',warning_threshold_nanos::text,
                'low_balance',CASE WHEN warning_threshold_nanos IS NULL THEN false
                    ELSE balance<warning_threshold_nanos END,
                'posted_credit_exhausted',balance+credit_limit_nanos<=0,
                'reserved_nanos',reserved::text,'outstanding_nanos',outstanding::text,
                'available_nanos',(balance+credit_limit_nanos-outstanding)::text
            ) FROM accounts ORDER BY organization_id,currency;
