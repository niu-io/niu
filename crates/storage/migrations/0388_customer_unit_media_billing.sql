-- Versioned Credits media (video) tariffs, attempt bindings, usage observations,
-- reservations, and settlement (#110).

CREATE TABLE customer_unit_media_tariffs (
    revision BIGINT PRIMARY KEY CHECK (revision > 0),
    expected_revision BIGINT NOT NULL CHECK (expected_revision >= 0 AND revision = expected_revision + 1),
    definition_revision BIGINT NOT NULL REFERENCES customer_unit_definitions(revision),
    model_alias TEXT NOT NULL CHECK (
        char_length(model_alias) BETWEEN 1 AND 200
        AND model_alias = btrim(model_alias)
        AND model_alias !~ '[[:cntrl:]]'
    ),
    channel TEXT NOT NULL CHECK (
        char_length(channel) BETWEEN 1 AND 200
        AND channel = btrim(channel)
        AND channel !~ '[[:cntrl:]]'
    ),
    resolution TEXT NOT NULL CHECK (
        char_length(resolution) BETWEEN 1 AND 200
        AND resolution = btrim(resolution)
        AND resolution !~ '[[:cntrl:]]'
    ),
    reference_video BOOLEAN NOT NULL,
    meter TEXT NOT NULL CHECK (meter = 'video_tokens'),
    price JSONB NOT NULL CHECK (jsonb_typeof(price) = 'object'),
    idempotency_key UUID NOT NULL UNIQUE,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((actor_kind = 'operator') = (actor_operator_id IS NOT NULL)),
    CHECK (
        price ?& ARRAY['dimensions', 'meter', 'amount_atoms', 'per_quantity', 'minimum_quantity', 'rounding']
        AND price - ARRAY['dimensions', 'meter', 'amount_atoms', 'per_quantity', 'minimum_quantity', 'rounding'] = '{}'::jsonb
        AND price->>'meter' = meter
        AND price->'dimensions'->>'model' = model_alias
        AND price->'dimensions'->>'channel' = channel
        AND price->'dimensions'->>'resolution' = resolution
        AND (price->'dimensions'->>'reference_video')::boolean = reference_video
        AND (price->>'amount_atoms')::bigint >= 0
        AND (price->'per_quantity'->>'numerator')::numeric > 0
        AND (price->'per_quantity'->>'denominator')::numeric > 0
        AND (price->'minimum_quantity'->>'numerator')::numeric >= 0
        AND (price->'minimum_quantity'->>'denominator')::numeric > 0
        AND price->>'rounding' IN ('Down', 'Up', 'HalfEven')
    )
);
CREATE INDEX customer_unit_media_tariff_current
    ON customer_unit_media_tariffs(model_alias, channel, resolution, reference_video, revision DESC);
CREATE TRIGGER immutable_customer_unit_media_tariff
    BEFORE UPDATE OR DELETE ON customer_unit_media_tariffs
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION niu_customer_unit_media_bound(price JSONB, quantity JSONB)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE STRICT AS $$
    WITH rational AS (
        SELECT
            (quantity->>'numerator')::numeric AS q_num,
            (quantity->>'denominator')::numeric AS q_den,
            (price->'minimum_quantity'->>'numerator')::numeric AS m_num,
            (price->'minimum_quantity'->>'denominator')::numeric AS m_den,
            (price->'per_quantity'->>'numerator')::numeric AS p_num,
            (price->'per_quantity'->>'denominator')::numeric AS p_den,
            (price->>'amount_atoms')::numeric AS amt,
            price->>'rounding' AS rounding
    ), billable AS (
        SELECT
            CASE WHEN q_num * m_den >= m_num * q_den THEN q_num ELSE m_num END AS b_num,
            CASE WHEN q_num * m_den >= m_num * q_den THEN q_den ELSE m_den END AS b_den,
            p_num, p_den, amt, rounding
        FROM rational
    ), exact AS (
        SELECT
            b_num * p_den * amt AS num,
            b_den * p_num AS den,
            div(b_num * p_den * amt, b_den * p_num) AS quotient,
            mod(b_num * p_den * amt, b_den * p_num) AS remainder,
            rounding
        FROM billable
    )
    SELECT quotient + CASE
        WHEN rounding = 'Down' THEN 0
        WHEN rounding = 'Up' THEN CASE WHEN remainder <> 0 THEN 1 ELSE 0 END
        WHEN rounding = 'HalfEven' THEN CASE
            WHEN remainder * 2 > den OR (remainder * 2 = den AND mod(quotient, 2) = 1) THEN 1
            ELSE 0
        END
        ELSE NULL
    END
    FROM exact;
$$;

CREATE TABLE customer_unit_media_attempt_tariffs (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    revision BIGINT NOT NULL REFERENCES customer_unit_media_tariffs(revision),
    qualification_revision UUID NOT NULL REFERENCES media_liability_qualifications(id),
    bound JSONB NOT NULL CHECK (jsonb_typeof(bound) = 'object' AND octet_length(bound::text) <= 4096),
    maximum_atoms BIGINT NOT NULL CHECK (maximum_atoms >= 0),
    selected_at BIGINT NOT NULL CHECK (selected_at >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (attempt_id, revision),
    UNIQUE (organization_id, project_id, attempt_id),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES attempts(organization_id, project_id, id)
);

CREATE FUNCTION validate_customer_unit_media_attempt_tariff() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    tariff customer_unit_media_tariffs;
    identity JSONB;
    quantity JSONB;
BEGIN
    PERFORM id FROM attempts
    WHERE id = NEW.attempt_id
      AND organization_id = NEW.organization_id
      AND project_id = NEW.project_id
      AND execution = 'not_sent'
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Credits media tariff requires an unsent attempt in the same scope'
            USING ERRCODE = '23514';
    END IF;
    IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id = NEW.attempt_id)
       OR EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id = NEW.attempt_id)
       OR EXISTS (SELECT 1 FROM customer_media_attempt_pricing WHERE attempt_id = NEW.attempt_id)
       OR EXISTS (SELECT 1 FROM customer_unit_attempt_tariffs WHERE attempt_id = NEW.attempt_id) THEN
        RAISE EXCEPTION 'Credits media tariff conflicts with existing attempt accounting'
            USING ERRCODE = '23514';
    END IF;
    SELECT * INTO STRICT tariff FROM customer_unit_media_tariffs WHERE revision = NEW.revision;
    SELECT h.identity, q.maximum_quantity INTO STRICT identity, quantity
    FROM media_liability_qualifications q
    JOIN media_liability_qualification_heads h ON h.id = q.head_id
    LEFT JOIN media_liability_qualification_revocations r ON r.qualification_id = q.id
    WHERE q.id = NEW.qualification_revision
      AND q.effective_from <= NEW.selected_at
      AND LEAST(q.effective_until, COALESCE(r.effective_until, q.effective_until)) > NEW.selected_at;

    IF NOT EXISTS (
        SELECT 1 FROM attempts a
        WHERE a.id = NEW.attempt_id
          AND a.resource_id = tariff.model_alias
          AND a.offer_revision = identity->>'offer_revision'
    )
    OR identity->'dimensions' IS DISTINCT FROM tariff.price->'dimensions'
    OR identity->>'meter' IS DISTINCT FROM tariff.meter
    OR NEW.bound->>'meter' IS DISTINCT FROM tariff.meter
    OR NEW.bound->'maximum_quantity' IS DISTINCT FROM quantity
    OR NEW.bound->>'qualification_revision' IS DISTINCT FROM NEW.qualification_revision::text
    OR NEW.maximum_atoms::numeric IS DISTINCT FROM niu_customer_unit_media_bound(tariff.price, quantity)
    OR NOT EXISTS (
        SELECT 1 FROM provider_attempt_offers b
        JOIN media_recovery_routes route ON route.attempt_id = b.attempt_id
        WHERE b.attempt_id = NEW.attempt_id
          AND b.provider_id::text = identity->>'supplier_id'
          AND b.offer_id::text = identity->>'offer_id'
          AND b.revision_id::text = identity->>'offer_revision'
          AND route.vendor_id::text = identity->>'vendor_id'
          AND route.vendor_revision::text = identity->>'vendor_revision'
          AND route.model_revision::text = identity->>'model_revision'
          AND route.schema_revision = identity->>'schema_revision'
    ) THEN
        RAISE EXCEPTION 'Credits media tariff, qualification bound or route provenance conflicts'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_unit_media_attempt_tariff
    BEFORE INSERT ON customer_unit_media_attempt_tariffs
    FOR EACH ROW EXECUTE FUNCTION validate_customer_unit_media_attempt_tariff();
