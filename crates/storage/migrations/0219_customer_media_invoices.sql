-- A common read boundary over independent immutable retail ledgers.
CREATE VIEW customer_invoice_charge_sources AS
SELECT organization_id, project_id, attempt_id, currency, amount_nanos
FROM customer_charges
UNION ALL
SELECT organization_id, project_id, attempt_id, currency, amount_nanos
FROM customer_media_charges;

-- Preserve historical entries. New entries may reference either customer meter;
-- the scoped attempt FK and source check replace the text-only charge FK.
DO $$
DECLARE old_constraint TEXT;
BEGIN
    SELECT conname INTO STRICT old_constraint FROM pg_constraint
        WHERE conrelid='customer_invoice_entries'::regclass
        AND confrelid='customer_charges'::regclass AND contype='f';
    EXECUTE format('ALTER TABLE customer_invoice_entries DROP CONSTRAINT %I',old_constraint);
END;
$$;
ALTER TABLE customer_invoice_entries ADD FOREIGN KEY (organization_id,project_id,attempt_id)
    REFERENCES attempts(organization_id,project_id,id);

CREATE FUNCTION validate_customer_invoice_charge_source() RETURNS TRIGGER AS $$
DECLARE sources BIGINT;
BEGIN
    SELECT count(*) INTO sources
    FROM customer_invoice_charge_sources c
    JOIN customer_invoices i ON i.id=NEW.invoice_id
        AND i.organization_id=c.organization_id AND i.project_id=c.project_id
        AND i.currency=c.currency
    JOIN attempts a ON a.id=c.attempt_id
    WHERE c.organization_id=NEW.organization_id AND c.project_id=NEW.project_id
        AND c.attempt_id=NEW.attempt_id
        AND a.dispatched_at>=to_timestamp(i.from_ms::double precision/1000)
        AND a.dispatched_at<to_timestamp(i.to_ms::double precision/1000);
    IF sources <> 1 THEN
        RAISE EXCEPTION 'invoice entry requires one scoped charge within its currency and period'
            USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER validate_customer_invoice_charge_source BEFORE INSERT ON customer_invoice_entries
    FOR EACH ROW EXECUTE FUNCTION validate_customer_invoice_charge_source();
