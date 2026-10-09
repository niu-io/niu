-- Operational scheduling, separate from immutable execution/accounting evidence.
CREATE TABLE media_query_schedule (
    attempt_id UUID PRIMARY KEY REFERENCES media_jobs(attempt_id),
    next_poll_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lease_owner UUID,
    lease_until TIMESTAMPTZ,
    failures INTEGER NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 16),
    stopped BOOLEAN NOT NULL DEFAULT false,
    CHECK ((lease_owner IS NULL)=(lease_until IS NULL))
);
CREATE INDEX media_query_schedule_due ON media_query_schedule(next_poll_at,attempt_id) WHERE NOT stopped;
