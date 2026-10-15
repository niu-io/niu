WITH owned AS MATERIALIZED (
    SELECT vendor_id FROM vendor_supplier_ownership WHERE provider_id=$1
), scoped AS (
    SELECT a.resource_id,a.execution,a.usage_confidence,a.prompt_tokens,a.completion_tokens,
        f.attempt_id AS failure,t.total_ms,t.complete
    FROM attempts a
    LEFT JOIN request_failures f ON f.attempt_id=a.id
    LEFT JOIN request_timings t ON t.attempt_id=a.id
    WHERE a.dispatched_at>=to_timestamp($2::double precision/1000)
      AND a.dispatched_at<to_timestamp($3::double precision/1000)
      AND (EXISTS (SELECT 1 FROM managed_attempt_routes r JOIN owned o ON o.vendor_id=r.vendor_id WHERE r.attempt_id=a.id)
        OR EXISTS (SELECT 1 FROM media_recovery_routes r JOIN owned o ON o.vendor_id=r.vendor_id WHERE r.attempt_id=a.id))
), grouped AS (
    SELECT resource_id AS model,GROUPING(resource_id) AS summary,
        COUNT(*)::text AS requests,
        COUNT(*) FILTER(WHERE execution='confirmed_completed')::text AS completed,
        COUNT(*) FILTER(WHERE execution='may_have_executed')::text AS execution_unknown,
        COUNT(*) FILTER(WHERE usage_confidence='provider_reported' AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL)::text AS known_token_usage_requests,
        COUNT(*) FILTER(WHERE usage_confidence<>'provider_reported' OR prompt_tokens IS NULL OR completion_tokens IS NULL)::text AS unknown_token_usage_requests,
        COALESCE(SUM(prompt_tokens) FILTER(WHERE usage_confidence='provider_reported' AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL),0)::text AS prompt_tokens,
        COALESCE(SUM(completion_tokens) FILTER(WHERE usage_confidence='provider_reported' AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL),0)::text AS completion_tokens,
        COUNT(failure)::text AS failures,
        COUNT(total_ms)::text AS observed_timing_requests,
        COUNT(*) FILTER(WHERE complete)::text AS complete_timing_requests,
        SUM(total_ms) FILTER(WHERE complete)::text AS complete_total_ms
    FROM scoped GROUP BY GROUPING SETS ((resource_id),())
), page AS (
    SELECT to_jsonb(g)-'summary' AS value,model FROM grouped g
    WHERE summary=0 AND ($4::text IS NULL OR model>$4)
    ORDER BY model LIMIT $5
)
SELECT EXISTS(SELECT 1 FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL),
    jsonb_build_object('from_ms',$2::bigint,'to_ms',$3::bigint,'observed_at',statement_timestamp(),
        'totals',(SELECT to_jsonb(g)-'summary'-'model' FROM grouped g WHERE summary=1),
        'models',COALESCE((SELECT jsonb_agg(value ORDER BY model) FROM page),'[]'::jsonb))
