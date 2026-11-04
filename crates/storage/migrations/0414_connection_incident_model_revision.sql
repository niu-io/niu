-- Bind connection incident observations and positive recovery to both the
-- connection revision and the effective vendor_models mapping revision.
ALTER TABLE connection_incident_observations
    ADD COLUMN model_revision BIGINT;

UPDATE connection_incident_observations o
SET model_revision = COALESCE(
    (SELECT r.model_revision FROM managed_attempt_routes r WHERE r.attempt_id = o.attempt_id),
    1
);

ALTER TABLE connection_incident_observations
    ALTER COLUMN model_revision SET NOT NULL,
    ADD CONSTRAINT connection_incident_observations_model_revision_check CHECK (model_revision > 0);

CREATE OR REPLACE FUNCTION niu_record_connection_incident(p_attempt UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE route RECORD; observed TIMESTAMPTZ; incident BIGINT;
BEGIN
    -- Serialize repeated evidence for the same attempt, including explicit replay.
    PERFORM id FROM attempts WHERE id=p_attempt FOR UPDATE;
    IF EXISTS(SELECT 1 FROM connection_incident_observations WHERE attempt_id=p_attempt) THEN RETURN; END IF;
    SELECT r.vendor_id,r.model_alias,r.vendor_revision,r.model_revision,
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
    INSERT INTO connection_incident_observations(attempt_id,incident_id,vendor_revision,model_revision,observed_at)
    VALUES(p_attempt,incident,route.vendor_revision,route.model_revision,observed);
END;
$$;

CREATE OR REPLACE FUNCTION niu_resolve_connection_incidents(p_attempt UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE success RECORD;
BEGIN
    SELECT r.vendor_id,r.model_alias,r.vendor_revision,r.model_revision,a.dispatched_at INTO success
    FROM attempts a JOIN managed_attempt_routes r ON r.attempt_id=a.id
    JOIN vendors v ON v.id=r.vendor_id AND v.revision=r.vendor_revision AND v.enabled
    JOIN vendor_models m ON m.alias=r.model_alias AND m.vendor_id=r.vendor_id AND m.revision=r.model_revision AND m.enabled
    JOIN request_timings t ON t.attempt_id=a.id
    WHERE a.id=p_attempt AND a.execution='confirmed_completed'
      AND t.complete AND t.http_status BETWEEN 200 AND 299
      AND NOT EXISTS(SELECT 1 FROM request_failures f WHERE f.attempt_id=a.id);
    IF success.dispatched_at IS NULL THEN RETURN; END IF;
    UPDATE connection_incidents i SET resolved_at=clock_timestamp(),recovery_attempt_id=p_attempt
    WHERE i.vendor_id=success.vendor_id AND i.model_alias=success.model_alias
      AND i.resolved_at IS NULL AND i.last_observed_at<success.dispatched_at
      AND NOT EXISTS(SELECT 1 FROM connection_incident_observations o
        WHERE o.incident_id=i.id
          AND (o.vendor_revision>success.vendor_revision OR o.model_revision>success.model_revision));
END;
$$;
