-- Personal upstream credentials belong to one customer account. This record
-- confers no commercial qualification and does not itself enable inference.
CREATE TABLE personal_vendor_ownership (
    vendor_id UUID PRIMARY KEY REFERENCES vendors(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX personal_vendor_organization ON personal_vendor_ownership(organization_id, vendor_id);

CREATE FUNCTION niu_personal_vendor_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'personal credential ownership is immutable' USING ERRCODE = '23514';
    END IF;
    PERFORM 1 FROM vendors WHERE id = NEW.vendor_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM provider_offers WHERE vendor_id = NEW.vendor_id
               AND (active OR current_qualification_review IS NOT NULL)) THEN
        RAISE EXCEPTION 'commercial supply cannot become personal' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER personal_vendor_owner_guard BEFORE INSERT OR UPDATE OR DELETE ON personal_vendor_ownership
    FOR EACH ROW EXECUTE FUNCTION niu_personal_vendor_owner_guard();

CREATE FUNCTION niu_commercial_offer_personal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.active OR NEW.current_qualification_review IS NOT NULL THEN
        PERFORM 1 FROM vendors WHERE id = NEW.vendor_id FOR UPDATE;
        IF EXISTS (SELECT 1 FROM personal_vendor_ownership WHERE vendor_id = NEW.vendor_id) THEN
            RAISE EXCEPTION 'personal credentials cannot supply commercial offers' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER commercial_offer_personal_guard BEFORE INSERT OR UPDATE ON provider_offers
    FOR EACH ROW EXECUTE FUNCTION niu_commercial_offer_personal_guard();

CREATE FUNCTION niu_offer_review_personal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE credential UUID;
BEGIN
    SELECT vendor_id INTO credential FROM provider_offers WHERE id = NEW.offer_id;
    PERFORM 1 FROM vendors WHERE id = credential FOR UPDATE;
    IF EXISTS (SELECT 1 FROM personal_vendor_ownership WHERE vendor_id = credential) THEN
        RAISE EXCEPTION 'personal credentials cannot receive commercial offer reviews' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER offer_review_personal_guard BEFORE INSERT ON provider_offer_qualification_reviews
    FOR EACH ROW EXECUTE FUNCTION niu_offer_review_personal_guard();
