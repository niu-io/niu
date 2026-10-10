WITH windowed AS MATERIALIZED (
    SELECT p.id AS workspace_id, p.name AS workspace_name,
           o.id AS organization_id, o.name AS organization_name
    FROM projects p JOIN organizations o ON o.id=p.organization_id
    WHERE $1::uuid IS NULL OR p.id>$1
    ORDER BY p.id LIMIT ($2+1)
), page AS MATERIALIZED (
    SELECT * FROM windowed ORDER BY workspace_id LIMIT $2
)
SELECT ($1::uuid IS NULL OR EXISTS(SELECT 1 FROM projects WHERE id=$1)),
    jsonb_build_object('data',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY workspace_id) FROM page p),'[]'::jsonb),
    'next_after',CASE WHEN (SELECT count(*)>$2 FROM windowed)
        THEN (SELECT workspace_id FROM page ORDER BY workspace_id DESC LIMIT 1) ELSE NULL END)
