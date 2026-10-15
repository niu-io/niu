WITH cursor_row AS (
    SELECT created_at,attempt_id FROM provider_earnings
    WHERE provider_id=$1 AND attempt_id=$2
      AND ($3::text IS NULL OR currency=$3)
      AND ($4::bigint IS NULL OR created_at>=to_timestamp($4::double precision/1000))
      AND ($5::bigint IS NULL OR created_at<to_timestamp($5::double precision/1000))
), selected AS MATERIALIZED (
    SELECT attempt_id,revision_id,currency,amount_nanos,billing_meter,created_at,context_minimum_input_tokens,prompt_tokens,completion_tokens,cached_prompt_tokens,cache_write_prompt_tokens,reasoning_completion_tokens
    FROM provider_earnings
    WHERE provider_id=$1
      AND ($3::text IS NULL OR currency=$3)
      AND ($4::bigint IS NULL OR created_at>=to_timestamp($4::double precision/1000))
      AND ($5::bigint IS NULL OR created_at<to_timestamp($5::double precision/1000))
      AND ($2::uuid IS NULL OR (created_at<(SELECT created_at FROM cursor_row) OR (created_at=(SELECT created_at FROM cursor_row) AND attempt_id>(SELECT attempt_id FROM cursor_row))))
    ORDER BY created_at DESC,attempt_id ASC LIMIT $6+1
), page AS (
    SELECT * FROM selected ORDER BY created_at DESC,attempt_id ASC LIMIT $6
)
SELECT ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM cursor_row)),
    jsonb_build_object(
        'data',COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id',page.attempt_id,'currency',page.currency,'amount_nanos',page.amount_nanos::text,
            'created_at',page.created_at,'billing_meter',page.billing_meter,
            'revision',page.revision_id,
            'offer_id',r.offer_id,
            'context_minimum_input_tokens',page.context_minimum_input_tokens::text,
            'prompt_tokens',page.prompt_tokens::text,'completion_tokens',page.completion_tokens::text,
            'cached_prompt_tokens',page.cached_prompt_tokens::text,'cache_write_prompt_tokens',page.cache_write_prompt_tokens::text,
            'reasoning_completion_tokens',page.reasoning_completion_tokens::text,
            'model_alias',o.model_alias,
            'status',CASE WHEN EXISTS(SELECT 1 FROM provider_settlement_entries paid WHERE paid.attempt_id=page.attempt_id) THEN 'paid' ELSE 'accrued' END
        ) ORDER BY page.created_at DESC,page.attempt_id ASC)
        FROM page
        LEFT JOIN provider_offer_revisions r ON r.id=page.revision_id
        LEFT JOIN provider_offers o ON o.id=r.offer_id),'[]'::jsonb),
        'next_cursor',CASE WHEN (SELECT count(*) FROM selected)>$6
            THEN (SELECT attempt_id FROM page ORDER BY created_at ASC,attempt_id DESC LIMIT 1) ELSE NULL END)
FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL
