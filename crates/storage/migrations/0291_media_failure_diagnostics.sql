-- Preserve observed safe diagnostics without changing historic uncertainty,
-- financial identity or immutable timing records. No body/message is stored.
ALTER TABLE media_transport_timings
    ADD COLUMN upstream_error_code TEXT,
    ADD COLUMN upstream_request_id TEXT,
    ADD CONSTRAINT media_failure_error_code CHECK (
        upstream_error_code IS NULL OR (
            upstream_error_code ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'
            AND upstream_error_code !~* '^sk-')),
    ADD CONSTRAINT media_failure_request_id CHECK (
        upstream_request_id IS NULL OR (
            upstream_request_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,199}$'
            AND upstream_request_id !~* '^sk-')),
    ADD CONSTRAINT media_failure_diagnostic_response CHECK (
        (upstream_error_code IS NULL AND upstream_request_id IS NULL)
        OR (outcome='unavailable' AND upstream_http_status IS NOT NULL));