CREATE TRIGGER immutable_customer_unit_media_attempt_tariff
    BEFORE UPDATE OR DELETE ON customer_unit_media_attempt_tariffs
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE OR REPLACE FUNCTION separate_personal_media_accounting() RETURNS TRIGGER AS $$
BEGIN
    PERFORM id FROM attempts WHERE id = NEW.attempt_id FOR UPDATE;
    IF TG_TABLE_NAME = 'personal_attempt_routes' THEN
        IF EXISTS (SELECT 1 FROM customer_media_attempt_pricing WHERE attempt_id = NEW.attempt_id)
           OR EXISTS (SELECT 1 FROM customer_unit_media_attempt_tariffs WHERE attempt_id = NEW.attempt_id) THEN
            RAISE EXCEPTION 'personal route conflicts with customer media pricing' USING ERRCODE = '23514';
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id = NEW.attempt_id) THEN
            RAISE EXCEPTION 'customer media pricing conflicts with personal route' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_customer_meter_exclusivity() RETURNS TRIGGER AS $$
BEGIN
    PERFORM id FROM attempts WHERE id = NEW.attempt_id FOR UPDATE;
    IF TG_TABLE_NAME = 'customer_media_attempt_pricing' THEN
        IF EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id = NEW.attempt_id)
           OR EXISTS (SELECT 1 FROM customer_unit_attempt_tariffs WHERE attempt_id = NEW.attempt_id)
           OR EXISTS (SELECT 1 FROM customer_unit_media_attempt_tariffs WHERE attempt_id = NEW.attempt_id) THEN
            RAISE EXCEPTION 'customer text or Credits media tariff already bound' USING ERRCODE = '23514';
        END IF;
    ELSE
        IF EXISTS (SELECT 1 FROM customer_media_attempt_pricing WHERE attempt_id = NEW.attempt_id)
           OR EXISTS (SELECT 1 FROM customer_unit_media_attempt_tariffs WHERE attempt_id = NEW.attempt_id) THEN
            RAISE EXCEPTION 'customer media tariff already bound' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE old_constraint TEXT;
