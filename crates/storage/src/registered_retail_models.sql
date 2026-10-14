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
    'data', COALESCE((SELECT jsonb_agg(jsonb_build_object('model_alias',alias) ORDER BY alias) FROM visible), '[]'::jsonb),
    'next_after', CASE WHEN (SELECT count(*) FROM page)>$2 THEN (SELECT max(alias) FROM visible) ELSE NULL END
)
