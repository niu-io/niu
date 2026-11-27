-- One snapshot for cursor validation and bounded metadata pagination.
WITH registered AS MATERIALIZED (
    SELECT m.alias FROM vendor_models m
    WHERE NOT EXISTS (SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=m.vendor_id)
    UNION SELECT alias FROM model_route_pools
), page AS (
    SELECT alias FROM registered WHERE $1::text IS NULL OR alias > $1
    ORDER BY alias LIMIT ($2::bigint + 1)
), visible AS (
    SELECT alias FROM page ORDER BY alias LIMIT $2
)
SELECT jsonb_build_object(
    'cursor_valid', $1::text IS NULL OR EXISTS(SELECT 1 FROM registered WHERE alias=$1),
    'data', COALESCE((SELECT jsonb_agg(jsonb_build_object('model_alias',alias,'text_candidates',(
        SELECT jsonb_agg(jsonb_build_object(
            'alias', m.alias, 'upstream', m.upstream_model,
            'video', m.capabilities ? 'video_schema',
            'outputs', m.capabilities->'catalog'->'output_modalities'
        ))
        FROM vendor_models m
        WHERE NOT EXISTS (SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=m.vendor_id)
          AND m.alias IN (
              SELECT visible.alias
              UNION ALL
              SELECT candidate->>'alias' FROM model_route_pools pool, jsonb_array_elements(pool.candidates) candidate
              WHERE pool.alias=visible.alias
          )
    ),'media_schema',(SELECT m.capabilities->'video_schema' FROM vendor_models m WHERE m.alias=visible.alias AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=m.vendor_id)),'upstream_model',(SELECT m.upstream_model FROM vendor_models m WHERE m.alias=visible.alias AND NOT EXISTS(SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=m.vendor_id))) ORDER BY alias) FROM visible), '[]'::jsonb),
    'next_after', CASE WHEN (SELECT count(*) FROM page)>$2 THEN (SELECT max(alias) FROM visible) ELSE NULL END
)
