-- Repeated actual upstream failures are operational evidence, not proof of
-- nonexecution, a retry authorization, a billing decision, or supply health.
ALTER TABLE connection_incidents DROP CONSTRAINT connection_incidents_cause_check;
ALTER TABLE connection_incidents ADD CONSTRAINT connection_incidents_cause_check
    CHECK (cause IN ('account_restricted','authentication_rejected','repeated_upstream_failures'));

CREATE TABLE connection_incident_signals (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    model_alias TEXT NOT NULL,
    vendor_revision BIGINT NOT NULL,
    model_revision BIGINT NOT NULL,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX connection_incident_signals_window ON connection_incident_signals
    (vendor_id,model_alias,vendor_revision,model_revision,observed_at DESC);

ALTER FUNCTION niu_record_connection_incident(UUID) RENAME TO niu_record_qualified_connection_incident;
CREATE FUNCTION niu_record_connection_incident(p_attempt UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE route RECORD; incident BIGINT; since_time TIMESTAMPTZ; total BIGINT; inserted BIGINT;
BEGIN
    PERFORM niu_record_qualified_connection_incident(p_attempt);
    SELECT r.vendor_id,r.model_alias,r.vendor_revision,r.model_revision INTO route
    FROM managed_attempt_routes r JOIN attempts a ON a.id=r.attempt_id
    JOIN request_failures f ON f.attempt_id=a.id
    JOIN vendors v ON v.id=r.vendor_id AND v.enabled AND v.revision=r.vendor_revision
    JOIN vendor_models m ON m.vendor_id=r.vendor_id AND m.alias=r.model_alias AND m.enabled AND m.revision=r.model_revision
    WHERE a.id=p_attempt AND a.dispatched_at IS NOT NULL
      AND (f.kind IN ('upstream_timeout','upstream_connection_error')
           OR (f.kind='upstream_http_error' AND f.upstream_http_status BETWEEN 500 AND 599))
    FOR SHARE OF v,m;
    IF route.vendor_id IS NULL THEN RETURN; END IF;
    -- The per-model lock serializes independent failures without treating a
    -- replayed attempt as another observation. It does not lock out dispatch.
    PERFORM pg_advisory_xact_lock(hashtextextended(route.vendor_id::text || ':' || route.model_alias, 0));
    INSERT INTO connection_incident_signals(attempt_id,vendor_id,model_alias,vendor_revision,model_revision)
    VALUES(p_attempt,route.vendor_id,route.model_alias,route.vendor_revision,route.model_revision)
    ON CONFLICT(attempt_id) DO NOTHING;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT id INTO incident FROM connection_incidents
    WHERE vendor_id=route.vendor_id AND model_alias=route.model_alias
      AND cause='repeated_upstream_failures' AND resolved_at IS NULL FOR UPDATE;
    IF incident IS NOT NULL THEN
        INSERT INTO connection_incident_observations(attempt_id,incident_id,vendor_revision,model_revision,observed_at)
        SELECT attempt_id,incident,vendor_revision,model_revision,observed_at
        FROM connection_incident_signals WHERE attempt_id=p_attempt ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS inserted = ROW_COUNT;
        IF inserted > 0 THEN
            UPDATE connection_incidents SET last_observed_at=clock_timestamp(),observations=observations+1 WHERE id=incident;
        END IF;
        RETURN;
    END IF;
    SELECT GREATEST(clock_timestamp()-interval '5 minutes',COALESCE(max(resolved_at),'-infinity'::timestamptz)) INTO since_time
    FROM connection_incidents WHERE vendor_id=route.vendor_id AND model_alias=route.model_alias AND cause='repeated_upstream_failures';
    SELECT count(*) INTO total FROM connection_incident_signals
    WHERE vendor_id=route.vendor_id AND model_alias=route.model_alias
      AND vendor_revision=route.vendor_revision AND model_revision=route.model_revision AND observed_at>since_time;
    IF total < 3 THEN RETURN; END IF;
    INSERT INTO connection_incidents(vendor_id,model_alias,cause,first_observed_at,last_observed_at,observations)
    SELECT route.vendor_id,route.model_alias,'repeated_upstream_failures',min(observed_at),max(observed_at),count(*)
    FROM connection_incident_signals WHERE vendor_id=route.vendor_id AND model_alias=route.model_alias
      AND vendor_revision=route.vendor_revision AND model_revision=route.model_revision AND observed_at>since_time
    RETURNING id INTO incident;
    INSERT INTO connection_incident_observations(attempt_id,incident_id,vendor_revision,model_revision,observed_at)
    SELECT attempt_id,incident,vendor_revision,model_revision,observed_at FROM connection_incident_signals
    WHERE vendor_id=route.vendor_id AND model_alias=route.model_alias
      AND vendor_revision=route.vendor_revision AND model_revision=route.model_revision AND observed_at>since_time
    ON CONFLICT DO NOTHING;
END;
$$;
