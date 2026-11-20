-- Publish existing non-personal routes and platform-shared custom models in
-- the public catalog so configured shared/commercial models appear together.
-- Personal-scoped routes and organization-scoped pools remain private.
--
-- Never empty routing_registry_active: already-running replicas read the active
-- generation continuously and fail closed with HTTP 503 if it disappears, and
-- new replicas configured with NIU_ROUTING_EXPECTED_GENERATION abort startup.
-- Instead, serialize under the publication advisory lock and atomically publish
-- a new immutable generation reflecting the updated public_catalog flags.

DO $$
DECLARE
    updated_model_aliases TEXT[];
    updated_pool_rows JSONB;
    active_static_identity TEXT;
    active_compiled JSONB;
    active_offer_revisions JSONB;
    patched_compiled JSONB;
    model_alias TEXT;
    pool_entry JSONB;
    pool_alias TEXT;
    pool_revision BIGINT;
    new_generation BIGINT;
BEGIN
    PERFORM pg_advisory_xact_lock(716554);
    PERFORM set_config('niu.registry_writer', 'v1', true);

    WITH updated_models AS (
        UPDATE vendor_models m
        SET public_catalog = TRUE
        WHERE NOT m.public_catalog
          AND NOT EXISTS (
              SELECT 1 FROM personal_vendor_ownership o
              WHERE o.vendor_id = m.vendor_id AND o.access_scope = 'personal'
          )
        RETURNING m.alias
    )
    SELECT COALESCE(array_agg(alias), ARRAY[]::TEXT[])
    INTO updated_model_aliases
    FROM updated_models;

    WITH updated_pools AS (
        UPDATE model_route_pools
        SET public_catalog = TRUE,
            revision = revision + 1
        WHERE organization_id IS NULL
          AND NOT public_catalog
        RETURNING alias, revision, organization_id, project_id, display_name, description, slug, public_catalog, billing_mode, enabled, candidates, rules, default_action
    ),
    recorded_history AS (
        INSERT INTO model_route_pool_history (
            alias, revision, organization_id, project_id, display_name, description, slug, public_catalog, billing_mode, enabled, candidates, rules, default_action
        )
        SELECT alias, revision, organization_id, project_id, display_name, description, slug, public_catalog, billing_mode, enabled, candidates, rules, default_action
        FROM updated_pools
        RETURNING alias, revision
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object('alias', alias, 'revision', revision)), '[]'::JSONB)
    INTO updated_pool_rows
    FROM recorded_history;

    SELECT g.static_identity, g.compiled, g.offer_revisions
    INTO active_static_identity, active_compiled, active_offer_revisions
    FROM routing_registry_active a
    JOIN routing_registry_generations g ON g.generation = a.generation;

    IF FOUND AND (
        COALESCE(array_length(updated_model_aliases, 1), 0) > 0
        OR jsonb_array_length(updated_pool_rows) > 0
    ) THEN
        patched_compiled := active_compiled;

        FOREACH model_alias IN ARRAY updated_model_aliases LOOP
            IF patched_compiled->'routes' ? model_alias THEN
                patched_compiled := jsonb_set(
                    patched_compiled,
                    ARRAY['routes', model_alias, 'metadata', 'model', 'public_catalog'],
                    'true'::JSONB,
                    false
                );
                patched_compiled := jsonb_set(
                    patched_compiled,
                    ARRAY['routes', model_alias, 'model', 'public_catalog'],
                    'true'::JSONB,
                    false
                );
            END IF;
        END LOOP;

        FOR pool_entry IN SELECT value FROM jsonb_array_elements(updated_pool_rows) LOOP
            pool_alias := pool_entry->>'alias';
            pool_revision := (pool_entry->>'revision')::BIGINT;
            IF patched_compiled->'pools' ? pool_alias THEN
                patched_compiled := jsonb_set(
                    patched_compiled,
                    ARRAY['pools', pool_alias, 'public_catalog'],
                    'true'::JSONB,
                    false
                );
                patched_compiled := jsonb_set(
                    patched_compiled,
                    ARRAY['pools', pool_alias, 'revision'],
                    to_jsonb(pool_revision),
                    false
                );
            END IF;
        END LOOP;

        INSERT INTO routing_registry_generations (static_identity, compiled, offer_revisions)
        VALUES (
            active_static_identity,
            patched_compiled,
            COALESCE(active_offer_revisions, patched_compiled->'offers', '{}'::JSONB)
        )
        RETURNING generation INTO new_generation;

        UPDATE routing_registry_active
        SET generation = new_generation
        WHERE singleton;
    END IF;

    PERFORM set_config('niu.registry_dirty', '0', true);
END;
$$;
