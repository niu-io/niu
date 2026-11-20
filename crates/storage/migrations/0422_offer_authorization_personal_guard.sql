-- Paused offers keep their exact-revision authorization pointer. Personal
-- owner-funded credentials must not take over a route that still carries an
-- explicit commercial authorization, even while the offer is paused.
CREATE OR REPLACE FUNCTION niu_personal_vendor_owner_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'personal credential ownership is immutable' USING ERRCODE = 'P0008';
    END IF;
    PERFORM 1 FROM vendors WHERE id = NEW.vendor_id FOR UPDATE;
    IF EXISTS (
        SELECT 1 FROM provider_offers
         WHERE vendor_id = NEW.vendor_id
           AND (active OR current_qualification_review IS NOT NULL
                OR current_authorization IS NOT NULL)
    ) THEN
        RAISE EXCEPTION 'commercial supply cannot become personal' USING ERRCODE = 'P0008';
    END IF;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION niu_commercial_offer_personal_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.active OR NEW.current_qualification_review IS NOT NULL
       OR NEW.current_authorization IS NOT NULL THEN
        PERFORM 1 FROM vendors WHERE id = NEW.vendor_id FOR UPDATE;
        IF EXISTS (SELECT 1 FROM personal_vendor_ownership WHERE vendor_id = NEW.vendor_id) THEN
            RAISE EXCEPTION 'personal credentials cannot supply commercial offers' USING ERRCODE = 'P0008';
        END IF;
    END IF;
    RETURN NEW;
END $$;
