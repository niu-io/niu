-- Serialize recovery against changes to the effective connection and mapping.
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
      AND NOT EXISTS(SELECT 1 FROM request_failures f WHERE f.attempt_id=a.id)
    FOR SHARE OF v,m;
    IF success.dispatched_at IS NULL THEN RETURN; END IF;
    UPDATE connection_incidents i SET resolved_at=clock_timestamp(),recovery_attempt_id=p_attempt
    WHERE i.vendor_id=success.vendor_id AND i.model_alias=success.model_alias
      AND i.resolved_at IS NULL AND i.last_observed_at<success.dispatched_at
      AND NOT EXISTS(SELECT 1 FROM connection_incident_observations o
        WHERE o.incident_id=i.id
          AND (o.vendor_revision>success.vendor_revision OR o.model_revision>success.model_revision));
END;
$$;
