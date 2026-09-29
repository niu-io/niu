-- Batch unpriced gateway admissions so concurrent requests share one network
-- round trip and commit while preserving intent durability before dispatch.
CREATE FUNCTION niu_admit_unpriced_gateway_batch(
    operation_ids UUID[],
    attempt_ids UUID[],
    organization_ids UUID[],
    project_ids UUID[],
    key_ids UUID[],
    model_aliases TEXT[],
    task_ids TEXT[],
    revisions TEXT[]
)
RETURNS TABLE (attempt_id UUID, status TEXT)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    request_count INTEGER;
    changed BIGINT;
BEGIN
    request_count := cardinality(operation_ids);
    IF request_count IS NULL OR request_count < 1 OR request_count > 64
        OR cardinality(attempt_ids) IS DISTINCT FROM request_count
        OR cardinality(organization_ids) IS DISTINCT FROM request_count
        OR cardinality(project_ids) IS DISTINCT FROM request_count
        OR cardinality(key_ids) IS DISTINCT FROM request_count
        OR cardinality(model_aliases) IS DISTINCT FROM request_count
        OR cardinality(task_ids) IS DISTINCT FROM request_count
        OR cardinality(revisions) IS DISTINCT FROM request_count THEN
        RAISE EXCEPTION 'invalid gateway admission batch' USING ERRCODE = '22023';
    END IF;

    WITH input AS MATERIALIZED (
        SELECT request.operation_id, request.attempt_id,
               request.organization_id, request.project_id, request.key_id,
               request.model_alias, request.task_id, request.revision
          FROM unnest(operation_ids, attempt_ids, organization_ids, project_ids,
                      key_ids, model_aliases, task_ids, revisions)
               AS request(operation_id, attempt_id, organization_id, project_id,
                          key_id, model_alias, task_id, revision)
    ), inserted_operations AS (
        INSERT INTO operations (id, organization_id, project_id, model_alias, task_id)
        SELECT i.operation_id, i.organization_id, i.project_id, i.model_alias, i.task_id
          FROM input i
        RETURNING id
    ), inserted_attempts AS (
        INSERT INTO attempts
            (id, organization_id, project_id, operation_id, resource_id, offer_revision)
        SELECT i.attempt_id, i.organization_id, i.project_id, i.operation_id,
               i.model_alias, i.revision
          FROM input i
          JOIN inserted_operations o ON o.id = i.operation_id
        RETURNING id
    )
    SELECT count(*) INTO changed FROM inserted_attempts;
    IF changed <> request_count THEN
        RAISE EXCEPTION 'gateway admission insert count mismatch' USING ERRCODE = '22023';
    END IF;

    -- Lock the key and project rows together before the dispatch update. Key
    -- revocation and project budget creation therefore serialize with admission.
    PERFORM k.id
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids)
           AS input(attempt_id, organization_id, project_id, key_id)
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
      JOIN projects p
        ON p.organization_id = k.organization_id
       AND p.id = k.project_id
     WHERE k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
     FOR SHARE OF k, p;

    -- Assigned supplier accounts are not selected by today's unpriced route,
    -- but preserve the readiness lock used by the ordinary dispatch path.
    PERFORM a.id
      FROM unnest(attempt_ids, organization_ids, project_ids)
           AS input(attempt_id, organization_id, project_id)
      JOIN account_assignments s
        ON s.organization_id = input.organization_id
       AND s.project_id = input.project_id
       AND s.attempt_id = input.attempt_id
      JOIN supplier_accounts a
        ON a.organization_id = s.organization_id
       AND a.project_id = s.project_id
       AND a.id = s.account_id
     FOR SHARE OF a;

    RETURN QUERY
    WITH input AS MATERIALIZED (
        SELECT request.attempt_id, request.organization_id,
               request.project_id, request.key_id, request.model_alias,
               request.position
          FROM unnest(attempt_ids, organization_ids, project_ids,
                      key_ids, model_aliases)
               WITH ORDINALITY AS request(attempt_id, organization_id,
                   project_id, key_id, model_alias, position)
    ), dispatched AS (
        UPDATE attempts a
           SET execution = 'may_have_executed',
               dispatched_at = clock_timestamp(),
               api_key_id = i.key_id
          FROM input i, operations o, api_keys k
         WHERE a.organization_id = i.organization_id
           AND a.project_id = i.project_id
           AND a.id = i.attempt_id
           AND a.execution = 'not_sent'
           AND o.id = a.operation_id
           AND o.model_alias = i.model_alias
           AND k.id = i.key_id
           AND k.organization_id = i.organization_id
           AND k.project_id = i.project_id
           AND o.model_alias = ANY(k.allowed_models)
           AND k.expires_at > clock_timestamp()
           AND k.revoked_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM account_assignments s
                WHERE s.organization_id = i.organization_id
                  AND s.project_id = i.project_id
                  AND s.attempt_id = a.id
                  AND s.state <> 'held'
           )
           AND (
               NOT EXISTS (
                   SELECT 1 FROM project_budgets b
                    WHERE b.organization_id = i.organization_id
                      AND b.project_id = i.project_id
               )
               OR EXISTS (
                   SELECT 1 FROM cost_reservations r
                    WHERE r.attempt_id = a.id AND r.state = 'held'
               )
           )
        RETURNING a.id AS attempt_id
    )
    SELECT i.attempt_id,
           CASE
               WHEN d.attempt_id IS NOT NULL THEN 'admitted'
               WHEN NOT EXISTS (
                   SELECT 1 FROM api_keys k
                    WHERE k.id = i.key_id
                      AND k.organization_id = i.organization_id
                      AND k.project_id = i.project_id
                      AND k.revoked_at IS NULL
                      AND k.expires_at > clock_timestamp()
               ) THEN 'unauthorized'
               WHEN EXISTS (
                   SELECT 1
                     FROM account_assignments s
                     JOIN supplier_accounts a
                       ON a.organization_id = s.organization_id
                      AND a.project_id = s.project_id
                      AND a.id = s.account_id
                    WHERE s.organization_id = i.organization_id
                      AND s.project_id = i.project_id
                      AND s.attempt_id = i.attempt_id
                      AND NOT (a.health = 'ready'
                           AND a.refresh_owner IS NULL
                           AND a.credential_revision = s.credential_revision)
               ) THEN 'account_unavailable'
               ELSE 'conflict'
           END::TEXT AS status
      FROM input i
      LEFT JOIN dispatched d ON d.attempt_id = i.attempt_id
     ORDER BY i.position;
END;
$$;
