-- End eligibility without rewriting a published selling card or pinned job price.
CREATE TABLE customer_media_rate_retirements (
    organization_id UUID NOT NULL,
    revision TEXT NOT NULL,
    effective_until BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id,revision),
    FOREIGN KEY (organization_id,revision)
        REFERENCES customer_media_rate_cards(organization_id,revision)
);
CREATE FUNCTION validate_customer_media_rate_retirement() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE starts BIGINT; ends BIGINT;
BEGIN
    SELECT effective_from,effective_until INTO starts,ends
    FROM customer_media_rate_cards
    WHERE organization_id=NEW.organization_id AND revision=NEW.revision;
    IF NOT FOUND OR NEW.effective_until<starts
        OR (ends IS NOT NULL AND NEW.effective_until>ends) THEN
        RAISE EXCEPTION 'invalid media rate retirement' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER valid_customer_media_rate_retirement
    BEFORE INSERT ON customer_media_rate_retirements
    FOR EACH ROW EXECUTE FUNCTION validate_customer_media_rate_retirement();
CREATE TRIGGER immutable_customer_media_rate_retirements
    BEFORE UPDATE OR DELETE ON customer_media_rate_retirements
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
