ALTER TABLE provider_offer_qualification_reviews
    ADD CONSTRAINT provider_offer_qualification_identity
    UNIQUE (provider_id, offer_id, id);

ALTER TABLE provider_businesses ADD COLUMN current_qualification_review UUID;
ALTER TABLE provider_businesses
    ADD CONSTRAINT provider_business_current_qualification
    FOREIGN KEY (id, current_qualification_review)
    REFERENCES provider_qualification_reviews(provider_id, id);

ALTER TABLE provider_offers ADD COLUMN current_qualification_review UUID;
ALTER TABLE provider_offers
    ADD CONSTRAINT provider_offer_current_qualification
    FOREIGN KEY (provider_id, id, current_qualification_review)
    REFERENCES provider_offer_qualification_reviews(provider_id, offer_id, id);

CREATE TABLE provider_qualification_revocations (
    id UUID PRIMARY KEY,
    provider_id UUID NOT NULL REFERENCES provider_businesses(id),
    supplier_review_id UUID,
    offer_id UUID,
    offer_review_id UUID,
    reason_sha256 TEXT NOT NULL CHECK (reason_sha256 ~ '^[0-9a-f]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewer_operator_id UUID REFERENCES admin_operators(id),
    CHECK (
        (supplier_review_id IS NOT NULL AND offer_id IS NULL AND offer_review_id IS NULL)
        OR
        (supplier_review_id IS NULL AND offer_id IS NOT NULL AND offer_review_id IS NOT NULL)
    ),
    FOREIGN KEY (provider_id, supplier_review_id)
        REFERENCES provider_qualification_reviews(provider_id, id),
    FOREIGN KEY (provider_id, offer_id, offer_review_id)
        REFERENCES provider_offer_qualification_reviews(provider_id, offer_id, id),
    UNIQUE (supplier_review_id),
    UNIQUE (offer_review_id)
);

CREATE INDEX provider_qualification_revocations_by_supplier
    ON provider_qualification_revocations(provider_id, created_at DESC);

CREATE OR REPLACE FUNCTION niu_supplier_qualification_current(p_provider UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM provider_businesses p
        JOIN provider_qualification_reviews q
          ON q.provider_id = p.id
         AND q.id = p.current_qualification_review
         WHERE p.id = p_provider
           AND q.revoked_at IS NULL
           AND q.valid_until > now()
           AND NOT EXISTS (
               SELECT 1 FROM provider_qualification_revocations r
                WHERE r.supplier_review_id = q.id
           )
    )
$$;

CREATE OR REPLACE FUNCTION niu_offer_qualification_current(
    p_provider UUID, p_offer UUID, p_revision UUID
)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT niu_supplier_qualification_current(p_provider)
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
           AND q.valid_until > now()
           AND NOT EXISTS (
               SELECT 1 FROM provider_qualification_revocations r
                WHERE r.offer_review_id = q.id
           )
    )
$$;

CREATE OR REPLACE FUNCTION niu_guard_qualified_supplier_dispatch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.execution = 'not_sent'
       AND NEW.execution = 'may_have_executed'
       AND EXISTS (
           SELECT 1
             FROM provider_attempt_offers b
             LEFT JOIN provider_offers o
               ON o.provider_id = b.provider_id
              AND o.id = b.offer_id
            WHERE b.attempt_id = NEW.id
              AND (
                  o.id IS NULL
                  OR NOT o.active
                  OR o.current_revision IS DISTINCT FROM b.revision_id
                  OR NOT niu_offer_qualification_current(
                      b.provider_id, b.offer_id, b.revision_id
                  )
              )
       ) THEN
        RAISE EXCEPTION 'supplier offer qualification changed before dispatch'
            USING ERRCODE = 'P0007';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER immutable_provider_qualification_revocation
    BEFORE UPDATE OR DELETE ON provider_qualification_revocations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
