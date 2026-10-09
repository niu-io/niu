-- Pending attempts must use the exact review under which their route was prepared.
-- Historical rows stay unchanged; pending legacy rows without a pinned review fail closed.
ALTER TABLE provider_attempt_offers ADD COLUMN qualification_review_id UUID;
ALTER TABLE provider_attempt_offers ADD CONSTRAINT provider_attempt_review_identity
    FOREIGN KEY (provider_id, offer_id, qualification_review_id)
    REFERENCES provider_offer_qualification_reviews(provider_id, offer_id, id);

CREATE FUNCTION niu_pin_supplier_attempt_review() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    SELECT current_qualification_review INTO NEW.qualification_review_id
      FROM provider_offers
     WHERE provider_id = NEW.provider_id AND id = NEW.offer_id
     FOR SHARE;
    IF NEW.qualification_review_id IS NULL THEN
        RAISE EXCEPTION 'supplier attempt lacks a current qualification review'
            USING ERRCODE = 'P0007';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER pin_supplier_attempt_review
BEFORE INSERT ON provider_attempt_offers
FOR EACH ROW EXECUTE FUNCTION niu_pin_supplier_attempt_review();

CREATE OR REPLACE FUNCTION niu_guard_qualified_supplier_dispatch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.execution = 'not_sent'
       AND NEW.execution = 'may_have_executed'
       AND EXISTS (
           SELECT 1 FROM provider_attempt_offers b
           LEFT JOIN provider_offers o ON o.provider_id = b.provider_id AND o.id = b.offer_id
           WHERE b.attempt_id = NEW.id AND (
               o.id IS NULL OR NOT o.active
               OR o.current_revision IS DISTINCT FROM b.revision_id
               OR b.qualification_review_id IS NULL
               OR o.current_qualification_review IS DISTINCT FROM b.qualification_review_id
               OR NOT niu_offer_qualification_current(b.provider_id, b.offer_id, b.revision_id)
           )
       ) THEN
        RAISE EXCEPTION 'supplier offer qualification changed before dispatch'
            USING ERRCODE = 'P0007';
    END IF;
    RETURN NEW;
END;
$$;
