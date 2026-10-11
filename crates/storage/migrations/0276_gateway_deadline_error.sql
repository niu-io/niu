-- Preserve the dispatch predicate; give this known pre-dispatch denial its own
-- SQLSTATE so callers do not report it as a database outage or upstream failure.
CREATE OR REPLACE FUNCTION require_gateway_retry_deadline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution='may_have_executed' AND OLD.execution='not_sent' AND EXISTS (
        SELECT 1 FROM gateway_retry_policies p
        WHERE p.operation_id=NEW.operation_id AND p.deadline<=clock_timestamp()
    ) THEN
        RAISE EXCEPTION 'Gateway operation deadline expired' USING ERRCODE='P0028';
    END IF;
    RETURN NEW;
END;
$$;
