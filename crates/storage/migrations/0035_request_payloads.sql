-- Explicit per-request payload capture is separate from the metadata ledger.
CREATE TABLE request_payloads (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
    request_body JSONB NOT NULL,
    response_body TEXT NOT NULL,
    response_content_type TEXT NOT NULL,
    response_complete BOOLEAN NOT NULL,
    response_truncated BOOLEAN NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
    CHECK (octet_length(request_body::text) <= 2097152),
    CHECK (octet_length(response_body) <= 1048576)
);
CREATE INDEX request_payloads_expiry ON request_payloads(expires_at);
