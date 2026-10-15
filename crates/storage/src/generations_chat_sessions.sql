-- Metadata only: legacy saved payload clocks are not database timestamps.
SELECT jsonb_build_object(
    'id', id, 'workspace_id', project_id, 'owner', owner, 'category', 'chat',
    'title', CASE WHEN payload_bytes IS NOT NULL THEN title
                  WHEN jsonb_typeof(payload->'title')='string'
                       AND btrim(payload->>'title')<>'' THEN payload->>'title' ELSE NULL END,
    'revision', write_revision::text, 'archived', archived,
    'created_at', created_at, 'updated_at', updated_at
) AS summary, COALESCE(payload_bytes, octet_length(payload::text)::bigint) AS bytes
FROM chat_sessions
WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$4
