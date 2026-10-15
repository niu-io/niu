-- Cache payload_bytes and title on chat_sessions so session listings and size
-- guards never detoast multi-MB conversation payloads twice per read.

ALTER TABLE chat_sessions
    ADD COLUMN IF NOT EXISTS payload_bytes BIGINT,
    ADD COLUMN IF NOT EXISTS title TEXT;

CREATE OR REPLACE FUNCTION niu_sync_chat_session_payload_metadata()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.payload_bytes := octet_length(NEW.payload::text)::bigint;
    NEW.title := CASE
        WHEN jsonb_typeof(NEW.payload->'title') = 'string'
         AND btrim(NEW.payload->>'title') <> ''
        THEN NEW.payload->>'title'
        ELSE NULL
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_chat_session_payload_metadata ON chat_sessions;
CREATE TRIGGER sync_chat_session_payload_metadata
    BEFORE INSERT OR UPDATE OF payload ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION niu_sync_chat_session_payload_metadata();

UPDATE chat_sessions
SET payload_bytes = octet_length(payload::text)::bigint,
    title = CASE
        WHEN jsonb_typeof(payload->'title') = 'string'
         AND btrim(payload->>'title') <> ''
        THEN payload->>'title'
        ELSE NULL
    END
WHERE payload_bytes IS NULL;
