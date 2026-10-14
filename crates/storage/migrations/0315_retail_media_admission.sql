-- New platform video pins retain explicit selling provenance and independently
-- qualified maximum quantity. Existing legacy snapshots are never rewritten.
CREATE TABLE retail_media_attempt_prices (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    price_id UUID NOT NULL,
    baseline_revision UUID NOT NULL,
    promotion_revision UUID,
    qualification_revision UUID NOT NULL REFERENCES media_liability_qualifications(id),
    selected_at BIGINT NOT NULL CHECK (selected_at >= 0),
    selection JSONB NOT NULL CHECK (jsonb_typeof(selection) = 'object'),
    FOREIGN KEY (organization_id,project_id,attempt_id)
        REFERENCES attempts(organization_id,project_id,id),
    FOREIGN KEY (price_id,baseline_revision) REFERENCES platform_retail_standard_revisions(head_id,id),
    FOREIGN KEY (price_id,promotion_revision) REFERENCES platform_retail_promotions(head_id,id)
);
CREATE FUNCTION validate_retail_media_attempt_price() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selling JSONB; original JSONB; identity JSONB; quantity JSONB; bound JSONB;
    currency_code TEXT; current_standard UUID; current_version BIGINT; model TEXT;
    snapshot JSONB; concrete JSONB; customer UUID;
