-- Separate known completions from unresolved reservations so historical completed
-- requests can use a time-range index instead of a lineage-wide OR scan.
CREATE INDEX attempts_key_known_token_completion ON attempts(api_key_id,completed_at DESC)
    INCLUDE(prompt_tokens,completion_tokens)
    WHERE dispatched_at IS NOT NULL AND execution='confirmed_completed'
      AND usage_confidence='provider_reported' AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL;
CREATE INDEX attempts_key_unknown_token_usage ON attempts(api_key_id)
    WHERE dispatched_at IS NOT NULL AND execution<>'confirmed_not_executed'
      AND NOT(execution='confirmed_completed' AND usage_confidence='provider_reported' AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL);
CREATE FUNCTION niu_key_token_budget(root UUID, excluded UUID, as_of TIMESTAMPTZ)
RETURNS TABLE(known_tokens NUMERIC,reserved_tokens NUMERIC,unbounded_requests BIGINT)
LANGUAGE SQL STABLE AS $$
    SELECT known.total,pending.total,pending.unbounded
    FROM (
        SELECT COALESCE(sum(a.prompt_tokens::numeric+a.completion_tokens),0) AS total
        FROM attempts a JOIN api_keys k ON k.id=a.api_key_id
        WHERE k.spending_root_id=root AND (excluded IS NULL OR a.id<>excluded)
          AND a.dispatched_at IS NOT NULL AND a.execution='confirmed_completed'
          AND a.usage_confidence='provider_reported' AND a.prompt_tokens IS NOT NULL AND a.completion_tokens IS NOT NULL
          AND a.completed_at>as_of-interval '60 seconds'
    ) known CROSS JOIN (
        SELECT COALESCE(sum(b.token_bound::numeric),0) AS total,count(*) FILTER(WHERE b.token_bound IS NULL) AS unbounded
        FROM attempts a JOIN api_keys k ON k.id=a.api_key_id LEFT JOIN key_attempt_token_bounds b ON b.attempt_id=a.id
        WHERE k.spending_root_id=root AND (excluded IS NULL OR a.id<>excluded)
          AND a.dispatched_at IS NOT NULL AND a.execution<>'confirmed_not_executed'
          AND NOT(a.execution='confirmed_completed' AND a.usage_confidence='provider_reported' AND a.prompt_tokens IS NOT NULL AND a.completion_tokens IS NOT NULL)
    ) pending;
$$;
CREATE OR REPLACE FUNCTION niu_enforce_key_token_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE root UUID; maximum BIGINT; requested BIGINT; committed NUMERIC; unbounded BIGINT; checked_at TIMESTAMPTZ;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN RETURN NEW; END IF;
    SELECT spending_root_id INTO root FROM api_keys WHERE id=NEW.api_key_id;
    IF root IS NULL THEN RETURN NEW; END IF;
    SELECT tokens_per_minute INTO maximum FROM key_token_rate_limits WHERE spending_root_id=root FOR UPDATE;
    IF NOT FOUND OR maximum IS NULL THEN RETURN NEW; END IF;
    IF maximum=0 THEN RAISE EXCEPTION 'API key token rate exhausted' USING ERRCODE='P0022'; END IF;
    SELECT token_bound INTO requested FROM key_attempt_token_bounds WHERE attempt_id=NEW.id;
    IF requested IS NULL THEN RAISE EXCEPTION 'Token budget requires supported bounded text input' USING ERRCODE='P0023'; END IF;
    checked_at := clock_timestamp();
    SELECT known_tokens+reserved_tokens,unbounded_requests INTO committed,unbounded
        FROM niu_key_token_budget(root,NEW.id,checked_at);
    IF unbounded>0 THEN RAISE EXCEPTION 'Existing unknown usage has no token budget' USING ERRCODE='P0023'; END IF;
    IF committed+requested>maximum THEN RAISE EXCEPTION 'API key token rate exhausted' USING ERRCODE='P0022'; END IF;
    RETURN NEW;
END;
$$;
