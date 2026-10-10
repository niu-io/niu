-- Retry metadata contains no request content or database error messages.
-- Successful or explicit payload deletion removes the corresponding retry state.
CREATE TABLE request_payload_cleanup_retries (
    attempt_id UUID PRIMARY KEY REFERENCES request_payloads(attempt_id) ON DELETE CASCADE,
    retry_after TIMESTAMPTZ NOT NULL
);

-- Each exception block is a PostgreSQL subtransaction. A malformed/poisoned
-- row cannot roll back successful neighbors. Infrastructure failures and the
-- caller's statement deadline still abort the bounded maintenance transaction.
CREATE FUNCTION niu_purge_request_payload_page() RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    candidate UUID;
    removed BIGINT := 0;
    affected BIGINT;
BEGIN
    FOR candidate IN
        SELECT p.attempt_id FROM request_payloads p
        LEFT JOIN request_payload_cleanup_retries r USING (attempt_id)
        WHERE p.expires_at <= clock_timestamp()
          AND (r.retry_after IS NULL OR r.retry_after <= clock_timestamp())
        ORDER BY p.expires_at, p.attempt_id
        LIMIT 64
        FOR UPDATE OF p SKIP LOCKED
    LOOP
        BEGIN
            DELETE FROM request_payloads
             WHERE attempt_id = candidate AND expires_at <= clock_timestamp();
            GET DIAGNOSTICS affected = ROW_COUNT;
            removed := removed + affected;
        EXCEPTION
            WHEN integrity_constraint_violation OR data_exception OR raise_exception THEN
                INSERT INTO request_payload_cleanup_retries(attempt_id, retry_after)
                VALUES(candidate, clock_timestamp() + interval '60 seconds')
                ON CONFLICT(attempt_id) DO UPDATE SET retry_after = EXCLUDED.retry_after;
        END;
    END LOOP;
    RETURN removed;
END;
$$;
