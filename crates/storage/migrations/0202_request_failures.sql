-- Content-free upstream diagnostics survive optional request-payload deletion.
-- A failure observation never establishes execution, usage or settlement state.
CREATE TABLE request_failures (
    attempt_id uuid PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN (
        'upstream_http_error', 'upstream_region_unavailable',
        'upstream_timeout', 'upstream_connection_error',
        'upstream_transport_error', 'upstream_invalid_response'
    )),
    upstream_http_status smallint,
    CHECK (
        (kind = 'upstream_region_unavailable' AND upstream_http_status IS NOT NULL AND upstream_http_status = 403)
        OR (kind = 'upstream_http_error' AND upstream_http_status IS NOT NULL
            AND upstream_http_status BETWEEN 100 AND 599
            AND upstream_http_status NOT BETWEEN 200 AND 299)
        OR (kind IN ('upstream_timeout', 'upstream_connection_error',
                     'upstream_transport_error', 'upstream_invalid_response')
            AND upstream_http_status IS NULL)
    )
);

CREATE FUNCTION preserve_request_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'request failure observation is immutable' USING ERRCODE='P0008';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_request_failure BEFORE UPDATE ON request_failures
    FOR EACH ROW EXECUTE FUNCTION preserve_request_failure();
