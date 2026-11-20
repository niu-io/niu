-- Keep historical reviews valid under their original expiry/revocation rules.
-- The new authorization is a separate, revocable exact-revision record.
CREATE OR REPLACE FUNCTION niu_offer_qualification_current(
    p_provider UUID, p_offer UUID, p_revision UUID
) RETURNS BOOLEAN LANGUAGE SQL VOLATILE AS $$
    SELECT niu_media_offer_binding_current(p_provider, p_offer, p_revision)
       AND EXISTS (
        SELECT 1 FROM provider_offers o
        WHERE o.provider_id=p_provider AND o.id=p_offer AND o.current_revision=p_revision
          AND (
            (o.current_authorization IS NOT NULL AND EXISTS (
                SELECT 1 FROM provider_offer_authorizations a
                JOIN vendors v ON v.id=o.vendor_id
                JOIN vendor_models m ON m.alias=o.model_alias AND m.vendor_id=v.id
                JOIN vendor_supplier_ownership own ON own.vendor_id=v.id AND own.provider_id=o.provider_id
                WHERE a.id=o.current_authorization AND a.provider_id=o.provider_id
                  AND a.offer_id=o.id AND a.rate_revision=p_revision
                  AND v.enabled AND m.enabled AND v.credential_ciphertext IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM personal_vendor_ownership personal WHERE personal.vendor_id=v.id)
                  AND NOT EXISTS (SELECT 1 FROM provider_offer_authorization_revocations r WHERE r.authorization_id=a.id)
            ))
            OR
            (o.current_qualification_review IS NOT NULL AND niu_supplier_qualification_current(p_provider)
             AND EXISTS (
                SELECT 1 FROM provider_offer_qualification_reviews q
                WHERE q.provider_id=o.provider_id AND q.offer_id=o.id
                  AND q.id=o.current_qualification_review AND q.rate_revision=p_revision
                  AND q.revoked_at IS NULL AND q.valid_until>clock_timestamp()
                  AND NOT EXISTS (SELECT 1 FROM provider_qualification_revocations r WHERE r.offer_review_id=q.id)
             ))
          )
       )
$$;

CREATE OR REPLACE FUNCTION niu_pin_supplier_attempt_review() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    SELECT current_qualification_review, current_authorization
      INTO NEW.qualification_review_id, NEW.authorization_id
      FROM provider_offers
     WHERE provider_id=NEW.provider_id AND id=NEW.offer_id
     FOR SHARE;
    IF (NEW.qualification_review_id IS NULL) = (NEW.authorization_id IS NULL) THEN
        RAISE EXCEPTION 'supplier attempt lacks one current commercial authorization'
            USING ERRCODE='P0007';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION niu_guard_qualified_supplier_dispatch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.execution='not_sent' AND NEW.execution='may_have_executed'
       AND EXISTS (
           SELECT 1 FROM provider_attempt_offers b
           LEFT JOIN provider_offers o ON o.provider_id=b.provider_id AND o.id=b.offer_id
           LEFT JOIN vendor_models m ON m.alias=o.model_alias
           LEFT JOIN vendors v ON v.id=m.vendor_id
           WHERE b.attempt_id=NEW.id AND (
               o.id IS NULL OR NOT o.active OR m.alias IS NULL OR v.id IS NULL
               OR NOT m.enabled OR NOT v.enabled OR m.vendor_id IS DISTINCT FROM o.vendor_id
               OR o.current_revision IS DISTINCT FROM b.revision_id
               OR (b.qualification_review_id IS NULL AND b.authorization_id IS NULL)
               OR o.current_qualification_review IS DISTINCT FROM b.qualification_review_id
               OR o.current_authorization IS DISTINCT FROM b.authorization_id
               OR NOT niu_offer_qualification_current(b.provider_id,b.offer_id,b.revision_id)
           )
       ) THEN
        RAISE EXCEPTION 'supplier offer authorization changed before dispatch' USING ERRCODE='P0007';
    END IF;
    RETURN NEW;
END;
$$;
