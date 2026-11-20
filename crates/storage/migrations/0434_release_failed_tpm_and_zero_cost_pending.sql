-- Release leaked TPM/concurrency holds on failed requests and exclude failed zero-cost
-- attempts from Unresolved customer charges without mutating immutable observations.

ALTER TABLE request_failures ADD COLUMN recorded_at TIMESTAMPTZ;
ALTER TABLE request_failures ALTER COLUMN recorded_at SET DEFAULT clock_timestamp();

CREATE OR REPLACE FUNCTION niu_request_failure_releases_tpm_immediately(
    p_kind TEXT,
    p_status SMALLINT,
    p_phase TEXT
) RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE AS $$
    SELECT (p_kind = 'upstream_http_error' AND p_status IN (400, 401, 403, 404, 413, 422, 429))
        OR p_kind IN ('upstream_region_unavailable', 'upstream_account_restricted')
        OR (p_kind = 'upstream_connection_error' AND COALESCE(p_phase, 'connection') = 'connection');
$$;

CREATE OR REPLACE FUNCTION niu_key_token_budget(root UUID, excluded UUID, as_of TIMESTAMPTZ)
RETURNS TABLE(known_tokens NUMERIC, reserved_tokens NUMERIC, unbounded_requests BIGINT)
LANGUAGE SQL STABLE AS $$
    SELECT
        COALESCE((
            SELECT sum(a.prompt_tokens::numeric + a.completion_tokens::numeric)
            FROM api_keys k
            JOIN attempts a ON a.api_key_id = k.id
            WHERE k.spending_root_id = root
              AND (excluded IS NULL OR a.id <> excluded)
              AND a.dispatched_at IS NOT NULL
              AND a.execution = 'confirmed_completed'
              AND a.usage_confidence = 'provider_reported'
              AND a.prompt_tokens IS NOT NULL
              AND a.completion_tokens IS NOT NULL
              AND a.completed_at > as_of - interval '60 seconds'
        ), 0) AS known_tokens,
        pending.total AS reserved_tokens,
        pending.unbounded AS unbounded_requests
    FROM (
        SELECT
            COALESCE(sum(b.token_bound::numeric), 0) AS total,
            count(*) FILTER (WHERE b.token_bound IS NULL) AS unbounded
        FROM api_keys k
        JOIN attempts a ON a.api_key_id = k.id
        LEFT JOIN key_attempt_token_bounds b ON b.attempt_id = a.id
        LEFT JOIN request_failures rf ON rf.attempt_id = a.id
        LEFT JOIN request_timings rt ON rt.attempt_id = a.id
        WHERE k.spending_root_id = root
          AND (excluded IS NULL OR a.id <> excluded)
          AND a.dispatched_at IS NOT NULL
          AND a.execution <> 'confirmed_not_executed'
          AND NOT (
              a.execution = 'confirmed_completed'
              AND a.usage_confidence = 'provider_reported'
              AND a.prompt_tokens IS NOT NULL
              AND a.completion_tokens IS NOT NULL
          )
          AND NOT (
              rf.attempt_id IS NOT NULL
              AND niu_request_failure_releases_tpm_immediately(rf.kind, rf.upstream_http_status, rf.transport_phase)
          )
          AND (
              COALESCE(
                  a.completed_at,
                  rf.recorded_at,
                  CASE
                      WHEN rf.attempt_id IS NOT NULL THEN
                          a.dispatched_at + (COALESCE(rt.total_ms, 0) * interval '1 millisecond')
                  END
              ) IS NULL
              OR COALESCE(
                  a.completed_at,
                  rf.recorded_at,
                  CASE
                      WHEN rf.attempt_id IS NOT NULL THEN
                          a.dispatched_at + (COALESCE(rt.total_ms, 0) * interval '1 millisecond')
                  END
              ) > as_of - interval '60 seconds'
          )
    ) pending;
$$;

CREATE OR REPLACE FUNCTION niu_enforce_key_concurrency() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    root UUID;
    maximum BIGINT;
    running BIGINT;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP = 'UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN
        RETURN NEW;
    END IF;
    SELECT spending_root_id INTO root FROM api_keys WHERE id = NEW.api_key_id;
    IF root IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT max_concurrent_requests INTO maximum FROM key_concurrency_limits
        WHERE spending_root_id = root FOR UPDATE;
    IF NOT FOUND OR maximum IS NULL THEN
        RETURN NEW;
    END IF;
    -- Count durable unresolved dispatches, including work admitted before policy activation.
    -- Terminal completion or upstream error evidence releases occupancy; client stream disconnects do not.
    SELECT count(*) INTO running FROM attempts a JOIN api_keys k ON k.id = a.api_key_id
        WHERE k.spending_root_id = root AND a.id <> NEW.id
          AND a.dispatched_at IS NOT NULL AND a.execution = 'may_have_executed'
          AND a.completed_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM request_failures rf
              WHERE rf.attempt_id = a.id AND rf.kind <> 'response_stream_cancelled'
          );
    IF running >= maximum THEN
        RAISE EXCEPTION 'API key concurrent request limit reached' USING ERRCODE = 'P0021';
    END IF;
    RETURN NEW;
