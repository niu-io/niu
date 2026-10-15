WITH inventory AS (
 SELECT a.id,a.created_at,
 greatest(a.created_at,coalesce((SELECT max(created_at) FROM media_job_observations WHERE attempt_id=a.id),a.created_at)) AS updated_at,
 a.resource_id AS model,nullif(m.capabilities->'catalog'->>'name','') AS model_display_name,
 CASE WHEN nullif(m.capabilities->'catalog'->>'name','') IS NULL THEN 'unknown' ELSE 'current_catalog' END AS model_display_name_source,
 -- Dispatch context comes only from immutable saved records. Current Supplier
 -- names, endpoints, account identifiers and credentials are intentionally absent.
 jsonb_build_object(
  'submitted_model',a.resource_id,
  'dispatched_model',nullif(r.upstream_model,''),
  'provider',nullif(r.adapter,''),
  'channel',protocol.channel,
  'dispatched_at',a.dispatched_at,
  'source','saved_execution',
  'parameters',saved_parameters.controls,
  'parameters_source',CASE WHEN saved_parameters.controls IS NULL THEN 'unknown' ELSE 'saved_validated_snapshot' END,
  'references_state','not_in_execution_snapshot'
 ) AS execution_context,
 -- A committed intent submission resolves its original attempt even if the
 -- separate explicit task association response was lost. Writes enforce that
 -- an explicit association and this immutable intent binding agree.
 coalesce(t.session_id,intent_binding.session_id) AS session_id,
 coalesce(t.turn_id,intent_binding.turn_id) AS turn_id,
 CASE WHEN t.task_id IS NULL AND NOT EXISTS(SELECT 1 FROM video_submission_intents vi JOIN media_submission_keys sk ON sk.key_digest=niu_submission_key_digest(vi.submission_key) AND sk.organization_id=vi.organization_id AND sk.project_id=vi.project_id WHERE sk.attempt_id=a.id AND vi.organization_id=a.organization_id AND vi.project_id=a.project_id) THEN 'unknown' ELSE 'generations' END AS source,
 CASE WHEN j.attempt_id IS NULL THEN 'submission_unknown'
 WHEN 'succeeded'=ANY(o.statuses) AND 'failed'=ANY(o.statuses) THEN 'reconciliation_required'
 WHEN 'succeeded'=ANY(o.statuses) THEN 'succeeded'
 WHEN 'failed'=ANY(o.statuses) THEN 'failed'
 WHEN 'unknown'=ANY(o.statuses) OR cardinality(o.statuses)=0 THEN 'unknown'
 WHEN 'running'=ANY(o.statuses) THEN 'running' ELSE 'queued' END AS state
 FROM attempts a JOIN media_recovery_routes r ON r.attempt_id=a.id
 LEFT JOIN media_jobs j ON j.attempt_id=a.id
 LEFT JOIN media_recovery_protocols protocol ON protocol.attempt_id=a.id
 LEFT JOIN media_output_snapshots output_snapshot ON output_snapshot.attempt_id=a.id
 LEFT JOIN LATERAL (
  -- Only proven validated scalar controls are exposed. No full request, callback,
  -- financial estimate, procurement data or Provider reference is serialized.
  SELECT jsonb_object_agg(control.key,control.value) AS controls
  FROM jsonb_each(CASE WHEN jsonb_typeof(output_snapshot.document->'effective_controls')='object'
    THEN output_snapshot.document->'effective_controls' ELSE '{}'::jsonb END) control
  WHERE (control.key IN ('duration','seed','frames_per_second') AND jsonb_typeof(control.value)='number')
   OR (control.key IN ('watermark','camera_fixed','return_last_frame') AND jsonb_typeof(control.value)='boolean')
   OR (control.key IN ('resolution','ratio','omni_reference_task_type')
       AND jsonb_typeof(control.value)='string' AND control.value#>>'{}' ~ '^[A-Za-z0-9_:-]{1,64}$')
 ) saved_parameters ON true
 LEFT JOIN vendor_models m ON m.alias=a.resource_id
 LEFT JOIN generations_turn_tasks t ON t.task_id=a.id
 LEFT JOIN LATERAL (
  SELECT binding.intent_id,binding.owner,binding.session_id,binding.turn_id
  FROM media_submission_keys submitted
  JOIN video_submission_intents intent
   ON intent.organization_id=submitted.organization_id
    AND intent.project_id=submitted.project_id
    AND submitted.key_digest=niu_submission_key_digest(intent.submission_key)
  JOIN generations_turn_intents binding
   ON binding.organization_id=intent.organization_id
    AND binding.project_id=intent.project_id AND binding.owner=intent.owner
    AND binding.intent_id=intent.id
  WHERE submitted.organization_id=a.organization_id
   AND submitted.project_id=a.project_id AND submitted.attempt_id=a.id
 ) intent_binding ON true
 LEFT JOIN LATERAL (SELECT ARRAY(SELECT status FROM media_job_observations WHERE attempt_id=a.id) AS statuses) o ON true
 WHERE a.organization_id=$1 AND a.project_id=$2 AND a.dispatched_at IS NOT NULL
 AND (t.task_id IS NULL OR t.owner=$3)
 AND (intent_binding.intent_id IS NULL OR intent_binding.owner=$3)
 AND NOT EXISTS(SELECT 1 FROM video_submission_intents vi JOIN media_submission_keys sk ON sk.key_digest=niu_submission_key_digest(vi.submission_key) AND sk.organization_id=vi.organization_id AND sk.project_id=vi.project_id WHERE sk.attempt_id=a.id AND vi.organization_id=a.organization_id AND vi.project_id=a.project_id AND vi.owner<>$3)
), filtered AS (
 SELECT * FROM inventory WHERE ($4::text IS NULL OR state=$4)
 AND ($5::uuid IS NULL OR session_id=$5)
), all_outputs AS (
 SELECT i.*,r.kind,r.created_at AS output_created_at,
 capture_projection.capture,capture_projection.content_type,
 CASE WHEN r.expires_at<=clock_timestamp() THEN 'expired'
 WHEN r.deleted_at IS NOT NULL THEN 'deleted'
 WHEN i.state<>'succeeded' OR r.ciphertext IS NULL THEN 'unavailable'
 ELSE 'available' END AS availability
 FROM inventory i JOIN media_result_references r ON r.attempt_id=i.id
 LEFT JOIN LATERAL (
  -- A retained copy is independent of the original Provider reference. Prefer
  -- the canonical active/stored request, otherwise the newest failed attempt.
  -- Neither capture state nor a library rename changes output paging identity.
  SELECT jsonb_build_object(
   'id',capture.id,'task_id',capture.task_id,'kind',capture.kind,
   'status',capture.state,'asset_id',capture.asset_id,
   'availability',CASE WHEN capture.state<>'stored' THEN 'not_stored'
     WHEN library.deleted_at IS NOT NULL THEN 'deleted' ELSE 'retained' END,
   'failure_code',capture.failure_category,
   'created_at',capture.created_at,'updated_at',capture.updated_at
  ) AS capture,
  library.content_type
  FROM generations_artifact_captures capture
  LEFT JOIN workspace_asset_library library
   ON library.organization_id=capture.organization_id
    AND library.project_id=capture.project_id AND library.id=capture.asset_id
  WHERE capture.organization_id=$1 AND capture.project_id=$2
   AND capture.task_id=i.id AND capture.kind=r.kind
  ORDER BY CASE WHEN capture.state IN ('stored','preparing') THEN 0 ELSE 1 END,
   capture.created_at DESC,capture.id DESC
  LIMIT 1
 ) capture_projection ON true
)
, outputs AS (
 SELECT * FROM all_outputs WHERE ($4::text IS NULL OR state=$4)
 AND ($5::uuid IS NULL OR session_id=$5)
)