BEGIN
    SELECT h.currency,h.current_revision,h.version,h.model_alias INTO STRICT currency_code,current_standard,current_version,model
        FROM platform_retail_price_heads h WHERE h.id=NEW.price_id AND h.rate_kind='media';
    SELECT schedule INTO STRICT original FROM platform_retail_standard_revisions
        WHERE head_id=NEW.price_id AND id=NEW.baseline_revision;
    IF NEW.promotion_revision IS NULL THEN
        IF current_standard<>NEW.baseline_revision THEN
            RAISE EXCEPTION 'Platform media standard selection conflicts' USING ERRCODE='23514';
        END IF;
        selling:=original;
    ELSE
        SELECT p.schedule,p.customer_organization_id INTO STRICT selling,customer
            FROM platform_retail_promotions p
            LEFT JOIN platform_retail_promotion_retirements r ON r.promotion_id=p.id
            WHERE p.id=NEW.promotion_revision AND p.head_id=NEW.price_id
              AND p.baseline_revision=NEW.baseline_revision AND p.effective_from<=NEW.selected_at
              AND LEAST(p.effective_until,COALESCE(r.effective_until,p.effective_until))>NEW.selected_at
              AND (p.customer_organization_id IS NULL OR p.customer_organization_id=NEW.organization_id);
    END IF;
    IF EXISTS (SELECT 1 FROM platform_retail_promotions p
        LEFT JOIN platform_retail_promotion_retirements r ON r.promotion_id=p.id
        WHERE p.head_id=NEW.price_id AND p.effective_from<=NEW.selected_at
          AND LEAST(p.effective_until,COALESCE(r.effective_until,p.effective_until))>NEW.selected_at
          AND (p.customer_organization_id IS NULL OR p.customer_organization_id=NEW.organization_id)
          AND (NEW.promotion_revision IS NULL OR (customer IS NULL AND p.customer_organization_id=NEW.organization_id))) THEN
        RAISE EXCEPTION 'Platform media promotion precedence conflicts' USING ERRCODE='23514';
    END IF;
    SELECT p.snapshot INTO STRICT snapshot FROM customer_media_attempt_pricing p
        WHERE p.attempt_id=NEW.attempt_id AND p.organization_id=NEW.organization_id AND p.project_id=NEW.project_id;
    SELECT h.identity,q.maximum_quantity INTO STRICT identity,quantity
        FROM media_liability_qualifications q JOIN media_liability_qualification_heads h ON h.id=q.head_id
        LEFT JOIN media_liability_qualification_revocations r ON r.qualification_id=q.id
        WHERE q.id=NEW.qualification_revision AND q.effective_from<=NEW.selected_at
          AND LEAST(q.effective_until,COALESCE(r.effective_until,q.effective_until))>NEW.selected_at;
    SELECT b.bound INTO STRICT bound FROM customer_media_liability_bounds b
        WHERE b.attempt_id=NEW.attempt_id AND b.organization_id=NEW.organization_id AND b.project_id=NEW.project_id;
    concrete:=jsonb_build_object('dimensions',snapshot->'tariff'->'dimensions','meter',snapshot->'tariff'->'meter',
        'decimal_places',snapshot->'tariff'->'decimal_places','amount_units',snapshot->'tariff'->>'amount_units',
        'per_quantity',snapshot->'tariff'->'per_quantity','minimum_quantity',snapshot->'tariff'->'minimum_quantity',
        'rounding',snapshot->'tariff'->'rounding');
    IF selling->>'kind' IS DISTINCT FROM 'media' OR concrete IS DISTINCT FROM selling-'kind'
        OR snapshot->'discounts' IS DISTINCT FROM '[]'::jsonb
        OR snapshot->>'customer' IS DISTINCT FROM NEW.organization_id::text
        OR snapshot->'tariff'->>'currency' IS DISTINCT FROM currency_code
        OR snapshot->'tariff'->>'revision' IS DISTINCT FROM COALESCE(NEW.promotion_revision,NEW.baseline_revision)::text
        OR snapshot->>'selected_at' IS DISTINCT FROM NEW.selected_at::text
        OR NEW.selection->'schedule' IS DISTINCT FROM selling
        OR NEW.selection->>'price_id' IS DISTINCT FROM NEW.price_id::text
        OR NEW.selection->>'baseline_revision' IS DISTINCT FROM NEW.baseline_revision::text
        OR NEW.selection->>'promotion_revision' IS DISTINCT FROM NEW.promotion_revision::text
        OR NEW.selection->>'current_standard_revision' IS DISTINCT FROM current_standard::text
        OR NEW.selection->>'currency' IS DISTINCT FROM currency_code
        OR NEW.selection->>'model_alias' IS DISTINCT FROM model
        OR NEW.selection->>'version' IS DISTINCT FROM current_version::text
        OR NEW.selection->>'selected_at' IS DISTINCT FROM NEW.selected_at::text
        OR NEW.selection->>'promotion_scope' IS DISTINCT FROM (CASE WHEN NEW.promotion_revision IS NULL THEN NULL
            WHEN customer IS NULL THEN 'global' ELSE 'customer' END)
        OR identity->'dimensions' IS DISTINCT FROM selling->'dimensions'
        OR identity->>'meter' IS DISTINCT FROM selling->>'meter'
        OR bound->>'meter' IS DISTINCT FROM identity->>'meter'
        OR bound->'maximum_quantity' IS DISTINCT FROM quantity
        OR bound->>'qualification_revision' IS DISTINCT FROM NEW.qualification_revision::text
        OR snapshot->>'offer' IS DISTINCT FROM identity->>'offer_revision'
        OR NOT EXISTS (SELECT 1 FROM retail_media_enrollments e
            WHERE e.organization_id=NEW.organization_id AND e.project_id=NEW.project_id
              AND e.price_id=NEW.price_id AND e.dimensions=selling->'dimensions' AND e.meter=selling->>'meter')
        OR NOT EXISTS (SELECT 1 FROM provider_attempt_offers b JOIN media_recovery_routes route ON route.attempt_id=b.attempt_id
            WHERE b.attempt_id=NEW.attempt_id AND b.provider_id::text=identity->>'supplier_id'
              AND b.offer_id::text=identity->>'offer_id' AND b.revision_id::text=identity->>'offer_revision'
              AND route.vendor_id::text=identity->>'vendor_id'
              AND route.vendor_revision::text=identity->>'vendor_revision'
              AND route.model_revision::text=identity->>'model_revision'
              AND route.schema_revision=identity->>'schema_revision') THEN
        RAISE EXCEPTION 'Platform media snapshot, price, bound or route provenance conflicts' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_retail_media_attempt_price BEFORE INSERT ON retail_media_attempt_prices
    FOR EACH ROW EXECUTE FUNCTION validate_retail_media_attempt_price();
CREATE TRIGGER immutable_retail_media_attempt_price BEFORE UPDATE OR DELETE ON retail_media_attempt_prices
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- No price reselection or row-lock upgrades here: existing dispatch owns the
-- attempt lock. Expired/revoked quantity qualification denies unsent egress;
-- already-dispatched asynchronous jobs retain their original price and bound.
CREATE FUNCTION guard_platform_media_liability_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
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
          AND niu_media_offer_binding_current(b.provider_id,b.offer_id,b.revision_id)
    ) THEN
        RAISE EXCEPTION 'Platform media liability qualification changed before dispatch' USING ERRCODE='P0007';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER guard_platform_media_liability_dispatch BEFORE UPDATE OF execution ON attempts
    FOR EACH ROW EXECUTE FUNCTION guard_platform_media_liability_dispatch();
