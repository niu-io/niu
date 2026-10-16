-- Existing uncertainty remains truthful: no category is inferred for old records.
ALTER TABLE workspace_provider_asset_operations ADD COLUMN diagnostic JSONB
 CHECK (diagnostic IS NULL OR ((
   jsonb_typeof(diagnostic)='object'
   AND diagnostic ?& ARRAY['category','phase']
   AND diagnostic-'category'-'phase'='{}'::jsonb
   AND diagnostic->>'category' IN ('transport','timeout','response_too_large','invalid_response','upstream_rejected')
   AND diagnostic->>'phase' IN ('exchange','response','acknowledgement')
 ) IS TRUE));

CREATE OR REPLACE FUNCTION preserve_workspace_provider_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'http_status'-'request_id'-'diagnostic'-'updated_at')
    IS DISTINCT FROM (to_jsonb(OLD)-'status'-'http_status'-'request_id'-'diagnostic'-'updated_at') THEN
    RAISE EXCEPTION 'Provider mutation identity is immutable' USING ERRCODE='23514'; END IF;
 -- Only completion of an already claimed operation can attach a first diagnostic.
 -- Once retained, it survives all later status transitions and cannot be rewritten.
 IF NEW.diagnostic IS DISTINCT FROM OLD.diagnostic
    AND (OLD.status<>'unknown' OR OLD.diagnostic IS NOT NULL OR NEW.status<>'unknown') THEN
    RAISE EXCEPTION 'Provider mutation diagnostic is immutable' USING ERRCODE='23514'; END IF;
 IF NOT ((OLD.status='prepared' AND NEW.status IN ('unknown','not_sent')) OR
         (OLD.status='unknown' AND NEW.status IN ('unknown','acknowledged','not_sent')) OR
         (NEW.status=OLD.status AND NEW.http_status IS NOT DISTINCT FROM OLD.http_status AND NEW.request_id IS NOT DISTINCT FROM OLD.request_id)) THEN
    RAISE EXCEPTION 'Provider mutation outcome cannot be replayed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