END;
$$;

-- A failed request pinned to a guaranteed zero-cost customer tariff has $0 max liability
-- even if the gateway stays conservative about upstream execution uncertainty.
CREATE OR REPLACE FUNCTION niu_attempt_failed_zero_cost(p_attempt_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM request_failures rf WHERE rf.attempt_id = p_attempt_id)
       AND NOT EXISTS (SELECT 1 FROM customer_charges c WHERE c.attempt_id = p_attempt_id)
       AND NOT EXISTS (SELECT 1 FROM customer_media_charges mc WHERE mc.attempt_id = p_attempt_id)
       AND NOT EXISTS (SELECT 1 FROM customer_unit_resolutions ur WHERE ur.attempt_id = p_attempt_id AND ur.kind = 'charge')
       AND (
           EXISTS (
               SELECT 1 FROM customer_attempt_tariffs t
               JOIN customer_tariff_revisions r ON r.id = t.revision_id
               WHERE t.attempt_id = p_attempt_id
                 AND r.prompt_rate = 0
                 AND r.completion_rate = 0
                 AND COALESCE(r.cached_prompt_rate, 0) = 0
                 AND COALESCE(r.reasoning_completion_rate, 0) = 0
                 AND COALESCE(r.cache_write_prompt_rate, 0) = 0
                 AND r.minimum_charge_nanos = 0
                 AND r.request_fee_nanos = 0
                 AND NOT EXISTS (
                     SELECT 1 FROM jsonb_array_elements(r.context_tiers) tier
                     WHERE (tier->>'prompt_rate')::bigint > 0
                        OR (tier->>'completion_rate')::bigint > 0
                        OR COALESCE((tier->>'cached_prompt_rate')::bigint, 0) > 0
                        OR COALESCE((tier->>'cache_write_prompt_rate')::bigint, 0) > 0
                        OR COALESCE((tier->>'reasoning_completion_rate')::bigint, 0) > 0
                 )
           )
           OR EXISTS (
               SELECT 1 FROM customer_media_attempt_pricing m
               WHERE m.attempt_id = p_attempt_id
                 AND COALESCE((m.snapshot->'tariff'->>'amount_units')::numeric, -1) = 0
           )
           OR EXISTS (
               SELECT 1 FROM customer_unit_attempt_tariffs ut
               JOIN customer_unit_text_tariffs p USING (revision)
               WHERE ut.attempt_id = p_attempt_id
                 AND COALESCE((p.price->>'prompt_rate')::bigint, -1) = 0
                 AND COALESCE((p.price->>'completion_rate')::bigint, -1) = 0
                 AND COALESCE((p.price->>'cached_prompt_rate')::bigint, 0) = 0
                 AND COALESCE((p.price->>'cache_write_prompt_rate')::bigint, 0) = 0
                 AND COALESCE((p.price->>'reasoning_completion_rate')::bigint, 0) = 0
                 AND COALESCE((p.price->>'request_fee_atoms')::bigint, -1) = 0
                 AND COALESCE((p.price->>'minimum_charge_atoms')::bigint, -1) = 0
                 AND NOT EXISTS (
                     SELECT 1 FROM jsonb_array_elements(COALESCE(p.price->'context_tiers', '[]'::jsonb)) tier
                     WHERE COALESCE((tier->>'prompt_rate')::bigint, 0) > 0
                        OR COALESCE((tier->>'completion_rate')::bigint, 0) > 0
                        OR COALESCE((tier->>'cached_prompt_rate')::bigint, 0) > 0
                        OR COALESCE((tier->>'cache_write_prompt_rate')::bigint, 0) > 0
                        OR COALESCE((tier->>'reasoning_completion_rate')::bigint, 0) > 0
                 )
           )
           OR EXISTS (
               SELECT 1 FROM customer_unit_media_attempt_tariffs um
               JOIN customer_unit_media_tariffs p USING (revision)
               WHERE um.attempt_id = p_attempt_id
                 AND COALESCE((p.price->>'amount_atoms')::numeric, -1) = 0
           )
       );
$$;
