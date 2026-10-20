-- Human-chosen slugs are stable URL references; internal UUIDs remain unchanged.
-- Keep previously issued URLs resolvable after replacing UUID-suffixed slugs.
CREATE TABLE workspace_slug_aliases (
    slug TEXT PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX workspace_slug_aliases_project ON workspace_slug_aliases(project_id);

CREATE FUNCTION niu_available_workspace_slug(workspace_name TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    base TEXT;
    candidate TEXT;
    suffix BIGINT := 1;
BEGIN
    -- Serialize the shared URL namespace, including explicit slug reservations.
    PERFORM pg_advisory_xact_lock(hashtextextended('niu-workspace-slugs', 0));
    base := COALESCE(NULLIF(trim(both '-' FROM left(
        regexp_replace(lower(workspace_name COLLATE "C"), '[^a-z0-9]+', '-', 'g'), 48)), ''), 'workspace');
    candidate := base;
    WHILE candidate = 'default'
        OR EXISTS(SELECT 1 FROM projects WHERE route_slug = candidate)
        OR EXISTS(SELECT 1 FROM workspace_slug_aliases WHERE slug = candidate)
    LOOP
        suffix := suffix + 1;
        candidate := trim(trailing '-' FROM left(base, 48 - length(suffix::text) - 1)) || '-' || suffix;
    END LOOP;
    RETURN candidate;
END;
$$;

ALTER TABLE projects DROP CONSTRAINT workspace_route_slug_format;
ALTER TABLE projects ADD CONSTRAINT workspace_route_slug_format
    CHECK (route_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(route_slug)<=81 AND route_slug=lower(route_slug));

ALTER TABLE projects DISABLE TRIGGER immutable_workspace_route_slug;
DO $$
DECLARE workspace RECORD;
BEGIN
    FOR workspace IN SELECT id,name,route_slug FROM projects
        WHERE right(route_slug,33) = '-' || replace(id::text,'-','')
        ORDER BY created_at,id
    LOOP
        INSERT INTO workspace_slug_aliases(slug,project_id) VALUES(workspace.route_slug,workspace.id);
        UPDATE projects SET route_slug=niu_available_workspace_slug(
            CASE WHEN workspace.name='Default project' THEN 'Default workspace' ELSE workspace.name END
        ) WHERE id=workspace.id;
    END LOOP;
END;
$$;
UPDATE projects SET name='Default workspace' WHERE name='Default project';
ALTER TABLE projects ENABLE TRIGGER immutable_workspace_route_slug;

CREATE OR REPLACE FUNCTION preserve_workspace_route_slug() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.name = 'Default project' THEN NEW.name := 'Default workspace'; END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended('niu-workspace-slugs', 0));
        IF NEW.route_slug IS NULL THEN
            NEW.route_slug := niu_available_workspace_slug(NEW.name);
        ELSE
            IF NEW.route_slug = 'default' OR length(NEW.route_slug)>48 THEN
                RAISE EXCEPTION 'invalid workspace slug' USING ERRCODE = '23514';
            END IF;
            IF EXISTS(SELECT 1 FROM workspace_slug_aliases WHERE slug=NEW.route_slug) THEN
                RAISE EXCEPTION 'workspace slug is already in use' USING ERRCODE = '23505';
            END IF;
        END IF;
    ELSIF NEW.route_slug IS DISTINCT FROM OLD.route_slug THEN
        RAISE EXCEPTION 'workspace slug is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
