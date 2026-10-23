-- Private Video timeline references contain neither internal IDs nor prompt text.
CREATE SEQUENCE product_video_session_reference_sequence START WITH 1000;
ALTER TABLE generations_sessions ADD COLUMN public_reference TEXT NOT NULL
    DEFAULT ('video-' || nextval('product_video_session_reference_sequence')::text);
CREATE UNIQUE INDEX generations_sessions_public_reference ON generations_sessions(public_reference);
ALTER TABLE generations_sessions ADD CONSTRAINT generations_sessions_public_reference_format
    CHECK (public_reference ~ '^video-[1-9][0-9]{0,18}$');
CREATE FUNCTION preserve_video_session_public_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.public_reference IS DISTINCT FROM OLD.public_reference THEN
        RAISE EXCEPTION 'public Video session references are permanent';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_video_session_public_reference BEFORE UPDATE OF public_reference ON generations_sessions
    FOR EACH ROW EXECUTE FUNCTION preserve_video_session_public_reference();
