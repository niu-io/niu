-- Media offer identity is separate from specification-selected purchase prices.
-- Existing immutable text revisions retain their rates and behavior.
ALTER TABLE provider_offer_revisions
    ADD COLUMN rate_kind TEXT NOT NULL DEFAULT 'text' CHECK (rate_kind IN ('text','media')),
    ADD COLUMN vendor_id UUID REFERENCES vendors(id),
    ADD COLUMN vendor_revision BIGINT,
    ADD COLUMN model_revision BIGINT,
    ADD COLUMN schema_revision TEXT,
    ADD COLUMN replaces_revision UUID REFERENCES provider_offer_revisions(id),
    ALTER COLUMN currency DROP NOT NULL,
    ALTER COLUMN prompt_rate DROP NOT NULL,
    ALTER COLUMN completion_rate DROP NOT NULL;
ALTER TABLE provider_offer_revisions ADD CONSTRAINT provider_offer_revision_meter_shape CHECK (
    (rate_kind='text' AND currency IS NOT NULL AND prompt_rate IS NOT NULL AND completion_rate IS NOT NULL
        AND vendor_id IS NULL AND vendor_revision IS NULL AND model_revision IS NULL AND schema_revision IS NULL AND replaces_revision IS NULL)
    OR
    (rate_kind='media' AND currency IS NULL AND prompt_rate IS NULL AND completion_rate IS NULL
        AND vendor_id IS NOT NULL AND vendor_revision > 0 AND model_revision > 0 AND schema_revision IS NOT NULL
        AND vendor_revision IS NOT NULL AND model_revision IS NOT NULL
        AND octet_length(schema_revision) BETWEEN 1 AND 256 AND schema_revision=btrim(schema_revision)
        AND schema_revision !~ '[[:cntrl:]]')
);

CREATE FUNCTION niu_media_offer_binding_current(p_provider UUID, p_offer UUID, p_revision UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM provider_offers o
        JOIN provider_offer_revisions r ON r.offer_id=o.id AND r.id=p_revision
        JOIN vendors v ON v.id=o.vendor_id
        JOIN vendor_models m ON m.alias=o.model_alias AND m.vendor_id=v.id
        WHERE o.provider_id=p_provider AND o.id=p_offer
          AND (r.rate_kind='text' OR (
              r.vendor_id=v.id AND r.vendor_revision=v.revision AND r.model_revision=m.revision
              AND r.schema_revision=m.capabilities->'video_schema'->>'revision'
              AND m.capabilities->'video_schema'->>'model_alias'=m.alias
              AND m.capabilities->'video_schema'->>'upstream_model'=m.upstream_model
              AND EXISTS (SELECT 1 FROM vendor_supplier_ownership s WHERE s.vendor_id=v.id AND s.provider_id=p_provider)
              AND NOT EXISTS (SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id=v.id)
          ))
    )
$$;

CREATE OR REPLACE FUNCTION niu_offer_qualification_current(p_provider UUID, p_offer UUID, p_revision UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT niu_supplier_qualification_current(p_provider)
       AND niu_media_offer_binding_current(p_provider,p_offer,p_revision)
       AND EXISTS (
        SELECT 1 FROM provider_offers o
        JOIN provider_offer_qualification_reviews q ON q.provider_id=o.provider_id
            AND q.offer_id=o.id AND q.id=o.current_qualification_review
        WHERE o.provider_id=p_provider AND o.id=p_offer AND o.current_revision=p_revision
          AND q.rate_revision=p_revision AND q.revoked_at IS NULL AND q.valid_until>now()
          AND NOT EXISTS (SELECT 1 FROM provider_qualification_revocations r WHERE r.offer_review_id=q.id)
       )
$$;

-- A media-only offer cannot admit text/embedding traffic, including a route race.
CREATE FUNCTION niu_guard_media_offer_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.execution='not_sent' AND NEW.execution='may_have_executed'
       AND EXISTS (SELECT 1 FROM provider_attempt_offers b
           JOIN provider_offer_revisions r ON r.id=b.revision_id
           WHERE b.attempt_id=NEW.id AND r.rate_kind='media')
       AND (NOT EXISTS (SELECT 1 FROM supplier_media_attempt_pricing p WHERE p.attempt_id=NEW.id)
            OR NOT EXISTS (SELECT 1 FROM customer_media_attempt_pricing p WHERE p.attempt_id=NEW.id)
            OR NOT EXISTS (SELECT 1 FROM customer_media_liability_bounds b WHERE b.attempt_id=NEW.id)
            OR NOT EXISTS (SELECT 1 FROM media_recovery_routes r WHERE r.attempt_id=NEW.id)) THEN
        RAISE EXCEPTION 'media offer requires pinned media pricing, liability and route'
            USING ERRCODE='P0007';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER media_offer_requires_media_dispatch
BEFORE UPDATE OF execution ON attempts FOR EACH ROW EXECUTE FUNCTION niu_guard_media_offer_dispatch();
