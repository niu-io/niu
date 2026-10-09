-- Keep explicit deletion effective even if asynchronous capture finishes later.
-- Contains no request or response content; accounting remains unchanged.
CREATE TABLE request_payload_deletions (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
