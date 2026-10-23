-- References are independent of private titles/prompts and never grant access.
CREATE SEQUENCE product_chat_reference_sequence START WITH 1000;
ALTER TABLE chat_sessions ADD COLUMN public_reference TEXT NOT NULL
    DEFAULT ('chat-' || nextval('product_chat_reference_sequence')::text);
CREATE UNIQUE INDEX chat_sessions_public_reference ON chat_sessions(public_reference);
ALTER TABLE chat_sessions ADD CONSTRAINT chat_sessions_public_reference_format
    CHECK (public_reference ~ '^chat-[1-9][0-9]{0,18}$');
CREATE FUNCTION preserve_chat_public_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.public_reference IS DISTINCT FROM OLD.public_reference THEN
        RAISE EXCEPTION 'public chat references are permanent';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_chat_public_reference BEFORE UPDATE OF public_reference ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION preserve_chat_public_reference();
