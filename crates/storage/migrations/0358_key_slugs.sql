-- Keys retain their private identity and independent secrets. Slugs only address
-- the management page within an already authorized workspace.
ALTER TABLE api_keys ADD COLUMN slug TEXT;
CREATE FUNCTION niu_available_key_slug(workspace UUID,key_name TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE base TEXT; candidate TEXT; suffix BIGINT := 1;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('niu-key-slugs:' || workspace::text,0));
    base := COALESCE(NULLIF(trim(both '-' FROM left(regexp_replace(lower(key_name COLLATE "C"),'[^a-z0-9]+','-','g'),48)),''),'key');
    candidate := base;
    WHILE candidate='new' OR EXISTS(SELECT 1 FROM api_keys WHERE project_id=workspace AND slug=candidate) LOOP
        suffix := suffix+1;
        candidate := trim(trailing '-' FROM left(base,48-length(suffix::text)-1)) || '-' || suffix;
    END LOOP;
    RETURN candidate;
END;
$$;
DO $$ DECLARE key RECORD; BEGIN
    FOR key IN SELECT id,project_id,name FROM api_keys ORDER BY created_at,id LOOP
        UPDATE api_keys SET slug=niu_available_key_slug(key.project_id,key.name) WHERE id=key.id;
    END LOOP;
END; $$;
ALTER TABLE api_keys ALTER COLUMN slug SET NOT NULL;
ALTER TABLE api_keys ADD CONSTRAINT key_workspace_slug_unique UNIQUE(project_id,slug);
ALTER TABLE api_keys ADD CONSTRAINT key_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug)<=48);
CREATE FUNCTION preserve_key_slug() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='INSERT' THEN
        NEW.slug := niu_available_key_slug(NEW.project_id,COALESCE(NEW.slug,NEW.name));
    ELSIF NEW.slug IS DISTINCT FROM OLD.slug THEN
        RAISE EXCEPTION 'key slug is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER immutable_key_slug BEFORE INSERT OR UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION preserve_key_slug();
