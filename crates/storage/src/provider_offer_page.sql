WITH supplier AS MATERIALIZED (
    SELECT id FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL
), anchor AS MATERIALIZED (
    SELECT model_alias FROM provider_offers WHERE provider_id=$1 AND model_alias=$2
), windowed AS MATERIALIZED (
    SELECT o.* FROM provider_offers o JOIN supplier s ON s.id=o.provider_id
    WHERE $2::text IS NULL OR o.model_alias>(SELECT model_alias FROM anchor)
    ORDER BY o.model_alias LIMIT ($3+1)
), page AS MATERIALIZED (
    SELECT * FROM windowed ORDER BY model_alias LIMIT $3
)
SELECT ($2::text IS NULL OR EXISTS(SELECT 1 FROM anchor)),
    jsonb_build_object(
        'data',COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id',o.id,'model_alias',o.model_alias,'active',o.active,
            'qualified',niu_offer_qualification_current(o.provider_id,o.id,o.current_revision),
            'revision',r.id,'rate_kind',r.rate_kind,'currency',r.currency,
            'prompt_rate',r.prompt_rate::text,'completion_rate',r.completion_rate::text,
            'cached_prompt_rate',r.cached_prompt_rate::text,'reasoning_completion_rate',r.reasoning_completion_rate::text,'cache_write_prompt_rate',r.cache_write_prompt_rate::text,'context_tiers',r.context_tiers,
            'route_ready',m.enabled AND v.enabled AND m.vendor_id=o.vendor_id
                AND niu_offer_qualification_current(o.provider_id,o.id,o.current_revision)
        ) ORDER BY o.model_alias) FROM page o
        JOIN provider_offer_revisions r ON r.id=o.current_revision
        JOIN vendor_models m ON m.alias=o.model_alias
        JOIN vendors v ON v.id=m.vendor_id),'[]'::jsonb),
        'next_after',CASE WHEN (SELECT count(*) FROM windowed)>$3
            THEN (SELECT model_alias FROM page ORDER BY model_alias DESC LIMIT 1) ELSE NULL END
    ) FROM supplier;
