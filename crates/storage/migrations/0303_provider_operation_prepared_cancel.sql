-- Explicit cancellation is permitted only before the durable dispatch claim.
CREATE OR REPLACE FUNCTION preserve_workspace_provider_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'http_status'-'request_id'-'updated_at')
    IS DISTINCT FROM (to_jsonb(OLD)-'status'-'http_status'-'request_id'-'updated_at') THEN
    RAISE EXCEPTION 'Provider mutation identity is immutable' USING ERRCODE='23514'; END IF;
 IF NOT ((OLD.status='prepared' AND NEW.status IN ('unknown','not_sent')) OR
         (OLD.status='unknown' AND NEW.status IN ('unknown','acknowledged','not_sent')) OR
         (NEW.status=OLD.status AND NEW.http_status IS NOT DISTINCT FROM OLD.http_status AND NEW.request_id IS NOT DISTINCT FROM OLD.request_id)) THEN
    RAISE EXCEPTION 'Provider mutation outcome cannot be replayed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
