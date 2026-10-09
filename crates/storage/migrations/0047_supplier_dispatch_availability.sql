-- Recheck Supplier and model route switches immediately before dispatch.
CREATE OR REPLACE FUNCTION niu_guard_qualified_supplier_dispatch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.execution = 'not_sent'
       AND NEW.execution = 'may_have_executed'
       AND EXISTS (
           SELECT 1 FROM provider_attempt_offers b
           LEFT JOIN provider_offers o ON o.provider_id = b.provider_id AND o.id = b.offer_id
           LEFT JOIN vendor_models m ON m.alias = o.model_alias
           LEFT JOIN vendors v ON v.id = m.vendor_id
           WHERE b.attempt_id = NEW.id AND (
               o.id IS NULL OR NOT o.active
               OR m.alias IS NULL OR v.id IS NULL
               OR NOT m.enabled OR NOT v.enabled
               OR m.vendor_id IS DISTINCT FROM o.vendor_id
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
