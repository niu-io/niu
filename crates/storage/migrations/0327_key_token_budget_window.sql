-- Bound completed unknown-usage attempts in niu_key_token_budget to the 60-second
-- rolling window while retaining in-flight/unresolved dispatches (completed_at IS NULL).

DROP INDEX IF EXISTS attempts_key_unknown_token_usage;
CREATE INDEX attempts_key_unknown_token_usage ON attempts(api_key_id, completed_at DESC)
    INCLUDE(id)
    WHERE dispatched_at IS NOT NULL AND execution<>'confirmed_not_executed'
      AND NOT(execution='confirmed_completed' AND usage_confidence='provider_reported' AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL);

CREATE OR REPLACE FUNCTION niu_key_token_budget(root UUID, excluded UUID, as_of TIMESTAMPTZ)
RETURNS TABLE(known_tokens NUMERIC,reserved_tokens NUMERIC,unbounded_requests BIGINT)
LANGUAGE SQL STABLE AS $$
    SELECT known.total,pending.total,pending.unbounded
    FROM (
        SELECT COALESCE(sum(a.prompt_tokens::numeric+a.completion_tokens),0) AS total
        FROM api_keys k
        JOIN attempts a ON a.api_key_id=k.id
        WHERE k.spending_root_id=root AND (excluded IS NULL OR a.id<>excluded)
          AND a.dispatched_at IS NOT NULL AND a.execution='confirmed_completed'
          AND a.usage_confidence='provider_reported' AND a.prompt_tokens IS NOT NULL AND a.completion_tokens IS NOT NULL
          AND a.completed_at>as_of-interval '60 seconds'
    ) known CROSS JOIN (
        SELECT COALESCE(sum(b.token_bound::numeric),0) AS total,count(*) FILTER(WHERE b.token_bound IS NULL) AS unbounded
        FROM api_keys k
        JOIN attempts a ON a.api_key_id=k.id
        LEFT JOIN key_attempt_token_bounds b ON b.attempt_id=a.id
        WHERE k.spending_root_id=root AND (excluded IS NULL OR a.id<>excluded)
          AND a.dispatched_at IS NOT NULL AND a.execution<>'confirmed_not_executed'
          AND NOT(execution='confirmed_completed' AND usage_confidence='provider_reported' AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL)
          AND (a.completed_at IS NULL OR a.completed_at>as_of-interval '60 seconds')
    ) pending;
$$;
