SELECT p.id,p.name,p.route_slug,
    o.id AS organization_id,o.name AS organization_name,(EXTRACT(EPOCH FROM p.created_at)*1000)::bigint AS created_at_ms,
    (SELECT COUNT(*) FROM api_keys k WHERE k.organization_id=p.organization_id AND k.project_id=p.id AND k.revoked_at IS NULL AND k.expires_at>now()) AS active_key_count,
    (SELECT COUNT(*) FROM operations r WHERE r.organization_id=p.organization_id AND r.project_id=p.id AND r.created_at>=now()-interval '30 days') AS requests_30d,
    (SELECT (EXTRACT(EPOCH FROM MAX(r.created_at))*1000)::bigint FROM operations r WHERE r.organization_id=p.organization_id AND r.project_id=p.id) AS last_request_at_ms,
    (SELECT jsonb_agg(jsonb_build_object('start_ms',(EXTRACT(EPOCH FROM d.day)*1000)::bigint,'request_count',COALESCE(daily.cnt,0)) ORDER BY d.day)
     FROM generate_series(date_trunc('day',now(), 'UTC')-interval '29 days',date_trunc('day',now(), 'UTC'),interval '1 day') d(day)
     LEFT JOIN (
         SELECT date_trunc('day',r.created_at,'UTC') AS bucket_day, COUNT(*) AS cnt
         FROM operations r
         WHERE r.organization_id=p.organization_id
           AND r.project_id=p.id
           AND r.created_at>=date_trunc('day',now(), 'UTC')-interval '29 days'
           AND r.created_at<date_trunc('day',now(), 'UTC')+interval '1 day'
         GROUP BY 1
     ) daily ON daily.bucket_day=d.day) AS requests_by_day,
    EXISTS(SELECT 1 FROM default_workspace d WHERE d.organization_id=p.organization_id AND d.project_id=p.id AND d.singleton) AS is_default
FROM projects p JOIN organizations o ON o.id=p.organization_id
WHERE ($1::uuid IS NULL OR o.id=$1) AND ($2::uuid IS NULL OR p.id=$2)
  AND ($3::text IS NULL OR (o.created_at,o.id,p.created_at,p.id)>($3::timestamptz,$4::uuid,$5::timestamptz,$6::uuid))
ORDER BY o.created_at,o.id,p.created_at,p.id
LIMIT $7
