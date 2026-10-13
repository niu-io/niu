-- Stable creation timestamp/UUID cursor; archive changes do not invalidate it.
SELECT jsonb_build_object(
    'id', id, 'workspace_id', project_id, 'owner', owner, 'category', 'chat',
    'title', CASE WHEN jsonb_typeof(payload->'title')='string'
                      AND btrim(payload->>'title')<>'' THEN payload->>'title' ELSE NULL END,
    'revision', write_revision::text, 'archived', archived,
    'created_at', created_at, 'updated_at', updated_at
)
FROM chat_sessions
WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND archived=$4
    AND ($5::uuid IS NULL OR (created_at,id)<(
        SELECT created_at,id FROM chat_sessions
        WHERE organization_id=$1 AND project_id=$2 AND owner=$3 AND id=$5
    ))
ORDER BY created_at DESC,id DESC LIMIT $6
