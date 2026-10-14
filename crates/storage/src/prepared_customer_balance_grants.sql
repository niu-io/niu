WITH windowed AS MATERIALIZED (
    SELECT i.* FROM prepared_customer_balance_grants i
    WHERE i.organization_id=$1 AND i.currency=$2 AND ($5::uuid IS NULL OR i.idempotency_key=$5)
      AND ($3::uuid IS NULL OR (i.created_at,i.id)<(SELECT c.created_at,c.id FROM prepared_customer_balance_grants c WHERE c.id=$3 AND c.organization_id=$1 AND c.currency=$2))
    ORDER BY i.created_at DESC,i.id DESC LIMIT ($4+1)
), page AS MATERIALIZED (SELECT * FROM windowed ORDER BY created_at DESC,id DESC LIMIT $4), projected AS (
    SELECT i.id,i.created_at,jsonb_build_object('id',i.id,'idempotency_key',i.idempotency_key,'currency',i.currency,'amount_nanos',i.amount_nanos::text,'reason',i.reason,'application_policy',i.application_policy,'created_at',i.created_at,
        'status',CASE WHEN g.id IS NULL THEN 'prepared' ELSE 'issued' END,
        'result',CASE WHEN g.id IS NULL THEN NULL ELSE jsonb_build_object('id',g.id,'application_policy',i.application_policy,'applied_to_credit_nanos',allocated.amount::text,'retained_for_future_consumption_nanos',(g.amount_nanos::numeric-allocated.amount)::text) END) AS document
    FROM page i LEFT JOIN customer_balance_grants g ON g.organization_id=i.organization_id AND g.idempotency_key=i.idempotency_key
    LEFT JOIN LATERAL (SELECT COALESCE(sum(a.amount_nanos::numeric),0) AS amount FROM customer_grant_credit_applications a WHERE a.grant_id=g.id) allocated ON true
)
SELECT EXISTS(SELECT 1 FROM organizations WHERE id=$1) AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM prepared_customer_balance_grants WHERE id=$3 AND organization_id=$1 AND currency=$2)),
    jsonb_build_object('data',COALESCE((SELECT jsonb_agg(document ORDER BY created_at DESC,id DESC) FROM projected),'[]'::jsonb),
        'next_before',CASE WHEN (SELECT count(*)>$4 FROM windowed) THEN (SELECT id FROM page ORDER BY created_at,id LIMIT 1) ELSE NULL END);
