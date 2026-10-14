-- Explicit per-workspace media selling identity. No Supplier qualification,
-- capacity, balance account or legacy card is created by enrollment.
CREATE TABLE retail_media_enrollments (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    dimensions JSONB NOT NULL CHECK (jsonb_typeof(dimensions) = 'object'
        AND dimensions ?& ARRAY['model','channel','resolution','reference_video']
        AND dimensions - ARRAY['model','channel','resolution','reference_video'] = '{}'::jsonb
        AND jsonb_typeof(dimensions->'model') = 'string'
        AND jsonb_typeof(dimensions->'channel') = 'string'
        AND jsonb_typeof(dimensions->'resolution') = 'string'
        AND jsonb_typeof(dimensions->'reference_video') = 'boolean'
        AND octet_length(dimensions->>'model') BETWEEN 1 AND 200
        AND octet_length(dimensions->>'channel') BETWEEN 1 AND 256
        AND octet_length(dimensions->>'resolution') BETWEEN 1 AND 256
        AND dimensions->>'model' = trim(dimensions->>'model')
        AND dimensions->>'channel' = trim(dimensions->>'channel')
        AND dimensions->>'resolution' = trim(dimensions->>'resolution')
        AND dimensions->>'model' !~ '[[:cntrl:]]'
        AND dimensions->>'channel' !~ '[[:cntrl:]]'
        AND dimensions->>'resolution' !~ '[[:cntrl:]]'),
    meter TEXT NOT NULL CHECK (octet_length(meter) BETWEEN 1 AND 256
        AND meter = trim(meter) AND meter !~ '[[:cntrl:]]' AND meter <> 'text_tokens'),
    price_id UUID REFERENCES platform_retail_price_heads(id),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    UNIQUE (organization_id, project_id, dimensions, meter),
    UNIQUE (organization_id, project_id, id),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id)
);
CREATE TABLE retail_media_enrollment_changes (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    enrollment_id UUID NOT NULL,
    price_id UUID REFERENCES platform_retail_price_heads(id),
    version BIGINT NOT NULL CHECK (version > 0),
    idempotency_key UUID NOT NULL,
    intent JSONB NOT NULL CHECK (jsonb_typeof(intent) = 'object'),
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500
        AND reason = trim(reason) AND reason !~ '[[:cntrl:]]'),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (enrollment_id, version),
    UNIQUE (organization_id, project_id, idempotency_key),
    FOREIGN KEY (organization_id, project_id, enrollment_id)
        REFERENCES retail_media_enrollments(organization_id, project_id, id),
    CHECK ((actor_kind = 'installation' AND actor_operator_id IS NULL)
        OR (actor_kind = 'operator' AND actor_operator_id IS NOT NULL))
);
CREATE FUNCTION protect_retail_media_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.version <> 0 OR NEW.price_id IS NOT NULL THEN
            RAISE EXCEPTION 'Media enrollment starts in legacy mode at version zero' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' OR ROW(NEW.id, NEW.organization_id, NEW.project_id, NEW.dimensions, NEW.meter)
        IS DISTINCT FROM ROW(OLD.id, OLD.organization_id, OLD.project_id, OLD.dimensions, OLD.meter)
        OR NEW.version <> OLD.version + 1 THEN
        RAISE EXCEPTION 'Media enrollment identity is immutable and requires a new version' USING ERRCODE = '23514';
    END IF;
    IF NEW.price_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM platform_retail_price_heads h
        JOIN customer_balance_accounts a ON a.organization_id = NEW.organization_id AND a.currency = h.currency
        WHERE h.id = NEW.price_id AND h.rate_kind = 'media' AND h.current_revision IS NOT NULL
          AND h.dimensions = NEW.dimensions AND h.meter = NEW.meter
          AND h.model_alias = NEW.dimensions->>'model'
    ) THEN
        RAISE EXCEPTION 'Media enrollment requires matching published selling identity and existing currency account'
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM retail_media_enrollment_changes c
        WHERE c.enrollment_id = NEW.id AND c.version = NEW.version
          AND c.price_id IS NOT DISTINCT FROM NEW.price_id) THEN
        RAISE EXCEPTION 'Media enrollment requires exact publication history' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_retail_media_enrollment BEFORE INSERT OR UPDATE OR DELETE ON retail_media_enrollments
    FOR EACH ROW EXECUTE FUNCTION protect_retail_media_enrollment();
CREATE TRIGGER immutable_retail_media_enrollment_change BEFORE UPDATE OR DELETE ON retail_media_enrollment_changes
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
