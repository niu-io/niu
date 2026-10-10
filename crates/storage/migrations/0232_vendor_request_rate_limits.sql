-- One durable rolling window per saved upstream credential, independent of customer keys.
CREATE TABLE vendor_request_rate_limits (
    vendor_id UUID PRIMARY KEY REFERENCES vendors(id),
    requests_per_minute BIGINT CHECK(requests_per_minute BETWEEN 0 AND 1000000),
    revision BIGINT NOT NULL DEFAULT 0 CHECK(revision >= 0)
);
INSERT INTO vendor_request_rate_limits(vendor_id) SELECT id FROM vendors;
CREATE FUNCTION initialize_vendor_request_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO vendor_request_rate_limits(vendor_id) VALUES(NEW.id);
    RETURN NEW;
END;
$$;
CREATE TRIGGER initialize_vendor_request_rate AFTER INSERT ON vendors
    FOR EACH ROW EXECUTE FUNCTION initialize_vendor_request_rate();
CREATE TABLE vendor_request_rate_history (
    vendor_id UUID NOT NULL REFERENCES vendor_request_rate_limits(vendor_id),
    revision BIGINT NOT NULL CHECK(revision > 0),
    requests_per_minute BIGINT CHECK(requests_per_minute BETWEEN 0 AND 1000000),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    actor_operator_id UUID REFERENCES admin_operators(id),
    actor_name TEXT NOT NULL,
    PRIMARY KEY(vendor_id,revision)
);
CREATE TRIGGER immutable_vendor_request_rate_history BEFORE UPDATE OR DELETE ON vendor_request_rate_history
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE vendor_request_rate_admissions (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    vendor_id UUID NOT NULL REFERENCES vendor_request_rate_limits(vendor_id),
    admitted_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX vendor_request_rate_admissions_window ON vendor_request_rate_admissions(vendor_id,admitted_at);
-- Preserve already dispatched mapped requests in the current window on upgrade.
INSERT INTO vendor_request_rate_admissions(attempt_id,vendor_id,admitted_at)
SELECT b.attempt_id,b.vendor_id,a.dispatched_at FROM (
    SELECT attempt_id,vendor_id FROM managed_attempt_routes
    UNION SELECT attempt_id,vendor_id FROM personal_attempt_routes
    UNION SELECT attempt_id,vendor_id FROM media_recovery_routes
) b JOIN attempts a ON a.id=b.attempt_id
WHERE a.dispatched_at > clock_timestamp()-INTERVAL '60 seconds';

CREATE FUNCTION niu_enforce_vendor_request_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
CREATE TRIGGER enforce_vendor_request_rate AFTER INSERT OR UPDATE OF dispatched_at ON attempts
    FOR EACH ROW EXECUTE FUNCTION niu_enforce_vendor_request_rate();
