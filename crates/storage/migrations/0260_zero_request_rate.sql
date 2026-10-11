-- Distinguish a configured dispatch prohibition from a rolling-window denial.
CREATE OR REPLACE FUNCTION niu_enforce_key_request_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    root UUID;
    rpm BIGINT;
    admitted BIGINT;
    checked_at TIMESTAMPTZ;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN
        RETURN NEW;
    END IF;
    SELECT spending_root_id INTO root FROM api_keys WHERE id=NEW.api_key_id;
    IF root IS NULL THEN RETURN NEW; END IF;
    -- Lock the configured policy, not the key row: dispatch already holds key SHARE locks.
    SELECT requests_per_minute INTO rpm FROM key_request_rate_limits
        WHERE spending_root_id=root FOR UPDATE;
    IF NOT FOUND THEN RETURN NEW; END IF;
    IF rpm = 0 THEN
        RAISE EXCEPTION 'API key request rate is disabled' USING ERRCODE='P0026';
    END IF;
    checked_at := clock_timestamp();
    DELETE FROM key_request_rate_admissions WHERE spending_root_id=root AND admitted_at <= checked_at - INTERVAL '60 seconds';
    IF rpm IS NOT NULL THEN
        SELECT count(*) INTO admitted FROM key_request_rate_admissions
            WHERE spending_root_id=root AND admitted_at > checked_at - INTERVAL '60 seconds';
        IF admitted >= rpm THEN
            RAISE EXCEPTION 'API key request rate exhausted' USING ERRCODE='P0020';
        END IF;
    END IF;
    INSERT INTO key_request_rate_admissions(attempt_id,spending_root_id,admitted_at)
        VALUES(NEW.id,root,checked_at);
    RETURN NEW;
END;
$$;

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
    -- Serialize policy edits and admissions without upgrading vendor SHARE locks.
    SELECT requests_per_minute INTO rpm FROM vendor_request_rate_limits
        WHERE vendor_id=credential FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credential rate policy missing' USING ERRCODE='P0024'; END IF;
    IF rpm = 0 THEN
        RAISE EXCEPTION 'Upstream credential request rate is disabled' USING ERRCODE='P0027';
    END IF;
    checked_at := clock_timestamp();
    DELETE FROM vendor_request_rate_admissions WHERE vendor_id=credential
        AND admitted_at <= checked_at - INTERVAL '60 seconds';
    IF rpm IS NOT NULL AND (SELECT count(*) FROM vendor_request_rate_admissions
        WHERE vendor_id=credential AND admitted_at > checked_at - INTERVAL '60 seconds') >= rpm THEN
        RAISE EXCEPTION 'Upstream credential request rate exhausted' USING ERRCODE='P0025';
    END IF;
    -- Count even unlimited dispatches so applying a cap cannot forget the current window.
    INSERT INTO vendor_request_rate_admissions(attempt_id,vendor_id,admitted_at)
        VALUES(NEW.id,credential,checked_at);
    RETURN NEW;
END;
$$;
