-- Native telemetry events stay immutable; a session projection assembles their tree.
ALTER TABLE personal_agent_traces ADD COLUMN session_key TEXT;
ALTER TABLE personal_agent_traces ADD COLUMN session_segment INTEGER;
ALTER TABLE personal_agent_traces ADD CONSTRAINT personal_agent_session_key_shape
    CHECK ((session_key IS NULL AND session_segment IS NULL) OR
           (session_key ~ '^[a-f0-9]{64}$' AND session_segment >= 1));
CREATE UNIQUE INDEX personal_agent_session_segments
    ON personal_agent_traces(owner_id, connection_id, session_key, session_segment)
    WHERE session_key IS NOT NULL;
CREATE TABLE personal_agent_trace_events (
    owner_id UUID NOT NULL,
    connection_id UUID NOT NULL,
    event_id TEXT NOT NULL,
    trace_id UUID NOT NULL REFERENCES personal_agent_traces(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(owner_id, connection_id, event_id),
    FOREIGN KEY(owner_id, connection_id) REFERENCES personal_agent_connections(owner_id, id)
);
CREATE INDEX personal_agent_trace_events_trace ON personal_agent_trace_events(trace_id);
