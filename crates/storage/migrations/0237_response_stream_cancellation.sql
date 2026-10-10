-- Cancellation is delivery evidence only, never proof of upstream nonexecution.
ALTER TABLE request_failures DROP CONSTRAINT request_failures_kind_check;
ALTER TABLE request_failures DROP CONSTRAINT request_failures_check;
ALTER TABLE request_failures ADD CONSTRAINT request_failures_kind_check CHECK (kind IN (
    'upstream_http_error','upstream_region_unavailable','upstream_timeout',
    'upstream_connection_error','upstream_transport_error','upstream_invalid_response',
    'response_stream_cancelled'
));
ALTER TABLE request_failures ADD CONSTRAINT request_failures_check CHECK (
    (kind='upstream_region_unavailable' AND upstream_http_status IS NOT NULL AND upstream_http_status=403)
    OR (kind='upstream_http_error' AND upstream_http_status IS NOT NULL
        AND upstream_http_status BETWEEN 100 AND 599 AND upstream_http_status NOT BETWEEN 200 AND 299)
    OR (kind IN ('upstream_timeout','upstream_connection_error','upstream_transport_error',
        'upstream_invalid_response','response_stream_cancelled') AND upstream_http_status IS NULL)
);
