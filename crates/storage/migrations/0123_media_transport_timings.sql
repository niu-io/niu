CREATE TABLE media_transport_timings (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    phase TEXT NOT NULL CHECK (phase IN ('submission','query')),
    started_unix_ms BIGINT NOT NULL CHECK (started_unix_ms BETWEEN 0 AND 9007199254740991),
    elapsed_ms BIGINT NOT NULL CHECK (elapsed_ms BETWEEN 0 AND 120000),
    outcome TEXT NOT NULL CHECK (outcome IN ('received','unavailable')),
    FOREIGN KEY (organization_id,project_id,attempt_id)
        REFERENCES media_recovery_routes(organization_id,project_id,attempt_id)
);
CREATE TRIGGER immutable_media_transport_timing BEFORE UPDATE OR DELETE ON media_transport_timings
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER require_dispatched_media_timing BEFORE INSERT ON media_transport_timings
    FOR EACH ROW EXECUTE FUNCTION require_dispatched_media_uncertainty();
CREATE INDEX media_transport_timings_scoped ON media_transport_timings(organization_id,project_id,attempt_id,started_unix_ms,id);
