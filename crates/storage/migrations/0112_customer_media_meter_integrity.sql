-- Strengthen previously applied customer media snapshots without rewriting history.
ALTER TABLE customer_media_attempt_pricing
    ADD CONSTRAINT customer_media_snapshot_version_present CHECK (snapshot ? 'version');

-- Serializes both billing modes on the same attempt. An operation cannot acquire
-- independent text and media charges, including concurrent competing inserts.
CREATE FUNCTION enforce_customer_meter_exclusivity() RETURNS TRIGGER AS $$
BEGIN
    PERFORM id FROM attempts WHERE id = NEW.attempt_id FOR UPDATE;
    IF TG_TABLE_NAME = 'customer_media_attempt_pricing' THEN
        IF EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=NEW.attempt_id) THEN
            RAISE EXCEPTION 'customer text tariff already bound' USING ERRCODE='23514';
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM customer_media_attempt_pricing WHERE attempt_id=NEW.attempt_id) THEN
            RAISE EXCEPTION 'customer media tariff already bound' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER exclusive_customer_media_meter BEFORE INSERT ON customer_media_attempt_pricing
    FOR EACH ROW EXECUTE FUNCTION enforce_customer_meter_exclusivity();
CREATE TRIGGER exclusive_customer_text_meter BEFORE INSERT ON customer_attempt_tariffs
    FOR EACH ROW EXECUTE FUNCTION enforce_customer_meter_exclusivity();
