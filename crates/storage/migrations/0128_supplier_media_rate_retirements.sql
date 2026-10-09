-- Old publication times were not recorded; preserve them as unknown.
ALTER TABLE supplier_media_rate_cards ADD COLUMN created_at TIMESTAMPTZ;
ALTER TABLE supplier_media_rate_cards ALTER COLUMN created_at SET DEFAULT now();
CREATE TABLE supplier_media_rate_retirements (
    provider_id UUID NOT NULL,
    revision TEXT NOT NULL,
    effective_until BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(provider_id,revision),
    FOREIGN KEY(provider_id,revision) REFERENCES supplier_media_rate_cards(provider_id,revision)
);
CREATE FUNCTION validate_supplier_media_rate_retirement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE starts BIGINT; ends BIGINT;
BEGIN
    SELECT effective_from,effective_until INTO starts,ends FROM supplier_media_rate_cards
    WHERE provider_id=NEW.provider_id AND revision=NEW.revision;
    IF NOT FOUND OR NEW.effective_until<starts OR (ends IS NOT NULL AND NEW.effective_until>ends) THEN
        RAISE EXCEPTION 'invalid supplier media rate retirement' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER valid_supplier_media_retirement BEFORE INSERT ON supplier_media_rate_retirements
    FOR EACH ROW EXECUTE FUNCTION validate_supplier_media_rate_retirement();
CREATE TRIGGER immutable_supplier_media_retirement BEFORE UPDATE OR DELETE ON supplier_media_rate_retirements
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
