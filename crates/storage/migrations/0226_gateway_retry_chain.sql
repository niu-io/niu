-- Opted-in gateway operations pin a bounded, versioned retry policy. Existing
-- operations do not acquire retry permission from this migration.
CREATE TABLE gateway_retry_policies (
    operation_id UUID PRIMARY KEY REFERENCES operations(id),
    key_id UUID NOT NULL REFERENCES api_keys(id),
    policy_revision TEXT NOT NULL CHECK (policy_revision='openrouter-chat-auth-rejection-v1'),
    maximum_attempts SMALLINT NOT NULL CHECK (maximum_attempts=2),
    deadline TIMESTAMPTZ NOT NULL
);
ALTER TABLE attempts ADD UNIQUE(id,operation_id);
CREATE TABLE gateway_retry_attempts (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    operation_id UUID NOT NULL REFERENCES gateway_retry_policies(operation_id),
    ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 2),
    predecessor_id UUID UNIQUE REFERENCES attempts(id),
    UNIQUE(operation_id,ordinal),
    UNIQUE(attempt_id,operation_id),
    FOREIGN KEY(attempt_id,operation_id) REFERENCES attempts(id,operation_id),
    FOREIGN KEY(predecessor_id,operation_id) REFERENCES gateway_retry_attempts(attempt_id,operation_id),
    CHECK ((ordinal=1 AND predecessor_id IS NULL) OR (ordinal=2 AND predecessor_id IS NOT NULL))
);
CREATE TRIGGER immutable_gateway_retry_policy BEFORE UPDATE OR DELETE ON gateway_retry_policies
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_gateway_retry_attempt BEFORE UPDATE OR DELETE ON gateway_retry_attempts
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- Recheck the persisted overall deadline at dispatch, including the gap after
-- personal preparation commits. An expired preparation cannot authorize a send.
CREATE FUNCTION require_gateway_retry_deadline() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution='may_have_executed' AND OLD.execution='not_sent' AND EXISTS (
        SELECT 1 FROM gateway_retry_policies p
        WHERE p.operation_id=NEW.operation_id AND p.deadline<=clock_timestamp()
    ) THEN
        RAISE EXCEPTION 'Gateway operation deadline expired' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER require_gateway_retry_deadline BEFORE UPDATE ON attempts
FOR EACH ROW EXECUTE FUNCTION require_gateway_retry_deadline();
