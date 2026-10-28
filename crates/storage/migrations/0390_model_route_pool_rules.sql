-- Unify configurable routing rules, presets, custom model identity, billing modes,
-- public catalog publication, and workspace scope into Model Pools (#117).

CREATE FUNCTION niu_available_pool_slug(pool_name TEXT, current_alias TEXT DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    base TEXT;
    candidate TEXT;
    suffix BIGINT := 1;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('niu-pool-slugs', 0));
    base := COALESCE(NULLIF(trim(both '-' FROM left(
        regexp_replace(lower(pool_name COLLATE "C"), '[^a-z0-9]+', '-', 'g'), 80)), ''), 'pool');
    candidate := base;
    WHILE candidate IN ('index', 'history', 'preview', 'audit', 'new')
        OR EXISTS(
            SELECT 1 FROM model_route_pools
            WHERE slug = candidate
              AND (current_alias IS NULL OR alias <> current_alias)
        )
    LOOP
        suffix := suffix + 1;
        candidate := trim(trailing '-' FROM left(base, 80 - length(suffix::text) - 1)) || '-' || suffix;
    END LOOP;
    RETURN candidate;
END;
$$;

ALTER TABLE model_route_pools
    ADD COLUMN display_name TEXT CHECK (display_name IS NULL OR (length(btrim(display_name)) BETWEEN 1 AND 200)),
    ADD COLUMN description TEXT CHECK (description IS NULL OR length(description) <= 4000),
    ADD COLUMN slug TEXT CHECK (slug IS NULL OR (length(slug) BETWEEN 1 AND 200 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')),
    ADD COLUMN project_id UUID REFERENCES projects(id),
    ADD COLUMN public_catalog BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN billing_mode TEXT NOT NULL DEFAULT 'pool_tariff' CHECK (billing_mode IN ('pool_tariff', 'candidate_tariff')),
    ADD COLUMN rules JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rules) = 'array' AND jsonb_array_length(rules) <= 32),
    ADD COLUMN default_action TEXT NOT NULL DEFAULT 'candidates' CHECK (default_action IN ('candidates', 'reject')),
    ADD CONSTRAINT model_route_pools_project_org_check CHECK (project_id IS NULL OR organization_id IS NOT NULL),
    ADD CONSTRAINT model_route_pools_public_catalog_check CHECK (NOT public_catalog OR organization_id IS NULL),
    ADD CONSTRAINT model_route_pools_project_org_fk FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id);

ALTER TABLE model_route_pool_history
    ADD COLUMN display_name TEXT CHECK (display_name IS NULL OR (length(btrim(display_name)) BETWEEN 1 AND 200)),
    ADD COLUMN description TEXT CHECK (description IS NULL OR length(description) <= 4000),
    ADD COLUMN slug TEXT CHECK (slug IS NULL OR (length(slug) BETWEEN 1 AND 200 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')),
    ADD COLUMN project_id UUID REFERENCES projects(id),
    ADD COLUMN public_catalog BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN billing_mode TEXT NOT NULL DEFAULT 'pool_tariff' CHECK (billing_mode IN ('pool_tariff', 'candidate_tariff')),
    ADD COLUMN rules JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rules) = 'array' AND jsonb_array_length(rules) <= 32),
    ADD COLUMN default_action TEXT NOT NULL DEFAULT 'candidates' CHECK (default_action IN ('candidates', 'reject')),
    ADD CONSTRAINT model_route_pool_history_project_org_check CHECK (project_id IS NULL OR organization_id IS NOT NULL),
    ADD CONSTRAINT model_route_pool_history_public_catalog_check CHECK (NOT public_catalog OR organization_id IS NULL),
    ADD CONSTRAINT model_route_pool_history_project_org_fk FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id);

ALTER TABLE model_route_pools DISABLE TRIGGER USER;
DO $$
DECLARE pool_row RECORD;
BEGIN
    FOR pool_row IN SELECT alias, display_name FROM model_route_pools WHERE slug IS NULL ORDER BY alias LOOP
        UPDATE model_route_pools
           SET slug = niu_available_pool_slug(COALESCE(pool_row.display_name, pool_row.alias), pool_row.alias)
         WHERE alias = pool_row.alias;
    END LOOP;
