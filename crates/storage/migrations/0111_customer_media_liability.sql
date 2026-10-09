CREATE TABLE customer_media_liability_bounds (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    bound JSONB NOT NULL CHECK (jsonb_typeof(bound)='object' AND octet_length(bound::text)<=4096),
    maximum_nanos BIGINT NOT NULL CHECK (maximum_nanos>0),
    FOREIGN KEY (organization_id,project_id,attempt_id)
        REFERENCES customer_media_attempt_pricing(organization_id,project_id,attempt_id),
    FOREIGN KEY (attempt_id) REFERENCES customer_balance_reservations(attempt_id)
);
CREATE TRIGGER immutable_customer_media_liability BEFORE UPDATE OR DELETE ON customer_media_liability_bounds
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- Owner-funded personal requests cannot acquire customer media liabilities.
CREATE FUNCTION separate_personal_media_accounting() RETURNS TRIGGER AS $$
BEGIN
    PERFORM id FROM attempts WHERE id=NEW.attempt_id FOR UPDATE;
    IF TG_TABLE_NAME='personal_attempt_routes' THEN
        IF EXISTS (SELECT 1 FROM customer_media_attempt_pricing WHERE attempt_id=NEW.attempt_id) THEN
            RAISE EXCEPTION 'personal route conflicts with customer media pricing' USING ERRCODE='23514';
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id=NEW.attempt_id) THEN
            RAISE EXCEPTION 'customer media pricing conflicts with personal route' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER separate_personal_media_pricing BEFORE INSERT ON customer_media_attempt_pricing
    FOR EACH ROW EXECUTE FUNCTION separate_personal_media_accounting();
-- Run after the existing validator has locked credential, model and attempt.
CREATE TRIGGER zz_separate_media_personal_route BEFORE INSERT ON personal_attempt_routes
    FOR EACH ROW EXECUTE FUNCTION separate_personal_media_accounting();