BEGIN
    SELECT conname INTO old_constraint FROM pg_constraint
        WHERE conrelid = 'customer_media_usage_observations'::regclass
          AND confrelid = 'customer_media_attempt_pricing'::regclass
          AND contype = 'f';
    IF old_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE customer_media_usage_observations DROP CONSTRAINT %I', old_constraint);
    END IF;
END;
$$;
ALTER TABLE customer_media_usage_observations
    ADD FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES attempts(organization_id, project_id, id);

CREATE FUNCTION validate_customer_media_usage_observation() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM customer_media_attempt_pricing
        WHERE organization_id = NEW.organization_id
          AND project_id = NEW.project_id
          AND attempt_id = NEW.attempt_id
    ) AND NOT EXISTS (
        SELECT 1 FROM customer_unit_media_attempt_tariffs
        WHERE organization_id = NEW.organization_id
          AND project_id = NEW.project_id
          AND attempt_id = NEW.attempt_id
    ) THEN
        RAISE EXCEPTION 'customer media usage observation requires a bound customer media tariff'
            USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_media_usage_observation
    BEFORE INSERT ON customer_media_usage_observations
    FOR EACH ROW EXECUTE FUNCTION validate_customer_media_usage_observation();

CREATE TABLE customer_unit_media_charges (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID PRIMARY KEY,
    revision BIGINT NOT NULL,
    charged_atoms BIGINT NOT NULL CHECK (charged_atoms >= 0),
    bound_exceeded BOOLEAN NOT NULL,
    usage JSONB NOT NULL CHECK (jsonb_typeof(usage) = 'object'),
    explanation JSONB NOT NULL CHECK (jsonb_typeof(explanation) = 'object'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    FOREIGN KEY (organization_id, project_id, attempt_id)
        REFERENCES customer_unit_media_attempt_tariffs(organization_id, project_id, attempt_id),
    FOREIGN KEY (attempt_id, revision)
        REFERENCES customer_unit_media_attempt_tariffs(attempt_id, revision)
);
CREATE TRIGGER immutable_customer_unit_media_charge
    BEFORE UPDATE OR DELETE ON customer_unit_media_charges
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE OR REPLACE FUNCTION validate_customer_unit_extension() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM a.organization_id FROM customer_unit_accounts a JOIN customer_unit_reservations r
        ON r.organization_id = a.organization_id WHERE r.attempt_id = NEW.attempt_id FOR NO KEY UPDATE OF a;
    IF NOT EXISTS (
        SELECT 1 FROM customer_unit_reservations r
        JOIN (
            SELECT attempt_id, charged_atoms FROM customer_unit_text_charges
            UNION ALL
            SELECT attempt_id, charged_atoms FROM customer_unit_media_charges
        ) c USING (attempt_id)
        WHERE r.attempt_id = NEW.attempt_id AND c.charged_atoms - r.maximum_atoms = NEW.additional_atoms
    ) OR EXISTS (SELECT 1 FROM customer_unit_resolutions WHERE attempt_id = NEW.attempt_id) THEN
        RAISE EXCEPTION 'Additional Credits capacity must match the unresolved original liability'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION niu_customer_unit_workspace_committed(
    p_organization UUID,
    p_project UUID,
    p_exclude_attempt UUID DEFAULT NULL
) RETURNS NUMERIC LANGUAGE sql VOLATILE AS $$
    SELECT COALESCE((
        SELECT SUM(s.charged_atoms)
        FROM customer_unit_reservations r
        JOIN customer_unit_resolutions s ON s.attempt_id = r.attempt_id
        WHERE r.organization_id = p_organization
          AND r.project_id = p_project
          AND (p_exclude_attempt IS NULL OR r.attempt_id <> p_exclude_attempt)
          AND s.kind = 'charge'
    ), 0)
    - COALESCE((
        SELECT SUM(rest.end_atom - rest.first_atom)
        FROM customer_unit_reservations r
        JOIN customer_unit_resolutions s ON s.attempt_id = r.attempt_id
        JOIN customer_unit_restorations rest ON rest.attempt_id = s.attempt_id
        WHERE r.organization_id = p_organization
          AND r.project_id = p_project
          AND (p_exclude_attempt IS NULL OR r.attempt_id <> p_exclude_attempt)
          AND s.kind = 'charge'
    ), 0)
    + COALESCE((
        SELECT SUM(GREATEST(
            r.maximum_atoms::numeric + COALESCE(e.additional_atoms, 0),
            COALESCE(c.charged_atoms, mc.charged_atoms, 0)::numeric
        ))
        FROM customer_unit_reservations r
        LEFT JOIN customer_unit_reservation_extensions e ON e.attempt_id = r.attempt_id
        LEFT JOIN customer_unit_text_charges c ON c.attempt_id = r.attempt_id
        LEFT JOIN customer_unit_media_charges mc ON mc.attempt_id = r.attempt_id
        WHERE r.organization_id = p_organization
          AND r.project_id = p_project
          AND (p_exclude_attempt IS NULL OR r.attempt_id <> p_exclude_attempt)
          AND NOT EXISTS (
              SELECT 1 FROM customer_unit_resolutions s
              WHERE s.attempt_id = r.attempt_id
          )
    ), 0)
$$;

CREATE OR REPLACE FUNCTION niu_customer_unit_key_committed(
    p_organization UUID,
    p_project UUID,
    p_root UUID,
    p_exclude_attempt UUID DEFAULT NULL
) RETURNS NUMERIC LANGUAGE sql VOLATILE AS $$
    WITH root_keys AS MATERIALIZED (
        SELECT organization_id, project_id, id
        FROM api_keys
        WHERE organization_id = p_organization
          AND project_id = p_project
          AND spending_root_id = p_root
    ),
    root_attempts AS MATERIALIZED (
        SELECT a.id AS attempt_id
        FROM root_keys k
        JOIN attempts a
          ON a.api_key_id = k.id
         AND a.organization_id = k.organization_id
         AND a.project_id = k.project_id
        UNION
        SELECT a.id AS attempt_id
        FROM root_keys k
        JOIN inspected_guardrail_bindings b ON b.key_id = k.id
        JOIN attempts a
          ON a.id = b.attempt_id
         AND a.organization_id = k.organization_id
         AND a.project_id = k.project_id
        UNION
        SELECT a.id AS attempt_id
        FROM root_keys k
        JOIN gateway_retry_policies rp ON rp.key_id = k.id
        JOIN attempts a
          ON a.operation_id = rp.operation_id
         AND a.organization_id = k.organization_id
         AND a.project_id = k.project_id
    )
    SELECT COALESCE((
        SELECT SUM(s.charged_atoms)
        FROM root_attempts ra
        JOIN customer_unit_reservations r ON r.attempt_id = ra.attempt_id
        JOIN customer_unit_resolutions s ON s.attempt_id = r.attempt_id
        WHERE r.organization_id = p_organization
          AND r.project_id = p_project
          AND (p_exclude_attempt IS NULL OR r.attempt_id <> p_exclude_attempt)
          AND s.kind = 'charge'
    ), 0)
    - COALESCE((
        SELECT SUM(rest.end_atom - rest.first_atom)
        FROM root_attempts ra
        JOIN customer_unit_reservations r ON r.attempt_id = ra.attempt_id
        JOIN customer_unit_resolutions s ON s.attempt_id = r.attempt_id
        JOIN customer_unit_restorations rest ON rest.attempt_id = s.attempt_id
        WHERE r.organization_id = p_organization
          AND r.project_id = p_project
          AND (p_exclude_attempt IS NULL OR r.attempt_id <> p_exclude_attempt)
          AND s.kind = 'charge'
    ), 0)
    + COALESCE((
        SELECT SUM(GREATEST(
            r.maximum_atoms::numeric + COALESCE(e.additional_atoms, 0),
            COALESCE(c.charged_atoms, mc.charged_atoms, 0)::numeric
        ))
        FROM root_attempts ra
        JOIN customer_unit_reservations r ON r.attempt_id = ra.attempt_id
        LEFT JOIN customer_unit_reservation_extensions e ON e.attempt_id = r.attempt_id
        LEFT JOIN customer_unit_text_charges c ON c.attempt_id = r.attempt_id
        LEFT JOIN customer_unit_media_charges mc ON mc.attempt_id = r.attempt_id
        WHERE r.organization_id = p_organization
          AND r.project_id = p_project
          AND (p_exclude_attempt IS NULL OR r.attempt_id <> p_exclude_attempt)
          AND NOT EXISTS (
              SELECT 1 FROM customer_unit_resolutions s
              WHERE s.attempt_id = r.attempt_id
          )
    ), 0)
$$;

CREATE OR REPLACE FUNCTION niu_guard_media_offer_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.execution = 'not_sent' AND NEW.execution = 'may_have_executed'
       AND EXISTS (
           SELECT 1 FROM provider_attempt_offers b
           JOIN provider_offer_revisions r ON r.id = b.revision_id
           WHERE b.attempt_id = NEW.id AND r.rate_kind = 'media'
       )
       AND (
           NOT EXISTS (SELECT 1 FROM supplier_media_attempt_pricing p WHERE p.attempt_id = NEW.id)
           OR NOT EXISTS (SELECT 1 FROM media_recovery_routes r WHERE r.attempt_id = NEW.id)
           OR NOT (
               (EXISTS (SELECT 1 FROM customer_media_attempt_pricing p WHERE p.attempt_id = NEW.id)
                AND EXISTS (SELECT 1 FROM customer_media_liability_bounds b WHERE b.attempt_id = NEW.id))
               OR
               (EXISTS (SELECT 1 FROM customer_unit_media_attempt_tariffs t WHERE t.attempt_id = NEW.id)
                AND EXISTS (SELECT 1 FROM customer_unit_reservations r WHERE r.attempt_id = NEW.id))
           )
       ) THEN
        RAISE EXCEPTION 'media offer requires pinned media pricing, liability and route'
            USING ERRCODE = 'P0007';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION guard_platform_media_liability_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE at BIGINT;
BEGIN
    IF OLD.execution <> 'not_sent' OR NEW.execution <> 'may_have_executed' THEN
        RETURN NEW;
    END IF;
    at := floor(extract(epoch FROM clock_timestamp()))::bigint;
    IF EXISTS (SELECT 1 FROM retail_media_attempt_prices p WHERE p.attempt_id = NEW.id) THEN
        IF NOT EXISTS (
            SELECT 1 FROM retail_media_attempt_prices p
            JOIN media_liability_qualifications q ON q.id = p.qualification_revision
            JOIN media_liability_qualification_heads h ON h.id = q.head_id
            LEFT JOIN media_liability_qualification_revocations revoked ON revoked.qualification_id = q.id
            JOIN provider_attempt_offers b ON b.attempt_id = p.attempt_id
            JOIN provider_offers o ON o.id = b.offer_id AND o.provider_id = b.provider_id
            JOIN vendors v ON v.id = o.vendor_id JOIN vendor_models m ON m.vendor_id = v.id AND m.alias = o.model_alias
            JOIN media_recovery_routes route ON route.attempt_id = p.attempt_id
            JOIN customer_media_attempt_pricing price ON price.attempt_id = p.attempt_id
            JOIN customer_media_liability_bounds bound ON bound.attempt_id = p.attempt_id
            WHERE p.attempt_id = NEW.id AND p.organization_id = NEW.organization_id AND p.project_id = NEW.project_id
              AND q.effective_from <= at AND LEAST(q.effective_until, COALESCE(revoked.effective_until, q.effective_until)) > at
              AND b.provider_id = h.supplier_id AND b.offer_id = h.offer_id AND b.revision_id = h.offer_revision
              AND o.current_revision = b.revision_id AND o.active AND v.enabled AND m.enabled
              AND v.id::text = h.identity->>'vendor_id' AND v.revision::text = h.identity->>'vendor_revision'
              AND m.alias = h.identity->>'model_alias' AND m.revision::text = h.identity->>'model_revision'
              AND m.capabilities->'video_schema'->>'revision' = h.identity->>'schema_revision'
              AND route.vendor_id = v.id AND route.vendor_revision = v.revision AND route.model_revision = m.revision
              AND route.schema_revision = h.identity->>'schema_revision'
              AND price.snapshot->'discounts' = '[]'::jsonb
              AND price.snapshot->>'customer' = p.organization_id::text
              AND price.snapshot->>'selected_at' = p.selected_at::text
              AND price.snapshot->'tariff'->>'currency' = p.selection->>'currency'
              AND price.snapshot->'tariff'->>'revision' = COALESCE(p.promotion_revision, p.baseline_revision)::text
              AND price.snapshot->>'offer' = b.revision_id::text
              AND jsonb_build_object('dimensions', price.snapshot->'tariff'->'dimensions',
                  'meter', price.snapshot->'tariff'->'meter', 'decimal_places', price.snapshot->'tariff'->'decimal_places',
                  'amount_units', price.snapshot->'tariff'->>'amount_units',
                  'per_quantity', price.snapshot->'tariff'->'per_quantity',
                  'minimum_quantity', price.snapshot->'tariff'->'minimum_quantity',
                  'rounding', price.snapshot->'tariff'->'rounding') = (p.selection->'schedule') - 'kind'
              AND price.snapshot->'tariff'->'dimensions' = h.identity->'dimensions'
              AND bound.bound->'maximum_quantity' = q.maximum_quantity
              AND bound.bound->>'meter' = h.identity->>'meter'
              AND bound.bound->>'qualification_revision' = q.id::text
              AND niu_offer_qualification_current(b.provider_id, b.offer_id, b.revision_id)
        ) THEN
            RAISE EXCEPTION 'Platform media liability qualification changed before dispatch' USING ERRCODE = 'P0007';
        END IF;
    ELSIF EXISTS (SELECT 1 FROM customer_unit_media_attempt_tariffs p WHERE p.attempt_id = NEW.id) THEN
        IF NOT EXISTS (
            SELECT 1 FROM customer_unit_media_attempt_tariffs p
            JOIN customer_unit_media_tariffs tariff ON tariff.revision = p.revision
            JOIN media_liability_qualifications q ON q.id = p.qualification_revision
            JOIN media_liability_qualification_heads h ON h.id = q.head_id
            LEFT JOIN media_liability_qualification_revocations revoked ON revoked.qualification_id = q.id
            JOIN provider_attempt_offers b ON b.attempt_id = p.attempt_id
            JOIN provider_offers o ON o.id = b.offer_id AND o.provider_id = b.provider_id
            JOIN vendors v ON v.id = o.vendor_id JOIN vendor_models m ON m.vendor_id = v.id AND m.alias = o.model_alias
            JOIN media_recovery_routes route ON route.attempt_id = p.attempt_id
            WHERE p.attempt_id = NEW.id AND p.organization_id = NEW.organization_id AND p.project_id = NEW.project_id
              AND q.effective_from <= at AND LEAST(q.effective_until, COALESCE(revoked.effective_until, q.effective_until)) > at
              AND b.provider_id = h.supplier_id AND b.offer_id = h.offer_id AND b.revision_id = h.offer_revision
              AND o.current_revision = b.revision_id AND o.active AND v.enabled AND m.enabled
              AND v.id::text = h.identity->>'vendor_id' AND v.revision::text = h.identity->>'vendor_revision'
              AND m.alias = h.identity->>'model_alias' AND m.revision::text = h.identity->>'model_revision'
              AND m.capabilities->'video_schema'->>'revision' = h.identity->>'schema_revision'
              AND route.vendor_id = v.id AND route.vendor_revision = v.revision AND route.model_revision = m.revision
              AND route.schema_revision = h.identity->>'schema_revision'
              AND tariff.price->'dimensions' = h.identity->'dimensions'
              AND tariff.meter = h.identity->>'meter'
              AND p.bound->'maximum_quantity' = q.maximum_quantity
              AND p.bound->>'meter' = h.identity->>'meter'
              AND p.bound->>'qualification_revision' = q.id::text
              AND p.maximum_atoms::numeric = niu_customer_unit_media_bound(tariff.price, q.maximum_quantity)
              AND niu_offer_qualification_current(b.provider_id, b.offer_id, b.revision_id)
        ) THEN
            RAISE EXCEPTION 'Platform media liability qualification changed before dispatch' USING ERRCODE = 'P0007';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION require_customer_balance_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE mode TEXT;
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    END IF;
    SELECT billing_mode INTO STRICT mode FROM customer_unit_configuration WHERE singleton FOR SHARE;
    PERFORM id FROM organizations WHERE id = NEW.organization_id FOR SHARE;
    IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id = NEW.id) THEN
        PERFORM v.id FROM vendors v JOIN personal_attempt_routes b ON b.vendor_id = v.id
            WHERE b.attempt_id = NEW.id FOR SHARE OF v;
        PERFORM m.alias FROM vendor_models m WHERE m.alias = COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id = NEW.id), NEW.resource_id) FOR SHARE;
        IF NOT EXISTS (
            SELECT 1 FROM personal_attempt_routes b
            JOIN personal_vendor_ownership o ON o.vendor_id = b.vendor_id
            JOIN vendors v ON v.id = b.vendor_id
            JOIN vendor_models m ON m.vendor_id = v.id AND m.alias = COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id = NEW.id), NEW.resource_id)
            JOIN api_keys k ON k.id = NEW.api_key_id
            JOIN inspected_guardrail_bindings g ON g.attempt_id = NEW.id AND g.key_id = k.id
            WHERE b.attempt_id = NEW.id AND o.organization_id = NEW.organization_id
                AND v.enabled AND m.enabled
                AND v.revision = b.vendor_revision AND m.revision = b.model_revision
                AND NEW.dispatch_provider = v.adapter
                AND k.organization_id = NEW.organization_id AND k.project_id = NEW.project_id
                AND k.revoked_at IS NULL AND k.expires_at > clock_timestamp()
                AND ('*' = ANY(k.allowed_models) OR NEW.resource_id = ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION 'personal dispatch ownership, policy or route changed' USING ERRCODE = 'P0011';
        END IF;
        IF EXISTS (SELECT 1 FROM customer_unit_attempt_tariffs WHERE attempt_id = NEW.id)
            OR EXISTS (SELECT 1 FROM customer_unit_media_attempt_tariffs WHERE attempt_id = NEW.id)
            OR EXISTS (SELECT 1 FROM customer_unit_reservations WHERE attempt_id = NEW.id)
            OR EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id = NEW.id)
            OR EXISTS (SELECT 1 FROM provider_attempt_offers WHERE attempt_id = NEW.id)
            OR EXISTS (SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id = NEW.id)
            OR EXISTS (SELECT 1 FROM account_assignments WHERE attempt_id = NEW.id) THEN
            RAISE EXCEPTION 'personal dispatch has incompatible accounting' USING ERRCODE = 'P0011';
        END IF;
        RETURN NEW;
    END IF;
    IF mode = 'credits' THEN
        IF EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id = NEW.id)
            OR EXISTS (SELECT 1 FROM customer_media_attempt_pricing WHERE attempt_id = NEW.id)
            OR EXISTS (SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id = NEW.id)
            OR (EXISTS (SELECT 1 FROM customer_unit_attempt_tariffs WHERE attempt_id = NEW.id)
                AND EXISTS (SELECT 1 FROM customer_unit_media_attempt_tariffs WHERE attempt_id = NEW.id))
            OR NOT (
                EXISTS (
                    SELECT 1 FROM customer_unit_attempt_tariffs t
                    JOIN customer_unit_text_tariffs p USING(revision)
                    JOIN customer_unit_reservations r ON r.attempt_id = t.attempt_id AND r.definition_revision = p.definition_revision
                    JOIN cost_reservations b ON b.attempt_id = r.attempt_id AND b.state = 'held'
                    WHERE t.attempt_id = NEW.id AND r.organization_id = NEW.organization_id AND r.project_id = NEW.project_id
                        AND r.maximum_atoms = niu_customer_unit_text_bound(p.price, b.prompt_bound, b.completion_bound)
                        AND r.maximum_atoms = (SELECT COALESCE(sum(end_atom - first_atom), 0)
                            FROM customer_unit_reserved_ranges WHERE attempt_id = NEW.id)
                        AND NOT EXISTS (SELECT 1 FROM customer_unit_resolutions WHERE attempt_id = NEW.id)
                )
                OR EXISTS (
                    SELECT 1 FROM customer_unit_media_attempt_tariffs t
                    JOIN customer_unit_media_tariffs p USING(revision)
                    JOIN customer_unit_reservations r ON r.attempt_id = t.attempt_id AND r.definition_revision = p.definition_revision
                    WHERE t.attempt_id = NEW.id AND r.organization_id = NEW.organization_id AND r.project_id = NEW.project_id
                        AND r.maximum_atoms = t.maximum_atoms
                        AND r.maximum_atoms::numeric = niu_customer_unit_media_bound(p.price, t.bound->'maximum_quantity')
                        AND r.maximum_atoms = (SELECT COALESCE(sum(end_atom - first_atom), 0)
                            FROM customer_unit_reserved_ranges WHERE attempt_id = NEW.id)
                        AND NOT EXISTS (SELECT 1 FROM customer_unit_resolutions WHERE attempt_id = NEW.id)
                )
            ) THEN
            RAISE EXCEPTION 'Credits dispatch requires its pinned unit price and fully funded ranges' USING ERRCODE = 'P0009';
        END IF;
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM customer_unit_attempt_tariffs WHERE attempt_id = NEW.id)
        OR EXISTS (SELECT 1 FROM customer_unit_media_attempt_tariffs WHERE attempt_id = NEW.id)
        OR EXISTS (SELECT 1 FROM customer_unit_reservations WHERE attempt_id = NEW.id) THEN
        RAISE EXCEPTION 'Currency dispatch cannot reuse Credits accounting' USING ERRCODE = 'P0009';
    END IF;
    IF EXISTS (SELECT 1 FROM customer_balance_accounts WHERE organization_id = NEW.organization_id)
        AND NOT EXISTS (SELECT 1 FROM customer_balance_reservations
            WHERE attempt_id = NEW.id AND organization_id = NEW.organization_id AND released_at IS NULL)
        AND NOT EXISTS (
            SELECT 1 FROM customer_attempt_tariffs t
            JOIN customer_tariff_revisions r ON r.id = t.revision_id
            JOIN customer_attempt_balance_accounts b ON b.attempt_id = t.attempt_id AND b.currency = r.currency
            WHERE t.attempt_id = NEW.id AND b.organization_id = NEW.organization_id
                AND r.prompt_rate = 0 AND r.completion_rate = 0 AND COALESCE(r.cached_prompt_rate, 0) = 0
                AND COALESCE(r.reasoning_completion_rate, 0) = 0 AND COALESCE(r.cache_write_prompt_rate, 0) = 0
                AND r.minimum_charge_nanos = 0 AND r.request_fee_nanos = 0
                AND NOT EXISTS (
                    SELECT 1 FROM jsonb_array_elements(r.context_tiers) tier
                    JOIN cost_reservations bound ON bound.attempt_id = NEW.id
                    WHERE (tier->>'minimum_input_tokens')::bigint <= bound.prompt_bound
                      AND ((tier->>'prompt_rate')::bigint > 0 OR (tier->>'completion_rate')::bigint > 0
                        OR COALESCE((tier->>'cached_prompt_rate')::bigint, 0) > 0
                        OR COALESCE((tier->>'cache_write_prompt_rate')::bigint, 0) > 0
                        OR COALESCE((tier->>'reasoning_completion_rate')::bigint, 0) > 0)
                )
        ) THEN
        RAISE EXCEPTION 'prepaid dispatch requires a funded retail reservation' USING ERRCODE = 'P0009';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION niu_customer_unit_mode_preview(TEXT) RETURNS JSONB LANGUAGE SQL VOLATILE AS $preview$