END;
$$;
ALTER TABLE model_route_pools ENABLE TRIGGER USER;

CREATE UNIQUE INDEX model_route_pools_slug_unique ON model_route_pools(slug) WHERE slug IS NOT NULL;

CREATE OR REPLACE FUNCTION protect_model_route_pool() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'route pool identity or revision conflict' USING ERRCODE = 'P0024';
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.revision <> 1 THEN
            RAISE EXCEPTION 'route pool identity or revision conflict' USING ERRCODE = 'P0024';
        END IF;
        NEW.slug := niu_available_pool_slug(COALESCE(NEW.slug, NEW.display_name, NEW.alias), NEW.alias);
        RETURN NEW;
    END IF;
    IF NEW.alias <> OLD.alias
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.revision <> OLD.revision + 1 THEN
        RAISE EXCEPTION 'route pool identity or revision conflict' USING ERRCODE = 'P0024';
    END IF;
    IF NEW.slug IS NULL OR NEW.slug = OLD.slug THEN
        NEW.slug := COALESCE(OLD.slug, niu_available_pool_slug(COALESCE(NEW.display_name, NEW.alias), NEW.alias));
    ELSE
        NEW.slug := niu_available_pool_slug(NEW.slug, NEW.alias);
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION recheck_managed_attempt_route() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE binding managed_attempt_routes%ROWTYPE;
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    SELECT * INTO binding FROM managed_attempt_routes WHERE attempt_id = NEW.id;
    IF NOT FOUND THEN RETURN NEW; END IF; -- Static/legacy dispatch remains compatible.
    IF binding.pool_alias IS NOT NULL THEN
        PERFORM alias FROM model_route_pools WHERE alias = binding.pool_alias FOR SHARE;
        IF NOT EXISTS (
            SELECT 1 FROM model_route_pools p
            WHERE p.alias = binding.pool_alias AND p.alias = NEW.resource_id
              AND p.enabled AND p.revision = binding.pool_revision
              AND (p.organization_id IS NULL OR p.organization_id = NEW.organization_id)
              AND (p.project_id IS NULL OR p.project_id = NEW.project_id)
              AND (
                  EXISTS (
                      SELECT 1 FROM jsonb_array_elements(p.candidates) c
                      WHERE c->>'alias' = binding.model_alias AND (c->>'enabled')::boolean
                  )
                  OR (
                      EXISTS (
                          SELECT 1 FROM jsonb_array_elements(p.candidates) c
                          WHERE c->>'alias' = binding.model_alias
                      )
                      AND EXISTS (
                          SELECT 1
                          FROM jsonb_array_elements(p.rules) r,
                               jsonb_array_elements(COALESCE(r->'candidates', '[]'::jsonb)) rc
                          WHERE COALESCE((r->>'enabled')::boolean, false)
                            AND rc->>'alias' = binding.model_alias
                            AND COALESCE((rc->>'enabled')::boolean, false)
                      )
                  )
              )
              AND ((p.organization_id IS NULL AND NOT EXISTS(
                  SELECT 1 FROM personal_vendor_ownership o WHERE o.vendor_id = binding.vendor_id))
                  OR EXISTS(SELECT 1 FROM personal_vendor_ownership o
                      WHERE o.vendor_id = binding.vendor_id AND o.organization_id = p.organization_id))
        ) THEN
            RAISE EXCEPTION 'route pool changed before dispatch' USING ERRCODE = 'P0024';
        END IF;
    END IF;
    PERFORM id FROM vendors WHERE id = binding.vendor_id FOR SHARE;
    PERFORM alias FROM vendor_models WHERE alias = binding.model_alias FOR SHARE;
    IF NOT EXISTS (
        SELECT 1 FROM vendor_models m JOIN vendors v ON v.id = m.vendor_id
        WHERE m.alias = binding.model_alias AND (binding.pool_alias = NEW.resource_id OR (binding.pool_alias IS NULL AND m.alias = NEW.resource_id))
          AND v.id = binding.vendor_id AND v.enabled AND m.enabled
          AND v.revision = binding.vendor_revision AND m.revision = binding.model_revision
          AND v.adapter = NEW.dispatch_provider
          AND NOT EXISTS (SELECT 1 FROM personal_vendor_ownership o
              WHERE o.vendor_id = v.id AND o.organization_id <> NEW.organization_id)
    ) THEN
        RAISE EXCEPTION 'managed route changed before dispatch' USING ERRCODE = 'P0024';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_customer_unit_tariff_binding() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM operations o
        JOIN customer_unit_text_tariffs p ON (
            p.model_alias = o.model_alias
            OR EXISTS (
                SELECT 1 FROM model_route_pools pool
                WHERE pool.alias = o.model_alias
                  AND pool.billing_mode = 'candidate_tariff'
                  AND EXISTS (
                      SELECT 1 FROM jsonb_array_elements(pool.candidates) c
                      WHERE c->>'alias' = p.model_alias
                  )
            )
        )
        WHERE o.id = NEW.operation_id AND p.revision = NEW.revision
    )
    OR (TG_TABLE_NAME = 'customer_unit_attempt_tariffs' AND NOT EXISTS (
        SELECT 1 FROM attempts a WHERE a.id = (to_jsonb(NEW)->>'attempt_id')::uuid
            AND a.operation_id = NEW.operation_id AND a.execution = 'not_sent'
            AND NOT EXISTS(SELECT 1 FROM customer_attempt_tariffs m WHERE m.attempt_id = a.id)
    )) THEN
        RAISE EXCEPTION 'Credits tariff must match the original operation and unsent attempt'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_retail_text_operation_price() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected_promotion UUID; selected_customer UUID; bound_revision UUID;
