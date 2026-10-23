-- Public support/bookmark references are independent of internal attempt UUIDs.
-- They carry no prompt content and confer no authority. Gaps are intentional.
CREATE SEQUENCE product_run_reference_sequence START WITH 1000;
ALTER TABLE attempts ADD COLUMN public_reference TEXT NOT NULL
    DEFAULT ('run-' || nextval('product_run_reference_sequence')::text);
CREATE UNIQUE INDEX attempts_public_reference ON attempts(public_reference);
ALTER TABLE attempts ADD CONSTRAINT attempts_public_reference_format
    CHECK (public_reference ~ '^run-[1-9][0-9]{0,18}$');

CREATE FUNCTION preserve_attempt_public_reference() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.public_reference IS DISTINCT FROM OLD.public_reference THEN
        RAISE EXCEPTION 'public run references are permanent';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_attempt_public_reference BEFORE UPDATE OF public_reference ON attempts
    FOR EACH ROW EXECUTE FUNCTION preserve_attempt_public_reference();
