-- Result retrieval is transport evidence, never another generation or charge.
ALTER TABLE media_transport_timings DROP CONSTRAINT media_transport_timings_phase_check;
ALTER TABLE media_transport_timings ADD CONSTRAINT media_transport_timings_phase_check
    CHECK (phase IN ('submission','query','result'));
