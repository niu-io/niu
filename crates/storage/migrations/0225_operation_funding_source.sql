-- Pin funding independently of candidate selection. Retrying a customer-priced
-- operation must never consume an owner's personal credential, or vice versa.
-- Unpriced shared operations are not covered and remain ineligible for failover.
CREATE TABLE operation_funding_sources (
    operation_id UUID PRIMARY KEY REFERENCES operations(id),
    funding_source TEXT NOT NULL CHECK (funding_source IN ('personal', 'customer'))
);

-- Exact historical backfill: mixed funding within an operation aborts migration
-- via the primary key instead of silently choosing or rewriting either source.
INSERT INTO operation_funding_sources(operation_id, funding_source)
SELECT DISTINCT a.operation_id, 'personal'
FROM personal_attempt_routes p JOIN attempts a ON a.id=p.attempt_id
UNION
SELECT DISTINCT a.operation_id, 'customer'
FROM customer_attempt_tariffs t JOIN attempts a ON a.id=t.attempt_id;

CREATE TRIGGER immutable_operation_funding_source
BEFORE UPDATE OR DELETE ON operation_funding_sources
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION bind_operation_funding_source() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    operation UUID;
    source TEXT := TG_ARGV[0];
    pinned TEXT;
BEGIN
    SELECT o.id INTO STRICT operation
    FROM operations o JOIN attempts a ON a.operation_id=o.id
    WHERE a.id=NEW.attempt_id
    FOR UPDATE OF o;

    INSERT INTO operation_funding_sources(operation_id, funding_source)
    VALUES(operation, source)
    ON CONFLICT(operation_id) DO NOTHING;

    SELECT funding_source INTO STRICT pinned
    FROM operation_funding_sources WHERE operation_id=operation;
    IF pinned <> source THEN
        RAISE EXCEPTION 'Operation funding source cannot change' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER bind_personal_operation_funding
BEFORE INSERT ON personal_attempt_routes
FOR EACH ROW EXECUTE FUNCTION bind_operation_funding_source('personal');

CREATE TRIGGER bind_customer_operation_funding
BEFORE INSERT ON customer_attempt_tariffs
FOR EACH ROW EXECUTE FUNCTION bind_operation_funding_source('customer');
