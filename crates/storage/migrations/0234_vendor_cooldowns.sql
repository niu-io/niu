-- Only new, independently qualified nonexecution observations count. No backfill.
CREATE TABLE vendor_cooldowns (
    vendor_id UUID PRIMARY KEY REFERENCES vendors(id),
    cooldown_until TIMESTAMPTZ
);
CREATE TABLE vendor_cooldown_failures (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    vendor_id UUID NOT NULL REFERENCES vendor_cooldowns(vendor_id),
    recorded_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX vendor_cooldown_failures_window ON vendor_cooldown_failures(vendor_id,recorded_at);

-- Versioned fixed policy: three qualified authentication refusals within sixty
-- seconds pause new selection for sixty seconds. Unknown execution never counts.
CREATE FUNCTION niu_record_vendor_safe_failure(failed_attempt UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE credential UUID; observed TIMESTAMPTZ;
BEGIN
    SELECT r.vendor_id INTO credential FROM managed_attempt_routes r
      JOIN attempts a ON a.id=r.attempt_id JOIN request_failures f ON f.attempt_id=a.id
      WHERE a.id=failed_attempt AND a.execution='confirmed_not_executed'
        AND a.dispatched_at IS NOT NULL AND a.usage_confidence='unknown'
        AND r.nonexecution_policy='openrouter-text-auth-rejection-v1'
        AND f.kind='upstream_http_error' AND f.upstream_http_status=401
        AND NOT EXISTS(SELECT 1 FROM media_recovery_routes m WHERE m.attempt_id=a.id);
    IF credential IS NULL THEN RETURN; END IF;
    INSERT INTO vendor_cooldowns(vendor_id) VALUES(credential) ON CONFLICT DO NOTHING;
    PERFORM vendor_id FROM vendor_cooldowns WHERE vendor_id=credential FOR UPDATE;
    observed := clock_timestamp();
    DELETE FROM vendor_cooldown_failures WHERE vendor_id=credential
      AND recorded_at<=observed-INTERVAL '60 seconds';
    INSERT INTO vendor_cooldown_failures(attempt_id,vendor_id,recorded_at)
      VALUES(failed_attempt,credential,observed) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN; END IF;
    IF (SELECT count(*) FROM vendor_cooldown_failures WHERE vendor_id=credential
          AND recorded_at>observed-INTERVAL '60 seconds')>=3 THEN
        UPDATE vendor_cooldowns SET cooldown_until=GREATEST(cooldown_until,observed+INTERVAL '60 seconds')
          WHERE vendor_id=credential;
    END IF;
END;
$$;
