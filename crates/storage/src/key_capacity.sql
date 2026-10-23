-- Refs #107: diagnostic membership mirrors key_concurrency and niu_key_token_budget.
-- One statement snapshot prevents totals and rows describing different moments.
WITH anchor AS MATERIALIZED (
    SELECT spending_root_id FROM api_keys
    WHERE organization_id=$1 AND project_id=$2 AND id=$3
), lineage AS MATERIALIZED (
    SELECT k.id,k.name FROM api_keys k JOIN anchor r ON r.spending_root_id=k.spending_root_id
    WHERE k.organization_id=$1 AND k.project_id=$2
), contributors AS MATERIALIZED (
    SELECT a.id,a.created_at,a.dispatched_at,a.completed_at,a.execution,
           o.model_alias,k.name AS key_name,b.token_bound
    FROM lineage k JOIN attempts a ON a.api_key_id=k.id
    JOIN operations o ON o.id=a.operation_id AND o.organization_id=$1 AND o.project_id=$2
    LEFT JOIN key_attempt_token_bounds b ON b.attempt_id=a.id
    WHERE a.organization_id=$1 AND a.project_id=$2 AND a.dispatched_at IS NOT NULL
      AND CASE WHEN $4='concurrency' THEN a.execution='may_have_executed'
          ELSE a.execution<>'confirmed_not_executed'
            AND NOT(a.execution='confirmed_completed' AND a.usage_confidence='provider_reported'
                    AND a.prompt_tokens IS NOT NULL AND a.completion_tokens IS NOT NULL)
            AND (a.completed_at IS NULL OR a.completed_at>statement_timestamp()-interval '60 seconds') END
), page AS (
    SELECT * FROM contributors WHERE $5::uuid IS NULL OR id>$5 ORDER BY id LIMIT ($6::bigint+1)
), visible AS (SELECT * FROM page ORDER BY id LIMIT $6)
SELECT jsonb_build_object(
    'snapshot_at',statement_timestamp(),
    'cursor_valid',$5::uuid IS NULL OR EXISTS(
        SELECT 1 FROM attempts a JOIN lineage k ON k.id=a.api_key_id WHERE a.id=$5
    ),
    'total',(SELECT count(*) FROM contributors),
    'data',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'attempt_id',id,'model_alias',model_alias,'key_name',key_name,
        'created_at',created_at,'dispatched_at',dispatched_at,'completed_at',completed_at,
        'execution',execution,'reserved_tokens',token_bound::text
    ) ORDER BY id) FROM visible),'[]'::jsonb),
    'next_after',CASE WHEN (SELECT count(*) FROM page)>$6 THEN (SELECT id FROM visible ORDER BY id DESC LIMIT 1) ELSE NULL END
) WHERE EXISTS(SELECT 1 FROM anchor)
