-- Tombstones remain permanent; this table stores only retry eligibility.
CREATE TABLE media_result_cleanup_retries (
    attempt_id UUID NOT NULL,
    kind TEXT NOT NULL,
    retry_after TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(attempt_id, kind),
    FOREIGN KEY(attempt_id, kind) REFERENCES media_result_references(attempt_id, kind)
);

-- Explicit erasure must also retire any previous cleanup failure marker.
CREATE FUNCTION clear_media_result_cleanup_retry() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM media_result_cleanup_retries
     WHERE attempt_id = NEW.attempt_id AND kind = NEW.kind;
    RETURN NEW;
END;
$$;
CREATE TRIGGER clear_media_result_cleanup_retry
AFTER UPDATE OF deleted_at ON media_result_references
FOR EACH ROW WHEN (NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION clear_media_result_cleanup_retry();

CREATE FUNCTION niu_purge_media_result_page() RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    candidate RECORD;
    removed BIGINT := 0;
    affected BIGINT;
BEGIN
    FOR candidate IN
        SELECT m.attempt_id, m.kind FROM media_result_references m
        LEFT JOIN media_result_cleanup_retries r USING (attempt_id, kind)
        WHERE m.ciphertext IS NOT NULL AND m.expires_at <= now()
          AND (r.retry_after IS NULL OR r.retry_after <= now())
        ORDER BY m.expires_at, m.attempt_id, m.kind
        LIMIT 64
        FOR UPDATE OF m SKIP LOCKED
    LOOP
        BEGIN
            UPDATE media_result_references SET ciphertext = NULL, deleted_at = clock_timestamp()
             WHERE attempt_id = candidate.attempt_id AND kind = candidate.kind
               AND deleted_at IS NULL AND expires_at <= now();
            GET DIAGNOSTICS affected = ROW_COUNT;
            removed := removed + affected;
        EXCEPTION
            WHEN integrity_constraint_violation OR data_exception OR raise_exception THEN
                INSERT INTO media_result_cleanup_retries(attempt_id, kind, retry_after)
                VALUES(candidate.attempt_id, candidate.kind, clock_timestamp() + interval '60 seconds')
                ON CONFLICT(attempt_id, kind) DO UPDATE SET retry_after = EXCLUDED.retry_after;
        END;
    END LOOP;
    RETURN removed;
END;
$$;
