-- Safe per-transport diagnostics, independent of generation/billing state.
-- Historical rows and transport/decoding failures retain unknown HTTP status.
ALTER TABLE media_transport_timings ADD COLUMN upstream_http_status INTEGER
    CHECK (upstream_http_status BETWEEN 100 AND 599);
ALTER TABLE media_transport_timings ADD CONSTRAINT media_http_failure_outcome
    CHECK (upstream_http_status IS NULL OR outcome='unavailable');
