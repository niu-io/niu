-- Preserve the legacy ten-argument batch function; new callers record Provider identity.
ALTER TABLE attempts ADD COLUMN dispatch_provider TEXT CHECK (length(dispatch_provider) BETWEEN 1 AND 200);
-- Preserve all-model API key grants in batched admission and dispatch checks.
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

CREATE OR REPLACE FUNCTION niu_model_rule_permits(rule JSONB, model TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF jsonb_typeof(rule) IS DISTINCT FROM 'object' THEN RETURN FALSE; END IF;
    CASE rule->>'mode'
        WHEN 'inherit' THEN RETURN TRUE;
        WHEN 'allow_all' THEN RETURN TRUE;
        WHEN 'deny_all' THEN RETURN FALSE;
        WHEN 'allow_list' THEN
            IF jsonb_typeof(rule->'values') IS DISTINCT FROM 'array' THEN RETURN FALSE; END IF;
            RETURN COALESCE((rule->'values') ? model, FALSE);
        ELSE RETURN FALSE;
    END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION niu_check_dispatch_model_guardrails() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    requested_model TEXT;
    policy JSONB;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    -- Activation takes this same transaction lock before changing the workspace head.
    PERFORM pg_advisory_xact_lock(hashtextextended('niu-guardrails:'||NEW.organization_id::text||':'||NEW.project_id::text,0));
    -- Key assignment/revocation takes the key row lock before changing restrictions.
    PERFORM id FROM api_keys WHERE id=NEW.api_key_id FOR SHARE;
    SELECT model_alias INTO requested_model FROM operations WHERE id=NEW.operation_id;
    FOR policy IN
        SELECT r.policy FROM workspace_guardrail_heads h
        JOIN workspace_guardrail_revisions r USING(organization_id,project_id,revision)
        WHERE h.organization_id=NEW.organization_id AND h.project_id=NEW.project_id
        UNION ALL
        SELECT r.policy FROM key_guardrail_assignments a
        JOIN workspace_guardrail_revisions r ON r.organization_id=a.organization_id
            AND r.project_id=a.project_id AND r.revision=a.policy_revision
        WHERE a.organization_id=NEW.organization_id AND a.project_id=NEW.project_id AND a.key_id=NEW.api_key_id
    LOOP
        IF policy->>'schema_version' IS DISTINCT FROM '1'
           OR NOT niu_model_rule_permits(policy->'models',requested_model)
           OR NOT niu_model_rule_permits(policy->'providers',NEW.dispatch_provider) THEN
            RAISE EXCEPTION 'access guardrail changed before dispatch' USING ERRCODE='P0006';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$;
