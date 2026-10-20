ALTER TABLE provider_businesses ADD COLUMN slug TEXT;
CREATE FUNCTION niu_available_provider_slug(provider_name TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE base TEXT; candidate TEXT; suffix BIGINT := 1;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('niu-provider-slugs',0));
    base := COALESCE(NULLIF(trim(both '-' FROM left(regexp_replace(lower(provider_name COLLATE "C"),'[^a-z0-9]+','-','g'),48)),''),'provider');
    candidate := base;
    WHILE candidate IN ('overview','models','usage','consumption','settlements','members','api-keys','configuration','settings','manage') OR EXISTS(SELECT 1 FROM provider_businesses WHERE slug=candidate) LOOP
        suffix := suffix+1;
        candidate := trim(trailing '-' FROM left(base,48-length(suffix::text)-1)) || '-' || suffix;
    END LOOP;
    RETURN candidate;
END;
$$;
DO $$ DECLARE provider RECORD; BEGIN
    FOR provider IN SELECT id,name FROM provider_businesses ORDER BY created_at,id LOOP
        UPDATE provider_businesses SET slug=niu_available_provider_slug(provider.name) WHERE id=provider.id;
    END LOOP;
END; $$;
ALTER TABLE provider_businesses ALTER COLUMN slug SET NOT NULL;
ALTER TABLE provider_businesses ADD CONSTRAINT provider_slug_unique UNIQUE(slug);
ALTER TABLE provider_businesses ADD CONSTRAINT provider_slug_format CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug)<=48);
CREATE FUNCTION preserve_provider_slug() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF TG_OP='INSERT' THEN
        PERFORM pg_advisory_xact_lock(hashtextextended('niu-provider-slugs',0));
        NEW.slug := niu_available_provider_slug(COALESCE(NEW.slug,NEW.name));
    ELSIF NEW.slug IS DISTINCT FROM OLD.slug THEN
        RAISE EXCEPTION 'provider slug is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER immutable_provider_slug BEFORE INSERT OR UPDATE ON provider_businesses FOR EACH ROW EXECUTE FUNCTION preserve_provider_slug();
