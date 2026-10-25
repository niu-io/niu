-- Immutable range accounting, independent of monetary wallet entries. Request
-- pricing/admission must call this ledger inside its own atomic transaction.
CREATE TABLE customer_unit_reservations (
    attempt_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES customer_unit_accounts(organization_id),
    project_id UUID NOT NULL,
    definition_revision BIGINT NOT NULL REFERENCES customer_unit_definitions(revision),
    maximum_atoms BIGINT NOT NULL CHECK (maximum_atoms >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (organization_id, attempt_id),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES attempts(organization_id, project_id, id)
);
CREATE TABLE customer_unit_reserved_ranges (
    attempt_id UUID NOT NULL,
    organization_id UUID NOT NULL,
    ordinal BIGINT NOT NULL CHECK (ordinal >= 0),
    lot_id UUID NOT NULL,
    first_atom BIGINT NOT NULL CHECK (first_atom >= 0),
    end_atom BIGINT NOT NULL CHECK (end_atom > first_atom),
    PRIMARY KEY (attempt_id, ordinal),
    FOREIGN KEY (organization_id, attempt_id)
        REFERENCES customer_unit_reservations(organization_id, attempt_id),
    FOREIGN KEY (organization_id, lot_id) REFERENCES customer_unit_lots(organization_id, id)
);
CREATE INDEX customer_unit_reserved_lot ON customer_unit_reserved_ranges(lot_id);
CREATE TABLE customer_unit_resolutions (
    attempt_id UUID PRIMARY KEY REFERENCES customer_unit_reservations(attempt_id),
    kind TEXT NOT NULL CHECK (kind IN ('charge', 'release')),
    charged_atoms BIGINT NOT NULL CHECK (charged_atoms >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK (kind='charge' OR charged_atoms=0)
);
CREATE TABLE customer_unit_restorations (
    id UUID PRIMARY KEY,
    attempt_id UUID NOT NULL REFERENCES customer_unit_resolutions(attempt_id),
    idempotency_key UUID NOT NULL,
    first_atom BIGINT NOT NULL CHECK (first_atom >= 0),
    end_atom BIGINT NOT NULL CHECK (end_atom > first_atom),
    reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500
        AND reason=btrim(reason) AND reason !~ '[[:cntrl:]]'),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (attempt_id, idempotency_key),
    CHECK ((actor_kind='operator')=(actor_operator_id IS NOT NULL))
);

-- Charge positions follow allocation order, rather than current purchase rules.
-- A restoration removes an original charge interval; it never extends lot expiry.
CREATE VIEW customer_unit_range_positions AS
SELECT r.*, COALESCE(sum(end_atom-first_atom) OVER (
    PARTITION BY attempt_id ORDER BY ordinal ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
),0)::bigint AS charge_offset
FROM customer_unit_reserved_ranges r;

CREATE VIEW customer_unit_consumed_ranges AS
SELECT p.attempt_id,p.organization_id,p.ordinal,p.lot_id,p.first_atom,
    (p.first_atom+LEAST(p.end_atom-p.first_atom,c.charged_atoms-p.charge_offset)) AS end_atom,
    p.charge_offset
FROM customer_unit_range_positions p
JOIN customer_unit_resolutions c USING (attempt_id)
WHERE c.kind='charge' AND c.charged_atoms>p.charge_offset;

CREATE VIEW customer_unit_occupied_ranges AS
SELECT r.organization_id,r.attempt_id,r.lot_id,int8range(r.first_atom,r.end_atom,'[)') AS atoms
FROM customer_unit_reserved_ranges r
WHERE NOT EXISTS (SELECT 1 FROM customer_unit_resolutions c WHERE c.attempt_id=r.attempt_id)
UNION ALL
SELECT c.organization_id,c.attempt_id,c.lot_id,remaining.atoms
FROM customer_unit_consumed_ranges c
CROSS JOIN LATERAL unnest(
    int8multirange(int8range(c.first_atom,c.end_atom,'[)')) - COALESCE((
        SELECT range_agg(int8range(
            c.first_atom+GREATEST(0,r.first_atom-c.charge_offset),
            c.first_atom+LEAST(c.end_atom-c.first_atom,r.end_atom-c.charge_offset),'[)'))
        FROM customer_unit_restorations r
        WHERE r.attempt_id=c.attempt_id
          AND r.first_atom<c.charge_offset+(c.end_atom-c.first_atom)
          AND r.end_atom>c.charge_offset
    ),'{}'::int8multirange)
) AS remaining(atoms);

CREATE FUNCTION validate_customer_unit_range() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE lot customer_unit_lots;
BEGIN
    PERFORM organization_id FROM customer_unit_accounts
        WHERE organization_id=NEW.organization_id FOR NO KEY UPDATE;
    SELECT * INTO STRICT lot FROM customer_unit_lots
        WHERE organization_id=NEW.organization_id AND id=NEW.lot_id;
    IF NEW.end_atom>lot.credit_atoms OR (lot.expires_at IS NOT NULL AND lot.expires_at<=clock_timestamp())
       OR EXISTS (SELECT 1 FROM customer_unit_resolutions WHERE attempt_id=NEW.attempt_id)
       OR EXISTS (SELECT 1 FROM customer_unit_occupied_ranges o WHERE o.lot_id=NEW.lot_id
            AND o.atoms && int8range(NEW.first_atom,NEW.end_atom,'[)')) THEN
        RAISE EXCEPTION 'Credits range is expired, unavailable or already resolved' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_range BEFORE INSERT ON customer_unit_reserved_ranges
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_range();

CREATE FUNCTION validate_customer_unit_reservation_total() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (SELECT COALESCE(sum(end_atom-first_atom),0) FROM customer_unit_reserved_ranges
        WHERE attempt_id=NEW.attempt_id) <>
       (SELECT maximum_atoms FROM customer_unit_reservations WHERE attempt_id=NEW.attempt_id) THEN
        RAISE EXCEPTION 'Credits reservation must be fully backed by disjoint ranges' USING ERRCODE='23514';
    END IF;
    RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER customer_unit_reservation_total AFTER INSERT ON customer_unit_reservations
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_reservation_total();
CREATE CONSTRAINT TRIGGER customer_unit_range_total AFTER INSERT ON customer_unit_reserved_ranges
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_reservation_total();

CREATE FUNCTION validate_customer_unit_resolution() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE maximum BIGINT;
BEGIN
    PERFORM a.organization_id FROM customer_unit_accounts a JOIN customer_unit_reservations r
        ON r.organization_id=a.organization_id WHERE r.attempt_id=NEW.attempt_id FOR NO KEY UPDATE OF a;
    SELECT maximum_atoms INTO STRICT maximum FROM customer_unit_reservations WHERE attempt_id=NEW.attempt_id;
    IF NEW.charged_atoms>maximum THEN
        RAISE EXCEPTION 'Credits charge exceeds reserved capacity; retain the unresolved hold' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_resolution BEFORE INSERT ON customer_unit_resolutions
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_resolution();

CREATE FUNCTION validate_customer_unit_restoration() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE charged BIGINT; restored BIGINT;
BEGIN
    PERFORM a.organization_id FROM customer_unit_accounts a JOIN customer_unit_reservations r
        ON r.organization_id=a.organization_id WHERE r.attempt_id=NEW.attempt_id FOR NO KEY UPDATE OF a;
    SELECT charged_atoms INTO STRICT charged FROM customer_unit_resolutions
        WHERE attempt_id=NEW.attempt_id AND kind='charge';
    SELECT COALESCE(max(end_atom),0) INTO restored FROM customer_unit_restorations
        WHERE attempt_id=NEW.attempt_id;
    IF NEW.first_atom<>restored OR NEW.end_atom>charged THEN
        RAISE EXCEPTION 'Credits restoration must restore original, not previously restored charge positions'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_restoration BEFORE INSERT ON customer_unit_restorations
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_restoration();

CREATE TRIGGER immutable_customer_unit_reservation BEFORE UPDATE OR DELETE ON customer_unit_reservations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_unit_reserved_range BEFORE UPDATE OR DELETE ON customer_unit_reserved_ranges
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_unit_resolution BEFORE UPDATE OR DELETE ON customer_unit_resolutions
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_customer_unit_restoration BEFORE UPDATE OR DELETE ON customer_unit_restorations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
