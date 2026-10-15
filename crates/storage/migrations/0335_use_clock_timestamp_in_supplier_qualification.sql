-- Use wall-clock clock_timestamp() (VOLATILE) instead of transaction-frozen now()
-- in supplier and offer qualification checks so long-running transactions cannot
-- bypass expired qualification windows.

CREATE OR REPLACE FUNCTION niu_supplier_qualification_current(p_provider UUID)
RETURNS BOOLEAN LANGUAGE SQL VOLATILE AS $$
    SELECT EXISTS (
        SELECT 1 FROM provider_businesses p
        JOIN provider_qualification_reviews q
          ON q.provider_id = p.id
         AND q.id = p.current_qualification_review
         WHERE p.id = p_provider
           AND q.revoked_at IS NULL
           AND q.valid_until > clock_timestamp()
           AND NOT EXISTS (
               SELECT 1 FROM provider_qualification_revocations r
                WHERE r.supplier_review_id = q.id
           )
    )
$$;

CREATE OR REPLACE FUNCTION niu_offer_qualification_current(
    p_provider UUID, p_offer UUID, p_revision UUID
)
RETURNS BOOLEAN LANGUAGE SQL VOLATILE AS $$
    SELECT niu_supplier_qualification_current(p_provider)
       AND niu_media_offer_binding_current(p_provider, p_offer, p_revision)
       AND EXISTS (
        SELECT 1 FROM provider_offers o
        JOIN provider_offer_qualification_reviews q
          ON q.provider_id = o.provider_id
         AND q.offer_id = o.id
         AND q.id = o.current_qualification_review
         WHERE o.provider_id = p_provider
           AND o.id = p_offer
           AND o.current_revision = p_revision
           AND q.rate_revision = p_revision
           AND q.revoked_at IS NULL
           AND q.valid_until > clock_timestamp()
           AND NOT EXISTS (
               SELECT 1 FROM provider_qualification_revocations r
                WHERE r.offer_review_id = q.id
           )
       )
$$;
