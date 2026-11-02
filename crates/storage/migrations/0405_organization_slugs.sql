-- Durable human-readable organization slugs and membership backfill.
INSERT INTO account_identities (id, created_at)
SELECT id, created_at
FROM admin_operators
WHERE organization_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

INSERT INTO account_memberships (identity_id, operator_id, organization_id, created_at)
SELECT id, id, organization_id, created_at
FROM admin_operators
WHERE organization_id IS NOT NULL
ON CONFLICT (operator_id) DO NOTHING;

ALTER TABLE organizations ADD COLUMN slug TEXT;

CREATE TABLE organization_slug_aliases (
    slug TEXT PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
);
CREATE INDEX organization_slug_aliases_organization ON organization_slug_aliases(organization_id);

CREATE FUNCTION niu_available_organization_slug(organization_name TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    base TEXT;
    candidate TEXT;
    suffix BIGINT := 1;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('niu-organization-slugs', 0));
    base := COALESCE(NULLIF(trim(both '-' FROM left(
        regexp_replace(lower(organization_name COLLATE "C"), '[^a-z0-9]+', '-', 'g'), 48)), ''), 'organization');
    candidate := base;
    WHILE candidate IN (
        'default', 'new', 'by-route', 'settings', 'members', 'workspaces',
        'billing', 'credits', 'invoices', 'payments', 'providers', 'settlements'
    )
        OR EXISTS(SELECT 1 FROM organizations WHERE slug = candidate)
        OR EXISTS(SELECT 1 FROM organization_slug_aliases WHERE slug = candidate)
    LOOP
        suffix := suffix + 1;
        candidate := trim(trailing '-' FROM left(base, 48 - length(suffix::text) - 1)) || '-' || suffix;
    END LOOP;
    RETURN candidate;
END;
$$;

DO $$
DECLARE org RECORD;
BEGIN
    FOR org IN SELECT id, name FROM organizations ORDER BY created_at, id LOOP
        UPDATE organizations SET slug = niu_available_organization_slug(org.name) WHERE id = org.id;
    END LOOP;
END;
$$;

ALTER TABLE organizations ALTER COLUMN slug SET NOT NULL;
ALTER TABLE organizations ADD CONSTRAINT organization_slug_unique UNIQUE (slug);
ALTER TABLE organizations ADD CONSTRAINT organization_slug_format
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 48 AND slug = lower(slug));

CREATE FUNCTION preserve_organization_slug() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('niu-organization-slugs', 0));
        IF NEW.slug IS NULL THEN
            NEW.slug := niu_available_organization_slug(NEW.name);
        ELSE
            IF NEW.slug IN (
                'default', 'new', 'by-route', 'settings', 'members', 'workspaces',
                'billing', 'credits', 'invoices', 'payments', 'providers', 'settlements'
            ) OR length(NEW.slug) > 48 THEN
                RAISE EXCEPTION 'invalid organization slug' USING ERRCODE = '23514';
            END IF;
            IF EXISTS(SELECT 1 FROM organization_slug_aliases WHERE slug = NEW.slug) THEN
                RAISE EXCEPTION 'organization slug is already in use' USING ERRCODE = '23505';
            END IF;
        END IF;
    ELSIF NEW.slug IS DISTINCT FROM OLD.slug THEN
        RAISE EXCEPTION 'organization slug is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER immutable_organization_slug
BEFORE INSERT OR UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION preserve_organization_slug();

CREATE OR REPLACE FUNCTION preserve_workspace_route_slug() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.name = 'Default project' THEN NEW.name := 'Default'; END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended('niu-workspace-slugs', 0));
        IF NEW.route_slug IS NULL THEN
            NEW.route_slug := niu_available_workspace_slug(NEW.name);
        ELSE
            IF length(NEW.route_slug) > 48 THEN
                RAISE EXCEPTION 'invalid workspace slug' USING ERRCODE = '23514';
            END IF;
            IF EXISTS(SELECT 1 FROM workspace_slug_aliases WHERE slug = NEW.route_slug) THEN
                RAISE EXCEPTION 'workspace slug is already in use' USING ERRCODE = '23505';
            END IF;
        END IF;
    ELSIF NEW.route_slug IS DISTINCT FROM OLD.route_slug THEN
        RAISE EXCEPTION 'workspace slug is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

ALTER TABLE projects DISABLE TRIGGER immutable_workspace_route_slug;
INSERT INTO workspace_slug_aliases (slug, project_id)
SELECT p.route_slug, p.id
FROM projects p
WHERE p.route_slug = 'default-workspace'
  AND (EXISTS (SELECT 1 FROM default_workspace d WHERE d.project_id = p.id)
       OR NOT EXISTS (SELECT 1 FROM projects WHERE route_slug = 'default'))
ON CONFLICT (slug) DO NOTHING;

UPDATE projects p
SET name = CASE WHEN p.name IN ('Default workspace', 'Default project') THEN 'Default' ELSE p.name END,
    route_slug = 'default'
WHERE p.route_slug = 'default-workspace'
  AND (EXISTS (SELECT 1 FROM default_workspace d WHERE d.project_id = p.id)
       OR NOT EXISTS (SELECT 1 FROM projects WHERE route_slug = 'default'));
ALTER TABLE projects ENABLE TRIGGER immutable_workspace_route_slug;