BEGIN
    SELECT m.promotion_revision INTO STRICT selected_promotion
        FROM retail_text_materializations m
        JOIN customer_tariffs t ON t.id = m.tariff_id JOIN operations o ON o.id = NEW.operation_id
        WHERE m.revision_id = NEW.revision_id AND t.organization_id = NEW.organization_id
          AND t.project_id = NEW.project_id AND (
              t.model_alias = o.model_alias
              OR EXISTS (
                  SELECT 1 FROM model_route_pools pool
                  WHERE pool.alias = o.model_alias
                    AND pool.billing_mode = 'candidate_tariff'
                    AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements(pool.candidates) c
                        WHERE c->>'alias' = t.model_alias
                    )
              )
          );
    SELECT revision_id INTO STRICT bound_revision FROM customer_operation_tariffs
        WHERE operation_id = NEW.operation_id;
    IF bound_revision <> NEW.revision_id THEN
        RAISE EXCEPTION 'Retail provenance must match the pinned operation price' USING ERRCODE = '23514';
    END IF;
    IF selected_promotion IS NULL THEN
        IF NEW.promotion_scope IS NOT NULL THEN
            RAISE EXCEPTION 'Standard price cannot claim a promotion scope' USING ERRCODE = '23514';
        END IF;
    ELSE
        SELECT customer_organization_id INTO STRICT selected_customer
            FROM platform_retail_promotions p WHERE id = selected_promotion
              AND p.effective_from <= NEW.selected_at AND p.effective_until > NEW.selected_at
              AND NOT EXISTS (SELECT 1 FROM platform_retail_promotion_retirements r
                  WHERE r.promotion_id = p.id AND r.effective_until <= NEW.selected_at);
        IF (selected_customer IS NULL AND NEW.promotion_scope IS DISTINCT FROM 'global')
            OR (selected_customer IS NOT NULL AND (selected_customer <> NEW.organization_id
                OR NEW.promotion_scope IS DISTINCT FROM 'customer')) THEN
            RAISE EXCEPTION 'Retail promotion customer scope conflicts' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
