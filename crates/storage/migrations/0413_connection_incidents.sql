-- Incidents are operational evidence, independent of billing and route eligibility.
-- Start with adapter-qualified refusals. Unknown 403s never qualify by status alone.
CREATE TABLE connection_incidents (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reference TEXT GENERATED ALWAYS AS ('incident-' || id::text) STORED UNIQUE,
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    model_alias TEXT NOT NULL,
    cause TEXT NOT NULL CHECK (cause IN ('account_restricted','authentication_rejected')),
    first_observed_at TIMESTAMPTZ NOT NULL,
    last_observed_at TIMESTAMPTZ NOT NULL,
    observations BIGINT NOT NULL DEFAULT 1 CHECK (observations > 0),
    resolved_at TIMESTAMPTZ,
    recovery_attempt_id UUID REFERENCES attempts(id),
    CHECK ((resolved_at IS NULL) = (recovery_attempt_id IS NULL))
);
CREATE UNIQUE INDEX connection_incident_active ON connection_incidents(vendor_id,model_alias,cause)
    WHERE resolved_at IS NULL;
CREATE INDEX connection_incident_latest ON connection_incidents(vendor_id,last_observed_at DESC,id DESC);
CREATE TABLE connection_incident_observations (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    incident_id BIGINT NOT NULL REFERENCES connection_incidents(id),
    vendor_revision BIGINT NOT NULL CHECK (vendor_revision > 0),
    observed_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX connection_incident_evidence ON connection_incident_observations(incident_id,observed_at DESC);

CREATE FUNCTION niu_record_connection_incident(p_attempt UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE route RECORD; observed TIMESTAMPTZ; incident BIGINT;
BEGIN
    -- Serialize repeated evidence for the same attempt, including explicit replay.
    PERFORM id FROM attempts WHERE id=p_attempt FOR UPDATE;
    IF EXISTS(SELECT 1 FROM connection_incident_observations WHERE attempt_id=p_attempt) THEN RETURN; END IF;
    SELECT r.vendor_id,r.model_alias,r.vendor_revision,
        CASE WHEN f.kind='upstream_account_restricted' AND f.upstream_http_status=403 THEN 'account_restricted'
             WHEN f.kind='upstream_http_error' AND f.upstream_http_status=401
               AND r.nonexecution_policy='openrouter-text-auth-rejection-v1'
               AND a.execution='confirmed_not_executed' THEN 'authentication_rejected'
        END AS cause INTO route
    FROM managed_attempt_routes r JOIN attempts a ON a.id=r.attempt_id
    JOIN request_failures f ON f.attempt_id=a.id
    WHERE a.id=p_attempt AND a.dispatched_at IS NOT NULL;
    IF route.cause IS NULL THEN RETURN; END IF;
    observed := clock_timestamp();
    INSERT INTO connection_incidents(vendor_id,model_alias,cause,first_observed_at,last_observed_at)
    VALUES(route.vendor_id,route.model_alias,route.cause,observed,observed)
    ON CONFLICT(vendor_id,model_alias,cause) WHERE resolved_at IS NULL
    DO UPDATE SET first_observed_at=LEAST(connection_incidents.first_observed_at,EXCLUDED.first_observed_at),last_observed_at=GREATEST(connection_incidents.last_observed_at,EXCLUDED.last_observed_at),observations=connection_incidents.observations+1
    RETURNING id INTO incident;
    INSERT INTO connection_incident_observations(attempt_id,incident_id,vendor_revision,observed_at)
    VALUES(p_attempt,incident,route.vendor_revision,observed);
END;
$$;

CREATE FUNCTION niu_resolve_connection_incidents(p_attempt UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE success RECORD;
BEGIN
    SELECT r.vendor_id,r.model_alias,r.vendor_revision,a.dispatched_at INTO success
    FROM attempts a JOIN managed_attempt_routes r ON r.attempt_id=a.id
    JOIN vendors v ON v.id=r.vendor_id AND v.revision=r.vendor_revision
    JOIN request_timings t ON t.attempt_id=a.id
    WHERE a.id=p_attempt AND a.execution='confirmed_completed'
      AND t.complete AND t.http_status BETWEEN 200 AND 299
      AND NOT EXISTS(SELECT 1 FROM request_failures f WHERE f.attempt_id=a.id);
    IF success.dispatched_at IS NULL THEN RETURN; END IF;
    UPDATE connection_incidents i SET resolved_at=clock_timestamp(),recovery_attempt_id=p_attempt
    WHERE i.vendor_id=success.vendor_id AND i.model_alias=success.model_alias
      AND i.resolved_at IS NULL AND i.last_observed_at<success.dispatched_at
      AND NOT EXISTS(SELECT 1 FROM connection_incident_observations o
        WHERE o.incident_id=i.id AND o.vendor_revision>success.vendor_revision);
END;
$$;
CREATE FUNCTION niu_resolve_connection_incidents_on_evidence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_TABLE_NAME='attempts' THEN
        PERFORM niu_resolve_connection_incidents(NEW.id);
    ELSE
        PERFORM niu_resolve_connection_incidents(NEW.attempt_id);
    END IF;
    RETURN NEW;
END;
$$;
-- Either observation may arrive first. Both are required for positive recovery.
CREATE TRIGGER connection_incident_execution_recovery AFTER UPDATE OF execution ON attempts
    FOR EACH ROW WHEN (NEW.execution='confirmed_completed' AND OLD.execution<>'confirmed_completed')
    EXECUTE FUNCTION niu_resolve_connection_incidents_on_evidence();
CREATE TRIGGER connection_incident_timing_recovery AFTER INSERT OR UPDATE ON request_timings
    FOR EACH ROW WHEN (NEW.complete AND NEW.http_status BETWEEN 200 AND 299)
    EXECUTE FUNCTION niu_resolve_connection_incidents_on_evidence();
