-- Preserve applied ownership migration; extend audit actions and safe conflict errors.
ALTER TABLE vendor_audit_events DROP CONSTRAINT vendor_audit_events_action_check;
ALTER TABLE vendor_audit_events ADD CONSTRAINT vendor_audit_events_action_check CHECK (action IN (
    'vendor_created', 'vendor_updated', 'vendor_seeded',
    'vendor_model_created', 'vendor_model_updated', 'vendor_model_seeded',
    'supplier_associated', 'personal_owner_assigned'
));

CREATE OR REPLACE FUNCTION niu_personal_vendor_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'personal credential ownership is immutable' USING ERRCODE = 'P0008';
    END IF;
    PERFORM 1 FROM vendors WHERE id = NEW.vendor_id FOR UPDATE;
    IF EXISTS (SELECT 1 FROM provider_offers WHERE vendor_id = NEW.vendor_id
               AND (active OR current_qualification_review IS NOT NULL)) THEN
        RAISE EXCEPTION 'commercial supply cannot become personal' USING ERRCODE = 'P0008';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION niu_commercial_offer_personal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.active OR NEW.current_qualification_review IS NOT NULL THEN
        PERFORM 1 FROM vendors WHERE id = NEW.vendor_id FOR UPDATE;
        IF EXISTS (SELECT 1 FROM personal_vendor_ownership WHERE vendor_id = NEW.vendor_id) THEN
            RAISE EXCEPTION 'personal credentials cannot supply commercial offers' USING ERRCODE = 'P0008';
        END IF;
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION niu_offer_review_personal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE credential UUID;
BEGIN
    SELECT vendor_id INTO credential FROM provider_offers WHERE id = NEW.offer_id;
    PERFORM 1 FROM vendors WHERE id = credential FOR UPDATE;
    IF EXISTS (SELECT 1 FROM personal_vendor_ownership WHERE vendor_id = credential) THEN
        RAISE EXCEPTION 'personal credentials cannot receive commercial offer reviews' USING ERRCODE = 'P0008';
    END IF;
    RETURN NEW;
END $$;
