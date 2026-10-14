-- Qualified maximum billable quantity, independent of prices and estimates.
-- Exact route identities require explicit new qualification after configuration
-- changes. No existing customer card or Supplier review is promoted by migration.
CREATE FUNCTION niu_media_liability_quantity_valid(quantity JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE numerator NUMERIC; denominator NUMERIC; left_value NUMERIC; right_value NUMERIC; remainder NUMERIC;
BEGIN
    IF jsonb_typeof(quantity) IS DISTINCT FROM 'object'
        OR NOT quantity ?& ARRAY['numerator', 'denominator']
        OR quantity - ARRAY['numerator', 'denominator'] <> '{}'::jsonb
        OR jsonb_typeof(quantity->'numerator') IS DISTINCT FROM 'string'
        OR jsonb_typeof(quantity->'denominator') IS DISTINCT FROM 'string'
        OR quantity->>'numerator' !~ '^[1-9][0-9]{0,38}$'
        OR quantity->>'denominator' !~ '^[1-9][0-9]{0,38}$' THEN RETURN FALSE; END IF;
    numerator := (quantity->>'numerator')::numeric;
    denominator := (quantity->>'denominator')::numeric;
    IF numerator > 340282366920938463463374607431768211455
        OR denominator > 340282366920938463463374607431768211455 THEN RETURN FALSE; END IF;
    left_value := numerator; right_value := denominator;
    WHILE right_value <> 0 LOOP
        remainder := mod(left_value, right_value); left_value := right_value; right_value := remainder;
    END LOOP;
    RETURN left_value = 1;
END;
$$;
CREATE FUNCTION niu_media_liability_identity_valid(identity JSONB) RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE field TEXT;
BEGIN
    IF jsonb_typeof(identity) IS DISTINCT FROM 'object'
        OR NOT identity ?& ARRAY['supplier_id','offer_id','offer_revision','vendor_id','vendor_revision',
            'model_alias','model_revision','schema_revision','dimensions','meter']
        OR identity - ARRAY['supplier_id','offer_id','offer_revision','vendor_id','vendor_revision',
            'model_alias','model_revision','schema_revision','dimensions','meter'] <> '{}'::jsonb
        OR jsonb_typeof(identity->'dimensions') IS DISTINCT FROM 'object'
        OR NOT (identity->'dimensions') ?& ARRAY['model','channel','resolution','reference_video']
        OR (identity->'dimensions') - ARRAY['model','channel','resolution','reference_video'] <> '{}'::jsonb
        OR jsonb_typeof(identity->'dimensions'->'reference_video') IS DISTINCT FROM 'boolean'
        OR identity->'dimensions'->>'model' IS DISTINCT FROM identity->>'model_alias' THEN RETURN FALSE; END IF;
    FOREACH field IN ARRAY ARRAY['supplier_id','offer_id','offer_revision','vendor_id','vendor_revision',
        'model_alias','model_revision','schema_revision','meter'] LOOP
        IF jsonb_typeof(identity->field) IS DISTINCT FROM 'string'
            OR length(identity->>field) NOT BETWEEN 1 AND 256
            OR identity->>field <> trim(identity->>field)
            OR identity->>field ~ '[[:cntrl:]]' THEN RETURN FALSE; END IF;
    END LOOP;
    FOREACH field IN ARRAY ARRAY['supplier_id','offer_id','offer_revision','vendor_id'] LOOP
        IF identity->>field !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN RETURN FALSE; END IF;
    END LOOP;
    FOREACH field IN ARRAY ARRAY['vendor_revision','model_revision'] LOOP
        IF identity->>field !~ '^[1-9][0-9]{0,18}$' THEN RETURN FALSE; END IF;
        IF (identity->>field)::numeric > 9223372036854775807 THEN RETURN FALSE; END IF;
    END LOOP;
    FOREACH field IN ARRAY ARRAY['model','channel','resolution'] LOOP
        IF jsonb_typeof(identity->'dimensions'->field) IS DISTINCT FROM 'string'
            OR length(identity->'dimensions'->>field) NOT BETWEEN 1 AND 256
            OR identity->'dimensions'->>field <> trim(identity->'dimensions'->>field)
            OR identity->'dimensions'->>field ~ '[[:cntrl:]]' THEN RETURN FALSE; END IF;
    END LOOP;
    RETURN length(identity->>'model_alias') <= 200 AND identity->>'meter' <> 'text_tokens';
END;
$$;
CREATE TABLE media_liability_qualification_heads (
    id UUID PRIMARY KEY,
    supplier_id UUID NOT NULL,
    offer_id UUID NOT NULL,
    offer_revision UUID NOT NULL,
    identity JSONB NOT NULL CHECK (niu_media_liability_identity_valid(identity)
        AND identity->>'supplier_id' = supplier_id::text AND identity->>'offer_id' = offer_id::text
        AND identity->>'offer_revision' = offer_revision::text),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    UNIQUE (identity),
    FOREIGN KEY (supplier_id, offer_id) REFERENCES provider_offers(provider_id, id),
    FOREIGN KEY (offer_id, offer_revision) REFERENCES provider_offer_revisions(offer_id, id)
);
CREATE TABLE media_liability_qualification_changes (
    id UUID PRIMARY KEY,
    head_id UUID NOT NULL REFERENCES media_liability_qualification_heads(id),
    version BIGINT NOT NULL CHECK (version > 0),
    action TEXT NOT NULL CHECK (action IN ('published', 'revoked')),
    idempotency_key UUID NOT NULL UNIQUE,
    intent JSONB NOT NULL CHECK (jsonb_typeof(intent) = 'object'),
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500
        AND reason = trim(reason) AND reason !~ '[[:cntrl:]]'),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (head_id, version),
    UNIQUE (head_id, id),
    CHECK ((actor_kind = 'installation' AND actor_operator_id IS NULL)
        OR (actor_kind = 'operator' AND actor_operator_id IS NOT NULL))
);
CREATE TABLE media_liability_qualifications (
    id UUID PRIMARY KEY,
    head_id UUID NOT NULL,
    maximum_quantity JSONB NOT NULL CHECK (niu_media_liability_quantity_valid(maximum_quantity)),
    evidence_revision TEXT NOT NULL CHECK (length(evidence_revision) BETWEEN 1 AND 256
        AND evidence_revision = trim(evidence_revision) AND evidence_revision !~ '[[:cntrl:]]'),
    evidence_sha256 TEXT NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
    effective_from BIGINT NOT NULL CHECK (effective_from BETWEEN 0 AND 253402300799),
    effective_until BIGINT NOT NULL CHECK (effective_until BETWEEN 1 AND 253402300799
        AND effective_until > effective_from),
    FOREIGN KEY (head_id, id) REFERENCES media_liability_qualification_changes(head_id, id),
    UNIQUE (head_id, id)
);
CREATE TABLE media_liability_qualification_revocations (
    id UUID PRIMARY KEY,
    head_id UUID NOT NULL,
    qualification_id UUID NOT NULL UNIQUE,
    effective_until BIGINT NOT NULL CHECK (effective_until BETWEEN 0 AND 253402300799),
    FOREIGN KEY (head_id, id) REFERENCES media_liability_qualification_changes(head_id, id),
    FOREIGN KEY (head_id, qualification_id) REFERENCES media_liability_qualifications(head_id, id)
);
CREATE FUNCTION protect_media_liability_head() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.version <> 0 THEN
            RAISE EXCEPTION 'New media liability identity starts at version zero' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' OR ROW(NEW.id, NEW.supplier_id, NEW.offer_id, NEW.offer_revision, NEW.identity)
        IS DISTINCT FROM ROW(OLD.id, OLD.supplier_id, OLD.offer_id, OLD.offer_revision, OLD.identity)
        OR NEW.version <> OLD.version + 1 THEN
        RAISE EXCEPTION 'Media liability identity is immutable and requires a new version'
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM media_liability_qualification_changes c
        WHERE c.head_id = NEW.id AND c.version = NEW.version) THEN
        RAISE EXCEPTION 'Media liability version requires publication history' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_media_liability_head BEFORE INSERT OR UPDATE OR DELETE ON media_liability_qualification_heads
    FOR EACH ROW EXECUTE FUNCTION protect_media_liability_head();
CREATE FUNCTION validate_media_liability_qualification() RETURNS trigger LANGUAGE plpgsql AS $$
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
          AND niu_media_offer_binding_current(o.provider_id, o.id, r.id)
          AND NOT EXISTS (SELECT 1 FROM personal_vendor_ownership p WHERE p.vendor_id = v.id)
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
CREATE TRIGGER validate_media_liability_qualification BEFORE INSERT ON media_liability_qualifications
    FOR EACH ROW EXECUTE FUNCTION validate_media_liability_qualification();
CREATE TRIGGER validate_media_liability_revocation BEFORE INSERT ON media_liability_qualification_revocations
    FOR EACH ROW EXECUTE FUNCTION validate_media_liability_qualification();
CREATE TRIGGER immutable_media_liability_change BEFORE UPDATE OR DELETE ON media_liability_qualification_changes
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_media_liability_qualification BEFORE UPDATE OR DELETE ON media_liability_qualifications
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE TRIGGER immutable_media_liability_revocation BEFORE UPDATE OR DELETE ON media_liability_qualification_revocations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE INDEX media_liability_qualification_selection ON media_liability_qualifications(head_id, effective_from, effective_until);
