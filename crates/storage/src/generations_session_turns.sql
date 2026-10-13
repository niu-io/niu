-- Actor-private timeline; execution and output state are read-only projections.
SELECT jsonb_build_object(
    'id', t.id,
    'sequence', t.sequence::text,
    'created_at', t.created_at,
    'content_state', CASE
        WHEN t.content_deleted_at IS NOT NULL THEN 'deleted'
        WHEN t.content_expires_at <= clock_timestamp() THEN 'expired'
        ELSE 'retained'
    END,
    'instruction', CASE
        WHEN t.content_deleted_at IS NULL AND t.content_expires_at > clock_timestamp()
        THEN t.instruction ELSE NULL
    END,
    'content_expires_at', t.content_expires_at,
    -- Canonical draft identity is independent of the saved turn instruction.
    'intent', CASE WHEN intent.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', intent.id,
        'revision', intent.revision::text,
        'model', intent.model,
        'content_state', CASE
            WHEN t.content_expires_at <= clock_timestamp() OR intent.expires_at <= clock_timestamp()
                THEN 'expired'
            WHEN t.content_deleted_at IS NOT NULL OR intent.deleted_at IS NOT NULL THEN 'deleted'
            ELSE 'retained'
        END,
        'submission_state', CASE
            WHEN submitted.attempt_id IS NULL THEN 'saved'
            WHEN attempt.dispatched_at IS NULL THEN 'not_dispatched'
            ELSE 'dispatched'
        END,
        'task_id', submitted.attempt_id
    ) END,
    'task_id', COALESCE(association.task_id,submitted.attempt_id),
    'task', CASE WHEN attempt.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', attempt.id,
        'kind', 'video',
        'model', attempt.resource_id,
        'status', saved.state,
        'artifacts', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'task_id', output.attempt_id,
                'kind', output.kind,
                'availability', CASE
                    WHEN output.expires_at <= clock_timestamp() THEN 'expired'
                    WHEN output.deleted_at IS NOT NULL THEN 'deleted'
                    WHEN saved.state <> 'succeeded' OR output.ciphertext IS NULL THEN 'unavailable'
                    ELSE 'available'
                END
            ) ORDER BY output.kind)
            FROM media_result_references output
            WHERE output.attempt_id = attempt.id
        ), '[]'::jsonb)
    ) END
)
FROM generations_turns t
LEFT JOIN generations_turn_tasks association
    ON association.organization_id = t.organization_id
    AND association.project_id = t.project_id
    AND association.owner = t.owner
    AND association.session_id = t.session_id
    AND association.turn_id = t.id
LEFT JOIN generations_turn_intents binding
    ON binding.organization_id=t.organization_id AND binding.project_id=t.project_id
    AND binding.owner=t.owner AND binding.session_id=t.session_id AND binding.turn_id=t.id
LEFT JOIN video_submission_intents intent
    ON intent.organization_id=binding.organization_id AND intent.project_id=binding.project_id
    AND intent.owner=binding.owner AND intent.id=binding.intent_id
LEFT JOIN media_submission_keys submitted
    ON submitted.organization_id=intent.organization_id AND submitted.project_id=intent.project_id
    AND submitted.key_digest=sha256(convert_to(intent.submission_key::text,'UTF8'))
LEFT JOIN attempts attempt ON attempt.id = COALESCE(association.task_id,submitted.attempt_id)
LEFT JOIN media_jobs job ON job.attempt_id = attempt.id
LEFT JOIN LATERAL (
    SELECT ARRAY(
        SELECT status FROM media_job_observations
        WHERE attempt_id = attempt.id
    ) AS statuses
) observation ON true
LEFT JOIN LATERAL (
    -- Keep the exact media_status_from_observations precedence. An unknown
    -- observation must not be hidden behind an older running/queued status.
    SELECT CASE
        WHEN job.attempt_id IS NULL THEN 'submission_unknown'
        WHEN 'succeeded' = ANY(observation.statuses) AND 'failed' = ANY(observation.statuses)
            THEN 'reconciliation_required'
        WHEN 'succeeded' = ANY(observation.statuses) THEN 'succeeded'
        WHEN 'failed' = ANY(observation.statuses) THEN 'failed'
        WHEN 'unknown' = ANY(observation.statuses) OR cardinality(observation.statuses) = 0
            THEN 'unknown'
        WHEN 'running' = ANY(observation.statuses) THEN 'running'
        ELSE 'queued'
    END AS state
) saved ON true
WHERE t.organization_id = $1 AND t.project_id = $2
    AND t.owner = $3 AND t.session_id = $4
ORDER BY t.sequence
