WITH offer AS MATERIALIZED (
    SELECT id, model_alias, current_revision FROM provider_offers
    WHERE provider_id=$1 AND id=$2
), anchor AS MATERIALIZED (
    SELECT r.created_at,r.id FROM provider_offer_revisions r
    JOIN offer t ON t.id=r.offer_id WHERE r.id=$3
), windowed AS MATERIALIZED (
    SELECT r.* FROM provider_offer_revisions r JOIN offer t ON t.id=r.offer_id
    WHERE $3::uuid IS NULL OR (r.created_at,r.id)<(SELECT created_at,id FROM anchor)
    ORDER BY r.created_at DESC,r.id DESC LIMIT ($4+1)
), page AS MATERIALIZED (
    SELECT * FROM windowed ORDER BY created_at DESC,id DESC LIMIT $4
)
SELECT ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM anchor)),
    jsonb_build_object(
        'current_revision',t.current_revision,
        'data',COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'model_alias',t.model_alias,'revision',r.id,'currency',r.currency,
            'prompt_rate',r.prompt_rate::text,'completion_rate',r.completion_rate::text,
            'cached_prompt_rate',r.cached_prompt_rate::text,'reasoning_completion_rate',r.reasoning_completion_rate::text,'cache_write_prompt_rate',r.cache_write_prompt_rate::text,'context_tiers',r.context_tiers,
            'rate_kind',r.rate_kind,
            'created_at',r.created_at,'is_current',r.id=t.current_revision
        ) ORDER BY r.created_at DESC,r.id DESC) FROM page r),'[]'::jsonb),
        'has_more',(SELECT COUNT(*)>$4 FROM windowed),
        'next_before',CASE WHEN (SELECT COUNT(*)>$4 FROM windowed)
            THEN (SELECT id FROM page ORDER BY created_at,id LIMIT 1) ELSE NULL END
    )
FROM offer t
