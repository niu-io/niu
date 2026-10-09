-- Rolling-window dispatch admission shared across gateway instances and key rotations.
CREATE TABLE key_request_rate_limits (
    organization_id UUID NOT NULL, project_id UUID NOT NULL, spending_root_id UUID NOT NULL,
    requests_per_minute BIGINT CHECK(requests_per_minute BETWEEN 0 AND 1000000),
    revision BIGINT NOT NULL CHECK(revision > 0),
    UNIQUE(spending_root_id),
    PRIMARY KEY(organization_id,project_id,spending_root_id),
    FOREIGN KEY(organization_id,project_id,spending_root_id) REFERENCES api_keys(organization_id,project_id,id)
);
CREATE TABLE key_request_rate_history (
    organization_id UUID NOT NULL, project_id UUID NOT NULL, spending_root_id UUID NOT NULL,
    revision BIGINT NOT NULL, requests_per_minute BIGINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('installation','member')),
    actor_name TEXT NOT NULL, actor_operator_id UUID REFERENCES admin_operators(id),
    PRIMARY KEY(organization_id,project_id,spending_root_id,revision),
    FOREIGN KEY(organization_id,project_id,spending_root_id) REFERENCES key_request_rate_limits(organization_id,project_id,spending_root_id),
    CHECK((actor_kind='installation' AND actor_operator_id IS NULL) OR (actor_kind='member' AND actor_operator_id IS NOT NULL))
);
CREATE TRIGGER immutable_key_request_rate_history BEFORE UPDATE OR DELETE ON key_request_rate_history
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TABLE key_request_rate_admissions (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    spending_root_id UUID NOT NULL REFERENCES api_keys(id),
    admitted_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX key_request_rate_admissions_window ON key_request_rate_admissions(spending_root_id,admitted_at);
CREATE FUNCTION niu_enforce_key_request_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
CREATE TRIGGER enforce_key_request_rate AFTER INSERT OR UPDATE OF dispatched_at ON attempts
    FOR EACH ROW EXECUTE FUNCTION niu_enforce_key_request_rate();
