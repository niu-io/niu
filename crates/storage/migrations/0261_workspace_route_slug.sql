-- A routing reference, never a display label or authorization grant. The full
-- existing UUID suffix makes duplicate names collision-safe without changing IDs.
ALTER TABLE projects ADD COLUMN route_slug TEXT;

CREATE FUNCTION niu_initial_workspace_route_slug(workspace_name TEXT, workspace_id UUID)
RETURNS TEXT LANGUAGE SQL IMMUTABLE STRICT AS $$
    SELECT COALESCE(NULLIF(trim(both '-' FROM left(
        regexp_replace(lower(workspace_name COLLATE "C"), '[^a-z0-9]+', '-', 'g'), 48)), ''), 'workspace')
        || '-' || replace(workspace_id::text, '-', '');
$$;

UPDATE projects SET route_slug = niu_initial_workspace_route_slug(name, id);
ALTER TABLE projects ALTER COLUMN route_slug SET NOT NULL;
ALTER TABLE projects ADD CONSTRAINT workspace_route_slug_unique UNIQUE (route_slug);
ALTER TABLE projects ADD CONSTRAINT workspace_route_slug_format
    CHECK (route_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(route_slug) <= 81);

CREATE FUNCTION preserve_workspace_route_slug() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.route_slug := niu_initial_workspace_route_slug(NEW.name, NEW.id);
    ELSIF NEW.route_slug IS DISTINCT FROM OLD.route_slug THEN
        RAISE EXCEPTION 'workspace route identity is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_workspace_route_slug BEFORE INSERT OR UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION preserve_workspace_route_slug();
