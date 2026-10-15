-- Avoid exclusive row locks and admission-table WAL churn when a credential has
-- no request-per-minute limit configured. Concurrent unlimited dispatches take
-- only a shared lock on vendor_request_rate_limits (which still serializes with
-- policy edits), while set_vendor_request_rate_policy backfills the rolling
-- 60-second window from dispatched attempts when enabling a limit.
CREATE OR REPLACE FUNCTION niu_enforce_vendor_request_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    credential UUID;
    credentials UUID[];
    rpm BIGINT;
    checked_at TIMESTAMPTZ;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN
        RETURN NEW;
    END IF;
    -- The immutable attempt bindings identify the actual credential, never the current alias.
    SELECT array_agg(vendor_id) INTO credentials FROM (
        SELECT vendor_id FROM managed_attempt_routes WHERE attempt_id=NEW.id
        UNION SELECT vendor_id FROM personal_attempt_routes WHERE attempt_id=NEW.id
        UNION SELECT vendor_id FROM media_recovery_routes WHERE attempt_id=NEW.id
    ) bound;
    IF cardinality(credentials) > 1 THEN
        RAISE EXCEPTION 'Conflicting credential bindings' USING ERRCODE='P0024';
    END IF;
    credential := credentials[1];
    IF credential IS NULL THEN RETURN NEW; END IF;
    PERFORM 1 FROM vendor_request_rate_limits
        WHERE vendor_id=credential AND requests_per_minute IS NULL FOR SHARE;
    IF FOUND THEN
        RETURN NEW;
    END IF;
    -- Serialize policy edits and admissions without upgrading vendor SHARE locks.
    SELECT requests_per_minute INTO rpm FROM vendor_request_rate_limits
        WHERE vendor_id=credential FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credential rate policy missing' USING ERRCODE='P0024'; END IF;
    IF rpm IS NULL THEN
        RETURN NEW;
    END IF;
    IF rpm = 0 THEN
        RAISE EXCEPTION 'Upstream credential request rate is disabled' USING ERRCODE='P0027';
    END IF;
    checked_at := clock_timestamp();
    DELETE FROM vendor_request_rate_admissions WHERE vendor_id=credential
        AND admitted_at <= checked_at - INTERVAL '60 seconds';
    IF (SELECT count(*) FROM vendor_request_rate_admissions
        WHERE vendor_id=credential AND admitted_at > checked_at - INTERVAL '60 seconds') >= rpm THEN
        RAISE EXCEPTION 'Upstream credential request rate exhausted' USING ERRCODE='P0025';
    END IF;
    INSERT INTO vendor_request_rate_admissions(attempt_id,vendor_id,admitted_at)
        VALUES(NEW.id,credential,checked_at);
    RETURN NEW;
END;
$$;
