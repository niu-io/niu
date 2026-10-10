WITH cursor_row AS (
    SELECT created_at,id FROM provider_settlements
    WHERE provider_id=$1 AND id=$2
      AND ($3::text IS NULL OR currency=$3)
      AND ($4::bigint IS NULL OR created_at>=to_timestamp($4::double precision/1000))
      AND ($5::bigint IS NULL OR created_at<to_timestamp($5::double precision/1000))
), selected AS MATERIALIZED (
    SELECT id,currency,amount_nanos,payment_reference,created_at
    FROM provider_settlements
    WHERE provider_id=$1
      AND ($3::text IS NULL OR currency=$3)
      AND ($4::bigint IS NULL OR created_at>=to_timestamp($4::double precision/1000))
      AND ($5::bigint IS NULL OR created_at<to_timestamp($5::double precision/1000))
      AND ($2::uuid IS NULL OR (created_at,id)<(SELECT created_at,id FROM cursor_row))
    ORDER BY created_at DESC,id DESC LIMIT $6+1
), page AS (
    SELECT * FROM selected ORDER BY created_at DESC,id DESC LIMIT $6
)
SELECT ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM cursor_row)),
    jsonb_build_object(
        'data',COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id',id,'currency',currency,'amount_nanos',amount_nanos::text,
            'payment_reference',payment_reference,'created_at',created_at
        ) ORDER BY created_at DESC,id DESC) FROM page),'[]'::jsonb),
        'next_cursor',CASE WHEN (SELECT count(*) FROM selected)>$6
            THEN (SELECT id FROM page ORDER BY created_at,id LIMIT 1) ELSE NULL END)
FROM provider_businesses WHERE id=$1 AND deleted_at IS NULL
