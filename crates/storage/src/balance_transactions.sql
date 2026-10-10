WITH page AS MATERIALIZED (
    SELECT e.id,e.kind,e.currency,e.amount_nanos::text,e.created_at,e.reverses_entry_id
    FROM customer_balance_entries e
    WHERE e.organization_id=$1 AND ($3::text IS NULL OR e.currency=$3)
      AND ($4::text IS NULL OR e.kind=$4)
      AND ($2::uuid IS NULL OR (e.created_at,e.id)<(
          SELECT created_at,id FROM customer_balance_entries WHERE organization_id=$1 AND id=$2))
    ORDER BY e.created_at DESC,e.id DESC LIMIT 101
)
SELECT ($2::uuid IS NULL OR EXISTS(
    SELECT 1 FROM customer_balance_entries
    WHERE organization_id=$1 AND id=$2 AND ($3::text IS NULL OR currency=$3)
      AND ($4::text IS NULL OR kind=$4))),
    COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.created_at DESC,p.id DESC) FROM page p),'[]'::jsonb)
