-- Concurrent dispatch admission shared across gateway instances and key rotations.
CREATE TABLE key_concurrency_limits (
    organization_id UUID NOT NULL, project_id UUID NOT NULL, spending_root_id UUID NOT NULL,
    max_concurrent_requests BIGINT CHECK(max_concurrent_requests BETWEEN 0 AND 10000),
    revision BIGINT NOT NULL CHECK(revision > 0),
    UNIQUE(spending_root_id),
    PRIMARY KEY(organization_id,project_id,spending_root_id),
    FOREIGN KEY(organization_id,project_id,spending_root_id) REFERENCES api_keys(organization_id,project_id,id)
);
CREATE TABLE key_concurrency_history (
    organization_id UUID NOT NULL, project_id UUID NOT NULL, spending_root_id UUID NOT NULL,
    revision BIGINT NOT NULL, max_concurrent_requests BIGINT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('installation','member')),
    actor_name TEXT NOT NULL, actor_operator_id UUID REFERENCES admin_operators(id),
    PRIMARY KEY(organization_id,project_id,spending_root_id,revision),
    FOREIGN KEY(organization_id,project_id,spending_root_id) REFERENCES key_concurrency_limits(organization_id,project_id,spending_root_id),
    CHECK((actor_kind='installation' AND actor_operator_id IS NULL) OR (actor_kind='member' AND actor_operator_id IS NOT NULL))
);
CREATE TRIGGER immutable_key_concurrency_history BEFORE UPDATE OR DELETE ON key_concurrency_history
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE INDEX key_concurrency_unresolved_attempts ON attempts(api_key_id)
    WHERE dispatched_at IS NOT NULL AND execution='may_have_executed';
CREATE FUNCTION niu_enforce_key_concurrency() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    root UUID;
    maximum BIGINT;
    running BIGINT;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN RETURN NEW; END IF;
    SELECT spending_root_id INTO root FROM api_keys WHERE id=NEW.api_key_id;
    IF root IS NULL THEN RETURN NEW; END IF;
    SELECT max_concurrent_requests INTO maximum FROM key_concurrency_limits
        WHERE spending_root_id=root FOR UPDATE;
    IF NOT FOUND OR maximum IS NULL THEN RETURN NEW; END IF;
    -- Count durable unresolved dispatches, including work admitted before policy activation.
    -- Terminal evidence releases occupancy; disconnects and elapsed time do not.
    SELECT count(*) INTO running FROM attempts a JOIN api_keys k ON k.id=a.api_key_id
        WHERE k.spending_root_id=root AND a.id<>NEW.id
        AND a.dispatched_at IS NOT NULL AND a.execution='may_have_executed';
    IF running >= maximum THEN
        RAISE EXCEPTION 'API key concurrent request limit reached' USING ERRCODE='P0021';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_key_concurrency AFTER INSERT OR UPDATE OF dispatched_at ON attempts
    FOR EACH ROW EXECUTE FUNCTION niu_enforce_key_concurrency();
