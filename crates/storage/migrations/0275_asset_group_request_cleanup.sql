-- Local retry eligibility only: no request content or database error text.
CREATE TABLE asset_group_request_cleanup_retries (
    record_id UUID PRIMARY KEY REFERENCES asset_group_create_intents(id),
    retry_after TIMESTAMPTZ NOT NULL
);

CREATE TRIGGER clear_asset_group_request_cleanup_retry
AFTER UPDATE OF request_body ON asset_group_create_intents
FOR EACH ROW WHEN (NEW.request_body IS NULL)
EXECUTE FUNCTION clear_asset_content_cleanup_retry('asset_group_request_cleanup_retries', 'id');

-- Preserve the original retention predicate and immutable intent provenance.
-- Each row is a subtransaction; infrastructure failures still abort the page.
CREATE FUNCTION niu_purge_asset_group_request_page() RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    candidate UUID;
    removed BIGINT := 0;
    affected BIGINT;
BEGIN
    FOR candidate IN
        SELECT i.id FROM asset_group_create_intents i
        LEFT JOIN asset_group_request_cleanup_retries r ON r.record_id=i.id
        WHERE i.request_body IS NOT NULL AND i.request_expires_at<=clock_timestamp()
          AND (r.retry_after IS NULL OR r.retry_after<=clock_timestamp())
        ORDER BY i.request_expires_at,i.id
        LIMIT 64 FOR UPDATE OF i SKIP LOCKED
    LOOP
        BEGIN
            UPDATE asset_group_create_intents SET request_body=NULL
             WHERE id=candidate AND request_body IS NOT NULL
               AND request_expires_at<=clock_timestamp();
            GET DIAGNOSTICS affected = ROW_COUNT;
            removed := removed + affected;
        EXCEPTION
            WHEN integrity_constraint_violation OR data_exception OR raise_exception THEN
                INSERT INTO asset_group_request_cleanup_retries(record_id,retry_after)
                VALUES(candidate,clock_timestamp()+interval '60 seconds')
                ON CONFLICT(record_id) DO UPDATE SET retry_after=EXCLUDED.retry_after;
        END;
    END LOOP;
    RETURN removed;
END;
$$;
