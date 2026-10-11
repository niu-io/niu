-- Offline rotation coordination. No key, ciphertext or plaintext belongs here.
-- The command remains unavailable until all encrypted domains are implemented.
CREATE TABLE encryption_rotation_operations (
    id UUID PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    completed_at TIMESTAMPTZ,
    CHECK (completed_at IS NULL OR completed_at >= started_at)
);
CREATE UNIQUE INDEX one_active_encryption_rotation
    ON encryption_rotation_operations ((TRUE)) WHERE completed_at IS NULL;

CREATE FUNCTION preserve_encryption_rotation_operation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL
       AND ROW(NEW.id, NEW.started_at) IS NOT DISTINCT FROM ROW(OLD.id, OLD.started_at)
    THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'encryption rotation history permits completion only' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER immutable_encryption_rotation_operation
    BEFORE UPDATE OR DELETE ON encryption_rotation_operations
    FOR EACH ROW EXECUTE FUNCTION preserve_encryption_rotation_operation();
