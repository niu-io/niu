-- Take workspace policy locks before key/account/attempt locks in every admission path.
CREATE OR REPLACE FUNCTION niu_admit_unpriced_gateway_batch_with_route(
    operation_ids UUID[],
    attempt_ids UUID[],
    organization_ids UUID[],
    project_ids UUID[],
    key_ids UUID[],
    model_aliases TEXT[],
    task_ids TEXT[],
    revisions TEXT[],
    upstream_models TEXT[],
    api_bases TEXT[]
)
RETURNS TABLE (attempt_id UUID, status TEXT)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    request_count INTEGER;
    changed BIGINT;
    lock_scope RECORD;
BEGIN
    request_count := cardinality(operation_ids);
    IF request_count IS NULL OR request_count < 1 OR request_count > 64
        OR cardinality(attempt_ids) IS DISTINCT FROM request_count
        OR cardinality(organization_ids) IS DISTINCT FROM request_count
        OR cardinality(project_ids) IS DISTINCT FROM request_count
        OR cardinality(key_ids) IS DISTINCT FROM request_count
        OR cardinality(model_aliases) IS DISTINCT FROM request_count
        OR cardinality(task_ids) IS DISTINCT FROM request_count
        OR cardinality(revisions) IS DISTINCT FROM request_count
        OR cardinality(upstream_models) IS DISTINCT FROM request_count
        OR cardinality(api_bases) IS DISTINCT FROM request_count THEN
        RAISE EXCEPTION 'invalid gateway admission batch' USING ERRCODE = '22023';
    END IF;

    FOR lock_scope IN SELECT DISTINCT o,p FROM unnest(organization_ids,project_ids) AS scopes(o,p) ORDER BY o,p LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||lock_scope.o::text||':'||lock_scope.p::text,0));
    END LOOP;

    WITH input AS MATERIALIZED (
        SELECT request.operation_id, request.attempt_id,
               request.organization_id, request.project_id, request.key_id,
               request.model_alias, request.task_id, request.revision,
               request.upstream_model, request.api_base
          FROM unnest(operation_ids, attempt_ids, organization_ids, project_ids,
                      key_ids, model_aliases, task_ids, revisions,
                      upstream_models, api_bases)
               AS request(operation_id, attempt_id, organization_id, project_id,
                          key_id, model_alias, task_id, revision,
                          upstream_model, api_base)
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

    PERFORM o.id
      FROM unnest(model_aliases, upstream_models, api_bases)
           AS input(model_alias, upstream_model, api_base)
      JOIN provider_offers o ON o.model_alias = input.model_alias
      JOIN vendor_models m ON m.alias = input.model_alias
      JOIN vendors v ON v.id = m.vendor_id
     FOR SHARE OF o, m, v;

    -- A published customer tariff is bound only when this key is eligible to
    -- use the model. Its immutable revision records the actual rate in effect.
    INSERT INTO customer_attempt_tariffs (attempt_id, revision_id)
    SELECT input.attempt_id, tariff.current_revision
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids, model_aliases)
           AS input(attempt_id, organization_id, project_id, key_id, model_alias)
      JOIN customer_tariffs tariff
        ON tariff.organization_id = input.organization_id
       AND tariff.project_id = input.project_id
       AND tariff.model_alias = input.model_alias
       AND tariff.current_revision IS NOT NULL
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND (input.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
     WHERE NOT EXISTS (
           SELECT 1 FROM account_assignments s
           JOIN supplier_accounts a
             ON a.organization_id = s.organization_id
            AND a.project_id = s.project_id
            AND a.id = s.account_id
           WHERE s.organization_id = input.organization_id
             AND s.project_id = input.project_id
             AND s.attempt_id = input.attempt_id
             AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                      AND a.credential_revision = s.credential_revision)
       )
       AND NOT EXISTS (
           SELECT 1 FROM project_budgets b
            WHERE b.organization_id = input.organization_id
              AND b.project_id = input.project_id
              AND NOT EXISTS (
                  SELECT 1 FROM cost_reservations r
                   WHERE r.attempt_id = input.attempt_id AND r.state = 'held'
              )
       )
    ON CONFLICT ON CONSTRAINT customer_attempt_tariffs_pkey DO NOTHING;

    -- Supplier attribution is captured atomically. A known offer that no
    -- longer matches the live route is rejected below before any dispatch.
    INSERT INTO provider_attempt_offers (attempt_id, provider_id, offer_id, revision_id)
    SELECT input.attempt_id, offer.provider_id, offer.id, offer.current_revision
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids,
                  model_aliases, upstream_models, api_bases)
           AS input(attempt_id, organization_id, project_id, key_id,
                    model_alias, upstream_model, api_base)
      JOIN provider_offers offer
        ON offer.model_alias = input.model_alias
       AND offer.active
       AND offer.current_revision IS NOT NULL
      JOIN vendor_models model
        ON model.alias = input.model_alias
       AND model.vendor_id = offer.vendor_id
       AND model.upstream_model = input.upstream_model
      JOIN vendors vendor
        ON vendor.id = model.vendor_id
       AND vendor.api_base IS NOT DISTINCT FROM input.api_base
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND (input.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
     WHERE NOT EXISTS (
           SELECT 1 FROM account_assignments s
           JOIN supplier_accounts a
             ON a.organization_id = s.organization_id
            AND a.project_id = s.project_id
            AND a.id = s.account_id
           WHERE s.organization_id = input.organization_id
             AND s.project_id = input.project_id
             AND s.attempt_id = input.attempt_id
             AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                      AND a.credential_revision = s.credential_revision)
       )
       AND NOT EXISTS (
           SELECT 1 FROM project_budgets b
            WHERE b.organization_id = input.organization_id
              AND b.project_id = input.project_id
              AND NOT EXISTS (
                  SELECT 1 FROM cost_reservations r
                   WHERE r.attempt_id = input.attempt_id AND r.state = 'held'
              )
       )
    ON CONFLICT ON CONSTRAINT provider_attempt_offers_pkey DO NOTHING;

    RETURN QUERY
    WITH input AS MATERIALIZED (
        SELECT request.attempt_id, request.organization_id,
               request.project_id, request.key_id, request.model_alias,
               request.upstream_model, request.api_base, request.position
          FROM unnest(attempt_ids, organization_ids, project_ids, key_ids,
                      model_aliases, upstream_models, api_bases)
               WITH ORDINALITY AS request(attempt_id, organization_id,
                   project_id, key_id, model_alias, upstream_model, api_base, position)
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
           AND o.organization_id = a.organization_id
           AND o.project_id = a.project_id
           AND o.id = a.operation_id
           AND o.model_alias = i.model_alias
           AND k.id = i.key_id
           AND k.organization_id = i.organization_id
           AND k.project_id = i.project_id
           AND (o.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
           AND k.expires_at > clock_timestamp()
           AND k.revoked_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM provider_offers offer
               WHERE offer.model_alias = i.model_alias
                 AND NOT EXISTS (
                     SELECT 1 FROM provider_offers current_offer
                     JOIN vendor_models m
                       ON m.alias = current_offer.model_alias
                      AND m.vendor_id = current_offer.vendor_id
                      AND m.upstream_model = i.upstream_model
                     JOIN vendors v
                       ON v.id = m.vendor_id
                      AND v.api_base IS NOT DISTINCT FROM i.api_base
                     WHERE current_offer.id = offer.id
                       AND current_offer.active
                       AND current_offer.current_revision IS NOT NULL
                 )
           )
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
               WHEN NOT EXISTS (
                   SELECT 1 FROM api_keys k
                    WHERE k.id = i.key_id
                      AND k.organization_id = i.organization_id
                      AND k.project_id = i.project_id
                      AND k.revoked_at IS NULL
                      AND k.expires_at > clock_timestamp()
                      AND (i.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
               ) THEN 'unauthorized'
               WHEN EXISTS (
                   SELECT 1 FROM account_assignments s
                   JOIN supplier_accounts a
                     ON a.organization_id = s.organization_id
                    AND a.project_id = s.project_id
                    AND a.id = s.account_id
                   WHERE s.organization_id = i.organization_id
                     AND s.project_id = i.project_id
                     AND s.attempt_id = i.attempt_id
                     AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                              AND a.credential_revision = s.credential_revision)
               ) THEN 'account_unavailable'
               WHEN EXISTS (
                   SELECT 1 FROM provider_offers offer
                   WHERE offer.model_alias = i.model_alias
                     AND NOT EXISTS (
                         SELECT 1 FROM vendor_models m
                         JOIN vendors v ON v.id = m.vendor_id
                         WHERE m.alias = i.model_alias
                           AND m.vendor_id = offer.vendor_id
                           AND m.upstream_model = i.upstream_model
                           AND v.api_base IS NOT DISTINCT FROM i.api_base
                           AND offer.active
                           AND offer.current_revision IS NOT NULL
                     )
               ) THEN 'account_unavailable'
               WHEN d.attempt_id IS NOT NULL THEN 'admitted'
               ELSE 'conflict'
           END::TEXT AS status
      FROM input i
      LEFT JOIN dispatched d ON d.attempt_id = i.attempt_id
     ORDER BY i.position;
END;
$$;
CREATE OR REPLACE FUNCTION niu_admit_unpriced_gateway_batch_with_route(
    operation_ids UUID[],
    attempt_ids UUID[],
    organization_ids UUID[],
    project_ids UUID[],
    key_ids UUID[],
    model_aliases TEXT[],
    task_ids TEXT[],
    revisions TEXT[],
    upstream_models TEXT[],
    api_bases TEXT[],
    dispatch_providers TEXT[]
)
RETURNS TABLE (attempt_id UUID, status TEXT)
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    request_count INTEGER;
    changed BIGINT;
    lock_scope RECORD;
BEGIN
    request_count := cardinality(operation_ids);
    IF request_count IS NULL OR request_count < 1 OR request_count > 64
        OR cardinality(attempt_ids) IS DISTINCT FROM request_count
        OR cardinality(organization_ids) IS DISTINCT FROM request_count
        OR cardinality(project_ids) IS DISTINCT FROM request_count
        OR cardinality(key_ids) IS DISTINCT FROM request_count
        OR cardinality(model_aliases) IS DISTINCT FROM request_count
        OR cardinality(task_ids) IS DISTINCT FROM request_count
        OR cardinality(revisions) IS DISTINCT FROM request_count
        OR cardinality(upstream_models) IS DISTINCT FROM request_count
        OR cardinality(api_bases) IS DISTINCT FROM request_count
        OR cardinality(dispatch_providers) IS DISTINCT FROM request_count THEN
        RAISE EXCEPTION 'invalid gateway admission batch' USING ERRCODE = '22023';
    END IF;

    FOR lock_scope IN SELECT DISTINCT o,p FROM unnest(organization_ids,project_ids) AS scopes(o,p) ORDER BY o,p LOOP
        PERFORM pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||lock_scope.o::text||':'||lock_scope.p::text,0));
    END LOOP;

    WITH input AS MATERIALIZED (
        SELECT request.operation_id, request.attempt_id,
               request.organization_id, request.project_id, request.key_id,
               request.model_alias, request.task_id, request.revision,
               request.upstream_model, request.api_base, request.dispatch_provider
          FROM unnest(operation_ids, attempt_ids, organization_ids, project_ids,
                      key_ids, model_aliases, task_ids, revisions,
                      upstream_models, api_bases, dispatch_providers)
               AS request(operation_id, attempt_id, organization_id, project_id,
                          key_id, model_alias, task_id, revision,
                          upstream_model, api_base, dispatch_provider)
    ), inserted_operations AS (
        INSERT INTO operations (id, organization_id, project_id, model_alias, task_id)
        SELECT i.operation_id, i.organization_id, i.project_id, i.model_alias, i.task_id
          FROM input i
        RETURNING id
    ), inserted_attempts AS (
        INSERT INTO attempts
            (id, organization_id, project_id, operation_id, resource_id, offer_revision, dispatch_provider)
        SELECT i.attempt_id, i.organization_id, i.project_id, i.operation_id,
               i.model_alias, i.revision, i.dispatch_provider
          FROM input i
          JOIN inserted_operations o ON o.id = i.operation_id
        RETURNING id
    )
    SELECT count(*) INTO changed FROM inserted_attempts;
    IF changed <> request_count THEN
        RAISE EXCEPTION 'gateway admission insert count mismatch' USING ERRCODE = '22023';
    END IF;

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

    PERFORM o.id
      FROM unnest(model_aliases, upstream_models, api_bases)
           AS input(model_alias, upstream_model, api_base)
      JOIN provider_offers o ON o.model_alias = input.model_alias
      JOIN vendor_models m ON m.alias = input.model_alias
      JOIN vendors v ON v.id = m.vendor_id
     FOR SHARE OF o, m, v;

    -- A published customer tariff is bound only when this key is eligible to
    -- use the model. Its immutable revision records the actual rate in effect.
    INSERT INTO customer_attempt_tariffs (attempt_id, revision_id)
    SELECT input.attempt_id, tariff.current_revision
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids, model_aliases)
           AS input(attempt_id, organization_id, project_id, key_id, model_alias)
      JOIN customer_tariffs tariff
        ON tariff.organization_id = input.organization_id
       AND tariff.project_id = input.project_id
       AND tariff.model_alias = input.model_alias
       AND tariff.current_revision IS NOT NULL
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND (input.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
     WHERE NOT EXISTS (
           SELECT 1 FROM account_assignments s
           JOIN supplier_accounts a
             ON a.organization_id = s.organization_id
            AND a.project_id = s.project_id
            AND a.id = s.account_id
           WHERE s.organization_id = input.organization_id
             AND s.project_id = input.project_id
             AND s.attempt_id = input.attempt_id
             AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                      AND a.credential_revision = s.credential_revision)
       )
       AND NOT EXISTS (
           SELECT 1 FROM project_budgets b
            WHERE b.organization_id = input.organization_id
              AND b.project_id = input.project_id
              AND NOT EXISTS (
                  SELECT 1 FROM cost_reservations r
                   WHERE r.attempt_id = input.attempt_id AND r.state = 'held'
              )
       )
    ON CONFLICT ON CONSTRAINT customer_attempt_tariffs_pkey DO NOTHING;

    -- Supplier attribution is captured atomically. A known offer that no
    -- longer matches the live route is rejected below before any dispatch.
    INSERT INTO provider_attempt_offers (attempt_id, provider_id, offer_id, revision_id)
    SELECT input.attempt_id, offer.provider_id, offer.id, offer.current_revision
      FROM unnest(attempt_ids, organization_ids, project_ids, key_ids,
                  model_aliases, upstream_models, api_bases)
           AS input(attempt_id, organization_id, project_id, key_id,
                    model_alias, upstream_model, api_base)
      JOIN provider_offers offer
        ON offer.model_alias = input.model_alias
       AND offer.active
       AND offer.current_revision IS NOT NULL
      JOIN vendor_models model
        ON model.alias = input.model_alias
       AND model.vendor_id = offer.vendor_id
       AND model.upstream_model = input.upstream_model
      JOIN vendors vendor
        ON vendor.id = model.vendor_id
       AND vendor.api_base IS NOT DISTINCT FROM input.api_base
      JOIN api_keys k
        ON k.id = input.key_id
       AND k.organization_id = input.organization_id
       AND k.project_id = input.project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND (input.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
     WHERE NOT EXISTS (
           SELECT 1 FROM account_assignments s
           JOIN supplier_accounts a
             ON a.organization_id = s.organization_id
            AND a.project_id = s.project_id
            AND a.id = s.account_id
           WHERE s.organization_id = input.organization_id
             AND s.project_id = input.project_id
             AND s.attempt_id = input.attempt_id
             AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                      AND a.credential_revision = s.credential_revision)
       )
       AND NOT EXISTS (
           SELECT 1 FROM project_budgets b
            WHERE b.organization_id = input.organization_id
              AND b.project_id = input.project_id
              AND NOT EXISTS (
                  SELECT 1 FROM cost_reservations r
                   WHERE r.attempt_id = input.attempt_id AND r.state = 'held'
              )
       )
    ON CONFLICT ON CONSTRAINT provider_attempt_offers_pkey DO NOTHING;

    RETURN QUERY
    WITH input AS MATERIALIZED (
        SELECT request.attempt_id, request.organization_id,
               request.project_id, request.key_id, request.model_alias,
               request.upstream_model, request.api_base, request.position
          FROM unnest(attempt_ids, organization_ids, project_ids, key_ids,
                      model_aliases, upstream_models, api_bases)
               WITH ORDINALITY AS request(attempt_id, organization_id,
                   project_id, key_id, model_alias, upstream_model, api_base, position)
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
           AND o.organization_id = a.organization_id
           AND o.project_id = a.project_id
           AND o.id = a.operation_id
           AND o.model_alias = i.model_alias
           AND k.id = i.key_id
           AND k.organization_id = i.organization_id
           AND k.project_id = i.project_id
           AND (o.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
           AND k.expires_at > clock_timestamp()
           AND k.revoked_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM provider_offers offer
               WHERE offer.model_alias = i.model_alias
                 AND NOT EXISTS (
                     SELECT 1 FROM provider_offers current_offer
                     JOIN vendor_models m
                       ON m.alias = current_offer.model_alias
                      AND m.vendor_id = current_offer.vendor_id
                      AND m.upstream_model = i.upstream_model
                     JOIN vendors v
                       ON v.id = m.vendor_id
                      AND v.api_base IS NOT DISTINCT FROM i.api_base
                     WHERE current_offer.id = offer.id
                       AND current_offer.active
                       AND current_offer.current_revision IS NOT NULL
                 )
           )
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
               WHEN NOT EXISTS (
                   SELECT 1 FROM api_keys k
                    WHERE k.id = i.key_id
                      AND k.organization_id = i.organization_id
                      AND k.project_id = i.project_id
                      AND k.revoked_at IS NULL
                      AND k.expires_at > clock_timestamp()
                      AND (i.model_alias = ANY(k.allowed_models) OR '*' = ANY(k.allowed_models))
               ) THEN 'unauthorized'
               WHEN EXISTS (
                   SELECT 1 FROM account_assignments s
                   JOIN supplier_accounts a
                     ON a.organization_id = s.organization_id
                    AND a.project_id = s.project_id
                    AND a.id = s.account_id
                   WHERE s.organization_id = i.organization_id
                     AND s.project_id = i.project_id
                     AND s.attempt_id = i.attempt_id
                     AND NOT (a.health = 'ready' AND a.refresh_owner IS NULL
                              AND a.credential_revision = s.credential_revision)
               ) THEN 'account_unavailable'
               WHEN EXISTS (
                   SELECT 1 FROM provider_offers offer
                   WHERE offer.model_alias = i.model_alias
                     AND NOT EXISTS (
                         SELECT 1 FROM vendor_models m
                         JOIN vendors v ON v.id = m.vendor_id
                         WHERE m.alias = i.model_alias
                           AND m.vendor_id = offer.vendor_id
                           AND m.upstream_model = i.upstream_model
                           AND v.api_base IS NOT DISTINCT FROM i.api_base
                           AND offer.active
                           AND offer.current_revision IS NOT NULL
                     )
               ) THEN 'account_unavailable'
               WHEN d.attempt_id IS NOT NULL THEN 'admitted'
               ELSE 'conflict'
           END::TEXT AS status
      FROM input i
      LEFT JOIN dispatched d ON d.attempt_id = i.attempt_id
     ORDER BY i.position;
END;
$$;
-- Keep the trusted budget reservation and dispatch transition in one database
-- call so network latency does not extend the project-budget row lock.
CREATE OR REPLACE FUNCTION niu_reserve_and_dispatch_gateway(
    p_organization_id UUID,
    p_project_id UUID,
    p_key_id UUID,
    p_attempt_id UUID,
    p_price_revision_id UUID,
    p_resource_id TEXT,
    p_offer_revision TEXT,
    p_prompt_bound BIGINT,
    p_completion_bound BIGINT
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    account_eligible BOOLEAN;
    attempt_row RECORD;
    price_row RECORD;
    computed_amount NUMERIC;
    changed BIGINT;
BEGIN
    IF p_prompt_bound < 0 OR p_completion_bound < 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0009', MESSAGE = 'invalid token bound';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||p_organization_id::text||':'||p_project_id::text,0));

    -- Revocation, expiry, model permission and project budget creation all
    -- synchronize with this admission before it allocates funds.
    PERFORM k.id
      FROM api_keys k
      JOIN projects p ON p.organization_id=k.organization_id AND p.id=k.project_id
     WHERE k.id=p_key_id
       AND k.organization_id=p_organization_id
       AND k.project_id=p_project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND p_resource_id=ANY(k.allowed_models)
     FOR SHARE OF k, p;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
    END IF;

    SELECT a.health='ready'
           AND a.refresh_owner IS NULL
           AND a.credential_revision=s.credential_revision
      INTO account_eligible
      FROM account_assignments s
      JOIN supplier_accounts a
        ON a.organization_id=s.organization_id
       AND a.project_id=s.project_id
       AND a.id=s.account_id
     WHERE s.organization_id=p_organization_id
       AND s.project_id=p_project_id
       AND s.attempt_id=p_attempt_id
     FOR SHARE OF s, a;
    IF FOUND AND account_eligible IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION USING ERRCODE = 'P0007', MESSAGE = 'supplier account is unavailable';
    END IF;

    SELECT a.execution, a.resource_id, a.offer_revision, o.model_alias
      INTO attempt_row
      FROM attempts a
      JOIN operations o
        ON o.organization_id=a.organization_id
       AND o.project_id=a.project_id
       AND o.id=a.operation_id
     WHERE a.organization_id=p_organization_id
       AND a.project_id=p_project_id
       AND a.id=p_attempt_id
       AND o.model_alias=p_resource_id
     FOR UPDATE OF a;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt does not exist';
    END IF;
    IF attempt_row.execution <> 'not_sent'
       OR attempt_row.resource_id <> p_resource_id
       OR attempt_row.offer_revision <> p_offer_revision THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt conflicts with admission';
    END IF;

    SELECT currency, cash_prompt_rate, cash_completion_rate
      INTO price_row
      FROM price_revisions
     WHERE organization_id=p_organization_id
       AND project_id=p_project_id
       AND id=p_price_revision_id
       AND resource_id=p_resource_id
       AND offer_revision=p_offer_revision;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'price revision does not match route';
    END IF;

    IF EXISTS (SELECT 1 FROM cost_reservations WHERE attempt_id=p_attempt_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt already has a reservation';
    END IF;

    computed_amount := ceil((
        price_row.cash_prompt_rate::NUMERIC * p_prompt_bound::NUMERIC
        + price_row.cash_completion_rate::NUMERIC * p_completion_bound::NUMERIC
    ) / 1000000);
    IF computed_amount > 9223372036854775807::NUMERIC THEN
        RAISE EXCEPTION USING ERRCODE = 'P0009', MESSAGE = 'reservation exceeds supported amount';
    END IF;

    UPDATE project_budgets
       SET reserved_nanos=reserved_nanos + computed_amount::BIGINT
     WHERE organization_id=p_organization_id
       AND project_id=p_project_id
       AND currency=price_row.currency
       AND limit_nanos::NUMERIC - spent_nanos::NUMERIC - reserved_nanos::NUMERIC >= computed_amount
       AND EXISTS (
           SELECT 1 FROM api_keys k
            WHERE k.id=p_key_id
              AND k.organization_id=p_organization_id
              AND k.project_id=p_project_id
              AND k.revoked_at IS NULL
              AND k.expires_at > clock_timestamp()
              AND p_resource_id=ANY(k.allowed_models)
       );
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
        IF NOT EXISTS (
            SELECT 1 FROM api_keys k
             WHERE k.id=p_key_id
               AND k.organization_id=p_organization_id
               AND k.project_id=p_project_id
               AND k.revoked_at IS NULL
               AND k.expires_at > clock_timestamp()
               AND p_resource_id=ANY(k.allowed_models)
        ) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
        END IF;
        RAISE EXCEPTION USING ERRCODE = 'P0008', MESSAGE = 'project budget is unavailable';
    END IF;

    INSERT INTO cost_reservations
        (attempt_id, organization_id, project_id, price_revision_id,
         reserved_nanos, prompt_bound, completion_bound)
    VALUES
        (p_attempt_id, p_organization_id, p_project_id, p_price_revision_id,
         computed_amount::BIGINT, p_prompt_bound, p_completion_bound);

    UPDATE attempts a
       SET execution='may_have_executed',
           dispatched_at=clock_timestamp(),
           api_key_id=p_key_id
     WHERE a.organization_id=p_organization_id
       AND a.project_id=p_project_id
       AND a.id=p_attempt_id
       AND a.execution='not_sent'
       AND EXISTS (
           SELECT 1 FROM api_keys k
            WHERE k.id=p_key_id
              AND k.organization_id=p_organization_id
              AND k.project_id=p_project_id
              AND a.resource_id=ANY(k.allowed_models)
              AND k.revoked_at IS NULL
              AND k.expires_at > clock_timestamp()
       )
       AND NOT EXISTS (
           SELECT 1 FROM account_assignments s
            WHERE s.organization_id=p_organization_id
              AND s.project_id=p_project_id
              AND s.attempt_id=a.id
              AND s.state <> 'held'
       )
       AND EXISTS (
           SELECT 1 FROM cost_reservations r
            WHERE r.organization_id=p_organization_id
              AND r.project_id=p_project_id
              AND r.attempt_id=a.id
              AND r.state='held'
       );
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
        IF NOT EXISTS (
            SELECT 1 FROM api_keys k
             WHERE k.id=p_key_id
               AND k.organization_id=p_organization_id
               AND k.project_id=p_project_id
               AND k.revoked_at IS NULL
               AND k.expires_at > clock_timestamp()
               AND p_resource_id=ANY(k.allowed_models)
        ) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
        END IF;
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt changed during admission';
    END IF;
END;
$$;
