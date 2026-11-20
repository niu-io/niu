-- Publish existing non-personal routes and platform-shared custom models in
-- the public catalog so configured shared/commercial models appear together.
-- Personal-scoped routes and organization-scoped pools remain private.

DELETE FROM routing_registry_active;

UPDATE vendor_models m
SET public_catalog = TRUE
WHERE NOT m.public_catalog
  AND NOT EXISTS (
      SELECT 1 FROM personal_vendor_ownership o
      WHERE o.vendor_id = m.vendor_id AND o.access_scope = 'personal'
  );

WITH updated_pools AS (
    UPDATE model_route_pools
    SET public_catalog = TRUE,
        revision = revision + 1
    WHERE organization_id IS NULL
      AND NOT public_catalog
    RETURNING alias, revision, organization_id, project_id, display_name, description, slug, public_catalog, billing_mode, enabled, candidates, rules, default_action
)
INSERT INTO model_route_pool_history (
    alias, revision, organization_id, project_id, display_name, description, slug, public_catalog, billing_mode, enabled, candidates, rules, default_action
)
SELECT alias, revision, organization_id, project_id, display_name, description, slug, public_catalog, billing_mode, enabled, candidates, rules, default_action
FROM updated_pools;
