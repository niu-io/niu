-- A customer operation keeps one retail tariff across its future attempts.
-- This does not authorize retries or change any existing charge.
CREATE TABLE customer_operation_tariffs (
    operation_id UUID PRIMARY KEY REFERENCES operations(id),
    revision_id UUID NOT NULL REFERENCES customer_tariff_revisions(id)
);

-- Preserve existing bindings exactly. Conflicting historical revisions abort
-- migration rather than selecting a winner or rewriting financial history.
INSERT INTO customer_operation_tariffs(operation_id, revision_id)
SELECT DISTINCT a.operation_id, t.revision_id
FROM customer_attempt_tariffs t JOIN attempts a ON a.id=t.attempt_id;

CREATE TRIGGER immutable_customer_operation_tariff
BEFORE UPDATE OR DELETE ON customer_operation_tariffs
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION bind_operation_customer_tariff() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    operation UUID;
    pinned UUID;
BEGIN
    SELECT o.id INTO STRICT operation
    FROM operations o JOIN attempts a ON a.operation_id=o.id
    WHERE a.id=NEW.attempt_id
    FOR UPDATE OF o;

    INSERT INTO customer_operation_tariffs(operation_id, revision_id)
    VALUES(operation, NEW.revision_id)
    ON CONFLICT(operation_id) DO NOTHING;

    SELECT revision_id INTO STRICT pinned
    FROM customer_operation_tariffs WHERE operation_id=operation;
    IF pinned <> NEW.revision_id THEN
        RAISE EXCEPTION 'Customer operation tariff cannot change' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER bind_customer_attempt_operation_tariff
BEFORE INSERT ON customer_attempt_tariffs
FOR EACH ROW EXECUTE FUNCTION bind_operation_customer_tariff();
