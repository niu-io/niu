WITH target AS MATERIALIZED (
    SELECT id FROM projects WHERE organization_id=$1 AND id=$2
), windowed AS MATERIALIZED (
    SELECT t.model_alias,r.id AS revision,r.currency,r.prompt_rate::text,
           r.completion_rate::text,r.cached_prompt_rate::text,
           r.minimum_charge_nanos::text,r.request_fee_nanos::text,r.created_at
    FROM customer_tariffs t JOIN customer_tariff_revisions r ON r.id=t.current_revision
    WHERE t.organization_id=$1 AND t.project_id=$2 AND ($3::text IS NULL OR t.model_alias>$3)
    ORDER BY t.model_alias LIMIT ($4+1)
), page AS MATERIALIZED (
    SELECT * FROM windowed ORDER BY model_alias LIMIT $4
)
SELECT ($3::text IS NULL OR EXISTS(SELECT 1 FROM customer_tariffs
    WHERE organization_id=$1 AND project_id=$2 AND model_alias=$3)),
    jsonb_build_object('data',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY model_alias) FROM page p),'[]'::jsonb),
    'next_after',CASE WHEN (SELECT count(*)>$4 FROM windowed)
        THEN (SELECT model_alias FROM page ORDER BY model_alias DESC LIMIT 1) ELSE NULL END)
FROM target
