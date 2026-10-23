-- Readable saved-input bookmarks do not change immutable dispatch identity.
CREATE SEQUENCE product_video_input_reference_sequence START WITH 1000;
ALTER TABLE video_submission_intents ADD COLUMN public_reference TEXT NOT NULL
    DEFAULT ('input-' || nextval('product_video_input_reference_sequence')::text);
CREATE UNIQUE INDEX video_submission_intents_public_reference ON video_submission_intents(public_reference);
ALTER TABLE video_submission_intents ADD CONSTRAINT video_input_public_reference_format
    CHECK (public_reference ~ '^input-[1-9][0-9]{0,18}$');
CREATE FUNCTION preserve_video_input_public_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.public_reference IS DISTINCT FROM OLD.public_reference THEN
        RAISE EXCEPTION 'public Video input references are permanent';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_video_input_public_reference BEFORE UPDATE OF public_reference ON video_submission_intents
    FOR EACH ROW EXECUTE FUNCTION preserve_video_input_public_reference();
