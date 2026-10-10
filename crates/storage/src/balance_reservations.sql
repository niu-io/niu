WITH page AS MATERIALIZED (
    SELECT r.attempt_id,r.created_at,r.currency,r.amount_nanos::text AS reserved_nanos,
        CASE WHEN EXISTS(SELECT 1 FROM customer_balance_entries e
            WHERE e.attempt_id=r.attempt_id AND e.kind='charge') THEN '0'
          ELSE GREATEST(r.amount_nanos,COALESCE(m.amount_nanos,0))::text END AS outstanding_nanos,
        a.project_id AS workspace_id,p.name AS workspace_name,a.api_key_id,k.name AS api_key_name,
        a.resource_id AS model,a.execution,a.usage_confidence,
        CASE WHEN a.execution='confirmed_completed' AND a.usage_confidence='unknown' THEN 'usage_unknown'
          WHEN a.execution='confirmed_completed' THEN 'settlement_pending'
          WHEN a.execution='may_have_executed' THEN 'execution_unknown'
          WHEN a.dispatched_at IS NULL THEN 'preparing'
          ELSE 'in_progress' END AS status,
        statement_timestamp() AS observed_at
    FROM customer_balance_reservations r
    JOIN attempts a ON a.id=r.attempt_id AND a.organization_id=r.organization_id
    JOIN projects p ON p.id=a.project_id AND p.organization_id=a.organization_id
    LEFT JOIN api_keys k ON k.id=a.api_key_id AND k.organization_id=a.organization_id AND k.project_id=a.project_id
    LEFT JOIN customer_media_charges m ON m.attempt_id=r.attempt_id
    WHERE r.organization_id=$1 AND r.released_at IS NULL AND ($3::text IS NULL OR r.currency=$3)
      AND ($2::uuid IS NULL OR (r.created_at,r.attempt_id)<(
          SELECT created_at,attempt_id FROM customer_balance_reservations
          WHERE organization_id=$1 AND attempt_id=$2))
    ORDER BY r.created_at DESC,r.attempt_id DESC LIMIT $4
)
SELECT ($2::uuid IS NULL OR EXISTS(
    SELECT 1 FROM customer_balance_reservations WHERE organization_id=$1 AND attempt_id=$2
      AND ($3::text IS NULL OR currency=$3))),
    COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC,p.attempt_id DESC) FROM page p),'[]'::jsonb)
