CREATE TABLE customer_unit_operation_tariffs (
    operation_id UUID PRIMARY KEY REFERENCES operations(id),
    revision BIGINT NOT NULL REFERENCES customer_unit_text_tariffs(revision),
    UNIQUE (operation_id,revision)
);
CREATE TABLE customer_unit_attempt_tariffs (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    operation_id UUID NOT NULL,
    revision BIGINT NOT NULL,
    UNIQUE (attempt_id,revision),
    FOREIGN KEY (operation_id,revision) REFERENCES customer_unit_operation_tariffs(operation_id,revision)
);
CREATE FUNCTION validate_customer_unit_tariff_binding() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM operations o JOIN customer_unit_text_tariffs p
        ON p.model_alias=o.model_alias WHERE o.id=NEW.operation_id AND p.revision=NEW.revision)
        OR (TG_TABLE_NAME='customer_unit_attempt_tariffs' AND NOT EXISTS (
            SELECT 1 FROM attempts a WHERE a.id=(to_jsonb(NEW)->>'attempt_id')::uuid
                AND a.operation_id=NEW.operation_id AND a.execution='not_sent'
                AND NOT EXISTS(SELECT 1 FROM customer_attempt_tariffs m WHERE m.attempt_id=a.id)
        )) THEN
        RAISE EXCEPTION 'Credits tariff must match the original operation and unsent attempt'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_operation_tariff BEFORE INSERT ON customer_unit_operation_tariffs
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_tariff_binding();
CREATE TRIGGER validate_customer_unit_attempt_tariff BEFORE INSERT ON customer_unit_attempt_tariffs
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_tariff_binding();
CREATE TRIGGER immutable_customer_unit_operation_tariff BEFORE UPDATE OR DELETE ON customer_unit_operation_tariffs
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_unit_attempt_tariff BEFORE UPDATE OR DELETE ON customer_unit_attempt_tariffs
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- A known liability is preserved even if additional capacity is not available.
CREATE TABLE customer_unit_text_charges (
    attempt_id UUID PRIMARY KEY,
    revision BIGINT NOT NULL,
    charged_atoms BIGINT NOT NULL CHECK (charged_atoms>=0),
    usage JSONB NOT NULL CHECK (jsonb_typeof(usage)='object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (attempt_id,revision) REFERENCES customer_unit_attempt_tariffs(attempt_id,revision)
);
CREATE TRIGGER immutable_customer_unit_text_charge BEFORE UPDATE OR DELETE ON customer_unit_text_charges
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE TABLE customer_unit_reservation_extensions (
    attempt_id UUID PRIMARY KEY REFERENCES customer_unit_reservations(attempt_id),
    additional_atoms BIGINT NOT NULL CHECK (additional_atoms>0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION validate_customer_unit_extension() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM a.organization_id FROM customer_unit_accounts a JOIN customer_unit_reservations r
        ON r.organization_id=a.organization_id WHERE r.attempt_id=NEW.attempt_id FOR NO KEY UPDATE OF a;
    IF NOT EXISTS (SELECT 1 FROM customer_unit_reservations r JOIN customer_unit_text_charges c USING(attempt_id)
        WHERE r.attempt_id=NEW.attempt_id AND c.charged_atoms-r.maximum_atoms=NEW.additional_atoms)
        OR EXISTS(SELECT 1 FROM customer_unit_resolutions WHERE attempt_id=NEW.attempt_id) THEN
        RAISE EXCEPTION 'Additional Credits capacity must match the unresolved original liability' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_extension BEFORE INSERT ON customer_unit_reservation_extensions
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_extension();
CREATE TRIGGER immutable_customer_unit_extension BEFORE UPDATE OR DELETE ON customer_unit_reservation_extensions
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE OR REPLACE FUNCTION validate_customer_unit_reservation_total() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT COALESCE(sum(end_atom-first_atom),0) FROM customer_unit_reserved_ranges WHERE attempt_id=NEW.attempt_id)
        <> (SELECT r.maximum_atoms::numeric+COALESCE(e.additional_atoms,0) FROM customer_unit_reservations r
            LEFT JOIN customer_unit_reservation_extensions e USING(attempt_id) WHERE r.attempt_id=NEW.attempt_id) THEN
        RAISE EXCEPTION 'Credits reservation must be fully backed by disjoint ranges' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER customer_unit_extension_total AFTER INSERT ON customer_unit_reservation_extensions
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_reservation_total();

CREATE OR REPLACE FUNCTION validate_customer_unit_resolution() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE maximum NUMERIC;
BEGIN
    PERFORM a.organization_id FROM customer_unit_accounts a JOIN customer_unit_reservations r
        ON r.organization_id=a.organization_id WHERE r.attempt_id=NEW.attempt_id FOR NO KEY UPDATE OF a;
    SELECT r.maximum_atoms::numeric+COALESCE(e.additional_atoms,0) INTO STRICT maximum
        FROM customer_unit_reservations r LEFT JOIN customer_unit_reservation_extensions e USING(attempt_id)
        WHERE r.attempt_id=NEW.attempt_id;
    IF NEW.charged_atoms>maximum THEN
        RAISE EXCEPTION 'Credits charge exceeds reserved capacity; retain the unresolved hold' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
