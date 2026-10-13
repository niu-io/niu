WITH inventory AS (
 SELECT a.id,a.created_at,
 greatest(a.created_at,coalesce((SELECT max(created_at) FROM media_job_observations WHERE attempt_id=a.id),a.created_at)) AS updated_at,
 a.resource_id AS model,nullif(m.capabilities->'catalog'->>'name','') AS model_display_name,
 t.session_id,t.turn_id,
 CASE WHEN t.task_id IS NULL AND NOT EXISTS(SELECT 1 FROM video_submission_intents vi JOIN media_submission_keys sk ON sk.key_digest=sha256(convert_to(vi.submission_key::text,'UTF8')) AND sk.organization_id=vi.organization_id AND sk.project_id=vi.project_id WHERE sk.attempt_id=a.id AND vi.organization_id=a.organization_id AND vi.project_id=a.project_id) THEN 'unknown' ELSE 'generations' END AS source,
 CASE WHEN j.attempt_id IS NULL THEN 'submission_unknown'
 WHEN 'succeeded'=ANY(o.statuses) AND 'failed'=ANY(o.statuses) THEN 'reconciliation_required'
 WHEN 'succeeded'=ANY(o.statuses) THEN 'succeeded'
 WHEN 'failed'=ANY(o.statuses) THEN 'failed'
 WHEN 'unknown'=ANY(o.statuses) OR cardinality(o.statuses)=0 THEN 'unknown'
 WHEN 'running'=ANY(o.statuses) THEN 'running' ELSE 'queued' END AS state
 FROM attempts a JOIN media_recovery_routes r ON r.attempt_id=a.id
 LEFT JOIN media_jobs j ON j.attempt_id=a.id
 LEFT JOIN vendor_models m ON m.alias=a.resource_id
 LEFT JOIN generations_turn_tasks t ON t.task_id=a.id
 LEFT JOIN LATERAL (SELECT ARRAY(SELECT status FROM media_job_observations WHERE attempt_id=a.id) AS statuses) o ON true
 WHERE a.organization_id=$1 AND a.project_id=$2 AND a.dispatched_at IS NOT NULL
 AND (t.task_id IS NULL OR t.owner=$3)
 AND NOT EXISTS(SELECT 1 FROM video_submission_intents vi JOIN media_submission_keys sk ON sk.key_digest=sha256(convert_to(vi.submission_key::text,'UTF8')) AND sk.organization_id=vi.organization_id AND sk.project_id=vi.project_id WHERE sk.attempt_id=a.id AND vi.organization_id=a.organization_id AND vi.project_id=a.project_id AND vi.owner<>$3)
), filtered AS (
 SELECT * FROM inventory WHERE ($4::text IS NULL OR state=$4)
 AND ($5::uuid IS NULL OR session_id=$5)
), all_outputs AS (
 SELECT i.*,r.kind,r.created_at AS output_created_at,
 CASE WHEN r.expires_at<=clock_timestamp() THEN 'expired'
 WHEN r.deleted_at IS NOT NULL THEN 'deleted'
 WHEN i.state<>'succeeded' OR r.ciphertext IS NULL THEN 'unavailable'
 ELSE 'available' END AS availability
 FROM inventory i JOIN media_result_references r ON r.attempt_id=i.id
)
, outputs AS (
 SELECT * FROM all_outputs WHERE ($4::text IS NULL OR state=$4)
 AND ($5::uuid IS NULL OR session_id=$5)
)
