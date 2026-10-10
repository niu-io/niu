WITH tariff AS MATERIALIZED (
    SELECT id, model_alias, current_revision FROM customer_tariffs
    WHERE organization_id=$1 AND project_id=$2 AND model_alias=$3
), anchor AS MATERIALIZED (
    SELECT r.created_at,r.id FROM customer_tariff_revisions r
    JOIN tariff t ON t.id=r.tariff_id WHERE r.id=$4
), windowed AS MATERIALIZED (
    SELECT r.* FROM customer_tariff_revisions r JOIN tariff t ON t.id=r.tariff_id
    WHERE $4::uuid IS NULL OR (r.created_at,r.id)<(SELECT created_at,id FROM anchor)
    ORDER BY r.created_at DESC,r.id DESC LIMIT ($5+1)
), page AS MATERIALIZED (
    SELECT * FROM windowed ORDER BY created_at DESC,id DESC LIMIT $5
)
SELECT ($4::uuid IS NULL OR EXISTS(SELECT 1 FROM anchor)),
    jsonb_build_object(
        'current_revision',t.current_revision,
        'data',COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'model_alias',t.model_alias,'revision',r.id,'currency',r.currency,
            'prompt_rate',r.prompt_rate::text,'completion_rate',r.completion_rate::text,
            'cached_prompt_rate',r.cached_prompt_rate::text,
            'minimum_charge_nanos',r.minimum_charge_nanos::text,
            'request_fee_nanos',r.request_fee_nanos::text,
            'created_at',r.created_at,'is_current',r.id=t.current_revision
        ) ORDER BY r.created_at DESC,r.id DESC) FROM page r),'[]'::jsonb),
        'has_more',(SELECT COUNT(*)>$5 FROM windowed),
        'next_before',CASE WHEN (SELECT COUNT(*)>$5 FROM windowed)
            THEN (SELECT id FROM page ORDER BY created_at,id LIMIT 1) ELSE NULL END
    )
FROM tariff t