WITH configuration AS MATERIALIZED (
    SELECT c.*, (SELECT max(revision) FROM customer_unit_definitions) AS definition_revision,
        (SELECT currency FROM platform_currency WHERE singleton) AS payment_currency
    FROM customer_unit_configuration c WHERE singleton
), consumed AS (
    SELECT lot_id, sum(end_atom - first_atom) AS atoms
    FROM customer_unit_consumed_ranges GROUP BY lot_id
), restored AS (
    SELECT c.lot_id, sum(LEAST(r.end_atom, c.charge_offset + c.end_atom - c.first_atom)
        - GREATEST(r.first_atom, c.charge_offset)) AS atoms
    FROM customer_unit_consumed_ranges c JOIN customer_unit_restorations r
        ON r.attempt_id = c.attempt_id AND r.first_atom < c.charge_offset + c.end_atom - c.first_atom
        AND r.end_atom > c.charge_offset GROUP BY c.lot_id
), reversed AS (
    SELECT lot_id, sum(end_atom - first_atom) AS atoms
    FROM customer_unit_purchase_reversal_ranges GROUP BY lot_id
), facts(category, organization_id) AS MATERIALIZED (
    SELECT 'monetary_balance', organization_id FROM customer_balance_accounts WHERE posted_balance_nanos <> 0
    UNION ALL SELECT 'monetary_credit_facility', organization_id FROM customer_balance_accounts WHERE credit_limit_nanos > 0
    UNION ALL SELECT 'monetary_reservation', organization_id FROM customer_balance_reservations WHERE released_at IS NULL
    UNION ALL SELECT 'unposted_monetary_charge', c.organization_id FROM (
        SELECT attempt_id, organization_id, amount_nanos FROM customer_charges
        UNION ALL SELECT attempt_id, organization_id, amount_nanos FROM customer_media_charges
    ) c WHERE c.amount_nanos > 0 AND NOT EXISTS (
        SELECT 1 FROM customer_balance_entries e WHERE e.attempt_id = c.attempt_id AND e.kind = 'charge')
    UNION ALL SELECT 'pending_checkout', o.organization_id FROM customer_topup_orders o
        WHERE NOT EXISTS(SELECT 1 FROM customer_topup_settlements s WHERE s.order_id = o.id)
          AND NOT EXISTS(SELECT 1 FROM customer_topup_closures c WHERE c.order_id = o.id)
    UNION ALL SELECT 'unapplied_monetary_grant', p.organization_id FROM prepared_customer_balance_grants p
        WHERE NOT EXISTS(SELECT 1 FROM customer_balance_grants g
            WHERE g.organization_id = p.organization_id AND g.idempotency_key = p.idempotency_key)
    UNION ALL SELECT 'remaining_credits', l.organization_id FROM customer_unit_lots l
        LEFT JOIN consumed c ON c.lot_id = l.id
        LEFT JOIN restored r ON r.lot_id = l.id
        LEFT JOIN reversed rev ON rev.lot_id = l.id
        WHERE (l.expires_at IS NULL OR l.expires_at > statement_timestamp())
          AND l.credit_atoms - COALESCE(rev.atoms, 0) - COALESCE(c.atoms, 0) + COALESCE(r.atoms, 0) > 0
    UNION ALL SELECT 'credits_reservation', r.organization_id FROM customer_unit_reservations r
        WHERE NOT EXISTS(SELECT 1 FROM customer_unit_resolutions s WHERE s.attempt_id = r.attempt_id)
    UNION ALL SELECT 'unresolved_credits_charge', r.organization_id FROM (
        SELECT attempt_id FROM customer_unit_text_charges
        UNION ALL SELECT attempt_id FROM customer_unit_media_charges
    ) c JOIN customer_unit_reservations r USING(attempt_id)
        WHERE NOT EXISTS(SELECT 1 FROM customer_unit_resolutions s WHERE s.attempt_id = c.attempt_id)
    UNION ALL SELECT 'unsettled_customer_request', a.organization_id FROM attempts a
        WHERE (EXISTS(SELECT 1 FROM customer_attempt_tariffs t WHERE t.attempt_id = a.id)
            OR EXISTS(SELECT 1 FROM customer_media_attempt_pricing t WHERE t.attempt_id = a.id)
            OR EXISTS(SELECT 1 FROM customer_unit_attempt_tariffs t WHERE t.attempt_id = a.id)
            OR EXISTS(SELECT 1 FROM customer_unit_media_attempt_tariffs t WHERE t.attempt_id = a.id))
          AND (a.execution = 'may_have_executed' OR (a.execution = 'confirmed_completed'
            AND NOT EXISTS(SELECT 1 FROM customer_charges c WHERE c.attempt_id = a.id)
            AND NOT EXISTS(SELECT 1 FROM customer_media_charges c WHERE c.attempt_id = a.id)
            AND NOT EXISTS(SELECT 1 FROM customer_unit_resolutions c WHERE c.attempt_id = a.id AND c.kind = 'charge')))
    UNION ALL SELECT 'missing_unit_definition', NULL::uuid FROM configuration
        WHERE $1 = 'credits' AND definition_revision IS NULL
    UNION ALL SELECT 'missing_payment_currency', NULL::uuid FROM configuration
        WHERE $1 = 'credits' AND payment_currency IS NULL
    UNION ALL SELECT 'missing_purchase_rule', NULL::uuid FROM configuration c
        WHERE $1 = 'credits' AND c.payment_currency IS NOT NULL AND NOT EXISTS(SELECT 1 FROM customer_unit_purchase_rules r
            WHERE r.definition_revision = c.definition_revision AND r.payment_currency = c.payment_currency)
), categories AS (
    SELECT category, count(*) AS records, count(DISTINCT organization_id) AS organizations
    FROM facts GROUP BY category
), accounts AS (
    SELECT f.category, f.organization_id, o.name, count(*) AS records,
        row_number() OVER(PARTITION BY f.category ORDER BY o.name, f.organization_id) AS ordinal
    FROM facts f JOIN organizations o ON o.id = f.organization_id
    GROUP BY f.category, f.organization_id, o.name
)
SELECT jsonb_build_object(
    'revision', c.revision::text, 'billing_mode', c.billing_mode, 'target_mode', $1::text,
    'change_required', c.billing_mode <> $1, 'blockers_empty', NOT EXISTS(SELECT 1 FROM facts),
    'observed_at', to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'blockers', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'category', g.category, 'record_count', g.records::text, 'organization_count', g.organizations::text,
        'accounts_truncated', g.organizations > 100,
        'accounts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'organization_id', a.organization_id, 'name', a.name, 'record_count', a.records::text
        ) ORDER BY a.ordinal) FROM accounts a WHERE a.category = g.category AND a.ordinal <= 100), '[]'::jsonb)
    ) ORDER BY g.category) FROM categories g), '[]'::jsonb),
    'preserved_configuration', jsonb_build_object(
        'monetary_workspace_limits', (SELECT count(*)::text FROM customer_workspace_spending_limits),
        'monetary_key_limits', (SELECT count(*)::text FROM customer_key_spending_limits WHERE limit_nanos IS NOT NULL),
        'monetary_text_tariffs', (SELECT count(*)::text FROM customer_tariffs WHERE current_revision IS NOT NULL),
        'monetary_retail_prices', (SELECT count(*)::text FROM platform_retail_price_heads WHERE current_revision IS NOT NULL),
        'monetary_media_rate_history', (SELECT count(*)::text FROM customer_media_rate_cards),
        'credits_text_tariffs', (SELECT count(DISTINCT model_alias)::text FROM customer_unit_text_tariffs)
    )
) FROM configuration c
$preview$;

CREATE OR REPLACE FUNCTION niu_lock_customer_unit_mode_change() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    LOCK TABLE attempts, customer_balance_accounts, customer_balance_entries,
        customer_balance_reservations, customer_charges, customer_media_charges,
        customer_topup_orders, customer_topup_settlements, customer_topup_closures,
        prepared_customer_balance_grants, customer_balance_grants,
        customer_unit_lots, customer_unit_purchase_reversals, customer_unit_purchase_reversal_ranges,
        customer_unit_reservations, customer_unit_reserved_ranges,
        customer_unit_resolutions, customer_unit_restorations,
        customer_unit_text_charges, customer_unit_media_charges,
        customer_attempt_tariffs, customer_media_attempt_pricing,
        customer_unit_attempt_tariffs, customer_unit_media_attempt_tariffs
        IN SHARE MODE NOWAIT;
END;
$$;
