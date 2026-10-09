-- Interrupted requests may have no headers. Their measured elapsed time and
-- dispatch still need a valid common monotonic axis.
ALTER TABLE request_timings
    ADD CONSTRAINT request_timings_nonnegative_total CHECK (total_ms >= 0),
    ADD CONSTRAINT request_timings_dispatch_within_total
        CHECK (dispatch_ms IS NULL OR dispatch_ms <= total_ms),
    ADD CONSTRAINT request_timings_output_requires_headers
        CHECK (first_output_ms IS NULL OR headers_ms IS NOT NULL);
