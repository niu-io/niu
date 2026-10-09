-- Cancellation may precede upstream response headers. Unknown values stay null.
ALTER TABLE request_timings ALTER COLUMN headers_ms DROP NOT NULL;
ALTER TABLE request_timings ALTER COLUMN http_status DROP NOT NULL;
