CREATE FUNCTION niu_guard_dispatch_provider_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.dispatch_provider IS DISTINCT FROM NEW.dispatch_provider
       AND (OLD.dispatch_provider IS NOT NULL OR OLD.execution <> 'not_sent') THEN
        RAISE EXCEPTION 'dispatch Provider snapshot is immutable' USING ERRCODE='P0006';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER immutable_dispatch_provider_snapshot
BEFORE UPDATE OF dispatch_provider ON attempts
FOR EACH ROW EXECUTE FUNCTION niu_guard_dispatch_provider_snapshot();
