-- Eliminate redundant niu_media_offer_binding_current() evaluations in
-- validate_media_liability_qualification() and guard_platform_media_liability_dispatch(),
-- since niu_offer_qualification_current() already evaluates niu_media_offer_binding_current().

CREATE OR REPLACE FUNCTION validate_media_liability_qualification() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE head media_liability_qualification_heads%ROWTYPE; action TEXT; original_until BIGINT;
BEGIN
    SELECT * INTO STRICT head FROM media_liability_qualification_heads WHERE id = NEW.head_id FOR NO KEY UPDATE;
    SELECT c.action INTO STRICT action FROM media_liability_qualification_changes c
        WHERE c.id = NEW.id AND c.head_id = NEW.head_id;
    IF TG_TABLE_NAME = 'media_liability_qualification_revocations' THEN
        SELECT effective_until INTO STRICT original_until FROM media_liability_qualifications
            WHERE id = NEW.qualification_id AND head_id = NEW.head_id;
        IF action <> 'revoked' OR NEW.effective_until > original_until THEN
            RAISE EXCEPTION 'Media liability revocation cannot extend qualification' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    IF action <> 'published' OR NOT EXISTS (
        SELECT 1 FROM provider_offers o JOIN provider_offer_revisions r ON r.id = o.current_revision
        JOIN vendors v ON v.id = o.vendor_id JOIN vendor_models m ON m.vendor_id = v.id AND m.alias = o.model_alias
        WHERE o.id = head.offer_id AND o.provider_id = head.supplier_id AND r.id = head.offer_revision
          AND r.rate_kind = 'media' AND o.active AND v.enabled AND m.enabled
          AND v.id::text = head.identity->>'vendor_id'
          AND v.revision = (head.identity->>'vendor_revision')::bigint
          AND m.alias = head.identity->>'model_alias'
          AND m.revision = (head.identity->>'model_revision')::bigint
          AND m.capabilities->'video_schema'->>'revision' = head.identity->>'schema_revision'
          AND m.capabilities->'video_schema'->>'channel' = head.identity->'dimensions'->>'channel'
          AND head.identity->'dimensions'->>'model' = m.alias
          AND head.identity->>'supplier_id' = head.supplier_id::text
          AND head.identity->>'offer_id' = head.offer_id::text
          AND head.identity->>'offer_revision' = head.offer_revision::text
          AND niu_offer_qualification_current(o.provider_id, o.id, r.id)
    ) OR EXISTS (
        SELECT 1 FROM media_liability_qualifications q
        LEFT JOIN media_liability_qualification_revocations revoked ON revoked.qualification_id = q.id
        WHERE q.head_id = NEW.head_id
          AND q.effective_from < LEAST(q.effective_until, COALESCE(revoked.effective_until, q.effective_until))
          AND NEW.effective_from < LEAST(q.effective_until, COALESCE(revoked.effective_until, q.effective_until))
          AND q.effective_from < NEW.effective_until
    ) THEN
        RAISE EXCEPTION 'Media liability requires current exact qualified supply and nonoverlapping validity'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION guard_platform_media_liability_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE at BIGINT;
BEGIN
    IF OLD.execution<>'not_sent' OR NEW.execution<>'may_have_executed'
        OR NOT EXISTS(SELECT 1 FROM retail_media_attempt_prices p WHERE p.attempt_id=NEW.id) THEN RETURN NEW; END IF;
    at:=floor(extract(epoch FROM clock_timestamp()))::bigint;
    IF NOT EXISTS (
        SELECT 1 FROM retail_media_attempt_prices p
        JOIN media_liability_qualifications q ON q.id=p.qualification_revision
        JOIN media_liability_qualification_heads h ON h.id=q.head_id
        LEFT JOIN media_liability_qualification_revocations revoked ON revoked.qualification_id=q.id
        JOIN provider_attempt_offers b ON b.attempt_id=p.attempt_id
        JOIN provider_offers o ON o.id=b.offer_id AND o.provider_id=b.provider_id
        JOIN vendors v ON v.id=o.vendor_id JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=o.model_alias
        JOIN media_recovery_routes route ON route.attempt_id=p.attempt_id
        JOIN customer_media_attempt_pricing price ON price.attempt_id=p.attempt_id
        JOIN customer_media_liability_bounds bound ON bound.attempt_id=p.attempt_id
        WHERE p.attempt_id=NEW.id AND p.organization_id=NEW.organization_id AND p.project_id=NEW.project_id
          AND q.effective_from<=at AND LEAST(q.effective_until,COALESCE(revoked.effective_until,q.effective_until))>at
          AND b.provider_id=h.supplier_id AND b.offer_id=h.offer_id AND b.revision_id=h.offer_revision
          AND o.current_revision=b.revision_id AND o.active AND v.enabled AND m.enabled
          AND v.id::text=h.identity->>'vendor_id' AND v.revision::text=h.identity->>'vendor_revision'
          AND m.alias=h.identity->>'model_alias' AND m.revision::text=h.identity->>'model_revision'
          AND m.capabilities->'video_schema'->>'revision'=h.identity->>'schema_revision'
          AND route.vendor_id=v.id AND route.vendor_revision=v.revision AND route.model_revision=m.revision
          AND route.schema_revision=h.identity->>'schema_revision'
          AND price.snapshot->'discounts'='[]'::jsonb
          AND price.snapshot->>'customer'=p.organization_id::text
          AND price.snapshot->>'selected_at'=p.selected_at::text
          AND price.snapshot->'tariff'->>'currency'=p.selection->>'currency'
          AND price.snapshot->'tariff'->>'revision'=COALESCE(p.promotion_revision,p.baseline_revision)::text
          AND price.snapshot->>'offer'=b.revision_id::text
          AND jsonb_build_object('dimensions',price.snapshot->'tariff'->'dimensions',
              'meter',price.snapshot->'tariff'->'meter','decimal_places',price.snapshot->'tariff'->'decimal_places',
              'amount_units',price.snapshot->'tariff'->>'amount_units',
              'per_quantity',price.snapshot->'tariff'->'per_quantity',
              'minimum_quantity',price.snapshot->'tariff'->'minimum_quantity',
              'rounding',price.snapshot->'tariff'->'rounding')=(p.selection->'schedule')-'kind'
          AND price.snapshot->'tariff'->'dimensions'=h.identity->'dimensions'
          AND bound.bound->'maximum_quantity'=q.maximum_quantity
          AND bound.bound->>'meter'=h.identity->>'meter'
          AND bound.bound->>'qualification_revision'=q.id::text
          AND niu_offer_qualification_current(b.provider_id,b.offer_id,b.revision_id)
    ) THEN
        RAISE EXCEPTION 'Platform media liability qualification changed before dispatch' USING ERRCODE='P0007';
    END IF;
    RETURN NEW;
END;
$$;
