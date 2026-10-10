-- Retry metadata contains no image bytes, inspection result or error message.
-- Explicit erasure of retained content also removes its pending retry.
CREATE TABLE inspected_image_cleanup_retries (
    source_id UUID PRIMARY KEY REFERENCES inspected_image_source_content(source_id) ON DELETE CASCADE,
    retry_after TIMESTAMPTZ NOT NULL
);

CREATE FUNCTION niu_purge_inspected_image_page() RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    candidate RECORD;
    removed BIGINT := 0;
    affected BIGINT;
BEGIN
    FOR candidate IN
        SELECT s.id FROM inspected_image_sources s
        JOIN inspected_image_source_content c ON c.source_id = s.id
        LEFT JOIN inspected_image_cleanup_retries r ON r.source_id = s.id
        WHERE s.expires_at <= now()
          AND (r.retry_after IS NULL OR r.retry_after <= now())
        ORDER BY s.expires_at, s.id
        LIMIT 16
        FOR UPDATE OF s SKIP LOCKED
    LOOP
        BEGIN
            -- Both mutations roll back together if either fails. Never retain
            -- an erasure marker while the corresponding deletion has failed.
            INSERT INTO inspected_image_source_erasures(source_id)
            VALUES(candidate.id) ON CONFLICT DO NOTHING;
            DELETE FROM inspected_image_source_content WHERE source_id = candidate.id;
            GET DIAGNOSTICS affected = ROW_COUNT;
            removed := removed + affected;
        EXCEPTION
            WHEN integrity_constraint_violation OR data_exception OR raise_exception THEN
                INSERT INTO inspected_image_cleanup_retries(source_id, retry_after)
                VALUES(candidate.id, clock_timestamp() + interval '60 seconds')
                ON CONFLICT(source_id) DO UPDATE SET retry_after = EXCLUDED.retry_after;
        END;
    END LOOP;
    RETURN removed;
END;
$$;
