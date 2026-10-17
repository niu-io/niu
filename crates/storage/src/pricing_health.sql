WITH names AS (SELECT DISTINCT unnest($1::text[]) AS alias), routes AS (
    SELECT n.alias AS public_alias, n.alias AS route
    FROM names n WHERE NOT EXISTS(SELECT 1 FROM model_route_pools p WHERE p.alias=n.alias)
    UNION ALL
    SELECT n.alias, c->>'alias' FROM names n JOIN model_route_pools p ON p.alias=n.alias
    CROSS JOIN LATERAL jsonb_array_elements(p.candidates) c
    WHERE p.organization_id IS NULL AND (c->>'enabled')::boolean
)
SELECT jsonb_build_object('model_alias',routes.public_alias,'route',routes.route,
    'configured',m.alias IS NOT NULL,'provider',b.name,'currency',COALESCE(r.currency,m.pricing->>'currency'),
    'rate_kind',r.rate_kind,
    'media_cards',COALESCE((SELECT jsonb_agg(c.document) FROM supplier_media_rate_cards c
        WHERE c.offer_revision=r.id AND c.provider_id=o.provider_id
          AND c.effective_from <= extract(epoch FROM statement_timestamp())
          AND (c.effective_until IS NULL OR c.effective_until > extract(epoch FROM statement_timestamp()))
          AND NOT EXISTS(SELECT 1 FROM supplier_media_rate_retirements retired
              WHERE retired.provider_id=c.provider_id AND retired.revision=c.revision
                AND retired.effective_until <= extract(epoch FROM statement_timestamp()))),'[]'::jsonb),
    'schedule',CASE WHEN r.id IS NOT NULL THEN jsonb_build_object(
        'prompt_rate',r.prompt_rate::text,'completion_rate',r.completion_rate::text,
        'cached_prompt_rate',r.cached_prompt_rate::text,'cache_write_prompt_rate',r.cache_write_prompt_rate::text,
        'reasoning_completion_rate',r.reasoning_completion_rate::text,'context_tiers',r.context_tiers)
    WHEN m.pricing IS NOT NULL THEN jsonb_build_object(
        'prompt_rate',m.pricing->>'cash_prompt_rate','completion_rate',m.pricing->>'cash_completion_rate',
        'context_tiers','[]'::jsonb) END)
FROM routes
LEFT JOIN vendor_models m ON m.alias=routes.route
    AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership own WHERE own.vendor_id=m.vendor_id)
LEFT JOIN provider_offers o ON o.model_alias=m.alias AND o.vendor_id=m.vendor_id
LEFT JOIN provider_offer_revisions r ON r.id=o.current_revision
LEFT JOIN provider_businesses b ON b.id=o.provider_id
