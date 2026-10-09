CREATE TABLE request_timings (
    attempt_id uuid PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
    dispatch_ms bigint CHECK (dispatch_ms >= 0),
    headers_ms bigint NOT NULL CHECK (headers_ms >= 0),
    first_output_ms bigint CHECK (first_output_ms >= headers_ms),
    total_ms bigint NOT NULL CHECK (total_ms >= headers_ms),
    complete boolean NOT NULL,
    http_status integer NOT NULL CHECK (http_status BETWEEN 100 AND 599),
    CHECK (dispatch_ms IS NULL OR dispatch_ms <= headers_ms),
    CHECK (first_output_ms IS NULL OR first_output_ms <= total_ms)
);
