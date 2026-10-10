WITH account AS MATERIALIZED (
    SELECT id, policy_revision FROM customer_balance_accounts
    WHERE organization_id=$1 AND currency=$2
), windowed AS MATERIALIZED (
    SELECT h.revision::text, h.credit_limit_nanos::text,
           h.warning_threshold_nanos::text, h.created_at,
           h.revision=a.policy_revision AS is_current
    FROM customer_balance_policy_revisions h JOIN account a ON a.id=h.account_id
    WHERE ($3::bigint IS NULL OR h.revision<$3)
    ORDER BY h.revision DESC LIMIT ($4+1)
), page AS MATERIALIZED (
    SELECT * FROM windowed ORDER BY revision::bigint DESC LIMIT $4
)
SELECT ($3::bigint IS NULL OR EXISTS(
    SELECT 1 FROM customer_balance_policy_revisions h
    WHERE h.account_id=a.id AND h.revision=$3)),
    jsonb_build_object('current_revision',a.policy_revision::text,
        'data',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.revision::bigint DESC) FROM page p),'[]'::jsonb),
        'next_before',CASE WHEN (SELECT count(*)>$4 FROM windowed)
            THEN (SELECT revision FROM page ORDER BY revision::bigint LIMIT 1) ELSE NULL END)
FROM account a
