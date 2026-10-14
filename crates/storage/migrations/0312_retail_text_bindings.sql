-- Explicit enrollment; legacy workspace tariffs are neither replaced nor
-- backfilled. Disabling enrollment changes only future unpinned operations.
CREATE TABLE retail_text_enrollments (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    model_alias TEXT NOT NULL CHECK (length(model_alias) BETWEEN 1 AND 200),
    price_id UUID REFERENCES platform_retail_price_heads(id),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    PRIMARY KEY (organization_id, project_id, model_alias),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id)
);
CREATE TABLE retail_text_enrollment_changes (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    model_alias TEXT NOT NULL,
    price_id UUID REFERENCES platform_retail_price_heads(id),
    version BIGINT NOT NULL CHECK (version > 0),
    idempotency_key UUID NOT NULL,
    intent JSONB NOT NULL CHECK (jsonb_typeof(intent) = 'object'),
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500
        AND reason = trim(reason) AND reason !~ '[[:cntrl:]]'),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, project_id, model_alias, version),
    UNIQUE (organization_id, project_id, idempotency_key),
    FOREIGN KEY (organization_id, project_id, model_alias)
        REFERENCES retail_text_enrollments(organization_id, project_id, model_alias),
    CHECK ((actor_kind = 'installation' AND actor_operator_id IS NULL)
        OR (actor_kind = 'operator' AND actor_operator_id IS NOT NULL))
);
CREATE FUNCTION protect_retail_text_enrollment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.version <> 0 OR NEW.price_id IS NOT NULL THEN
            RAISE EXCEPTION 'New retail enrollment must start in legacy mode at version zero'
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    IF TG_OP = 'DELETE' OR ROW(NEW.organization_id, NEW.project_id, NEW.model_alias)
        IS DISTINCT FROM ROW(OLD.organization_id, OLD.project_id, OLD.model_alias)
        OR NEW.version <> OLD.version + 1 THEN
        RAISE EXCEPTION 'Retail enrollment identity is immutable and requires a new version'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.price_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM platform_retail_price_heads h
        WHERE h.id = NEW.price_id AND h.rate_kind = 'text' AND h.model_alias = NEW.model_alias
          AND h.current_revision IS NOT NULL
          AND EXISTS (SELECT 1 FROM customer_balance_accounts account
              WHERE account.organization_id=NEW.organization_id AND account.currency=h.currency)
    ) THEN
        RAISE EXCEPTION 'Retail enrollment requires the matching published text identity'
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM retail_text_enrollment_changes c
        WHERE c.organization_id = NEW.organization_id AND c.project_id = NEW.project_id
          AND c.model_alias = NEW.model_alias AND c.version = NEW.version
          AND c.price_id IS NOT DISTINCT FROM NEW.price_id) THEN
        RAISE EXCEPTION 'Retail enrollment requires its exact publication history'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_retail_text_enrollment BEFORE INSERT OR UPDATE OR DELETE ON retail_text_enrollments
    FOR EACH ROW EXECUTE FUNCTION protect_retail_text_enrollment();
CREATE TRIGGER immutable_retail_text_enrollment_change
    BEFORE UPDATE OR DELETE ON retail_text_enrollment_changes
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- Concrete revisions reuse the existing text arithmetic and baseline FK.
-- Materialization never changes customer_tariffs.current_revision.
CREATE TABLE retail_text_materializations (
    revision_id UUID PRIMARY KEY,
    tariff_id UUID NOT NULL,
    price_id UUID NOT NULL,
    standard_revision UUID NOT NULL,
    promotion_revision UUID,
    FOREIGN KEY (tariff_id, revision_id) REFERENCES customer_tariff_revisions(tariff_id, id),
    FOREIGN KEY (price_id, standard_revision) REFERENCES platform_retail_standard_revisions(head_id, id),
    FOREIGN KEY (price_id, promotion_revision) REFERENCES platform_retail_promotions(head_id, id)
);
CREATE UNIQUE INDEX retail_text_standard_materialization_once
    ON retail_text_materializations(tariff_id, standard_revision) WHERE promotion_revision IS NULL;
CREATE UNIQUE INDEX retail_text_promotion_materialization_once
    ON retail_text_materializations(tariff_id, standard_revision, promotion_revision)
    WHERE promotion_revision IS NOT NULL;
CREATE FUNCTION validate_retail_text_materialization() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE schedule JSONB; baseline UUID; concrete JSONB; head_currency TEXT; alias TEXT;
BEGIN
    SELECT h.currency, h.model_alias INTO STRICT head_currency, alias
        FROM platform_retail_price_heads h WHERE h.id = NEW.price_id AND h.rate_kind = 'text';
    IF NEW.promotion_revision IS NULL THEN
        SELECT s.schedule INTO STRICT schedule FROM platform_retail_standard_revisions s
            WHERE s.id = NEW.standard_revision AND s.head_id = NEW.price_id;
        baseline := NULL;
    ELSE
        SELECT p.schedule INTO STRICT schedule FROM platform_retail_promotions p
            WHERE p.id = NEW.promotion_revision AND p.head_id = NEW.price_id
              AND p.baseline_revision = NEW.standard_revision;
        SELECT m.revision_id INTO STRICT baseline FROM retail_text_materializations m
            WHERE m.tariff_id = NEW.tariff_id AND m.standard_revision = NEW.standard_revision
              AND m.promotion_revision IS NULL;
    END IF;
    SELECT jsonb_build_object('prompt_rate', r.prompt_rate::text,
        'completion_rate', r.completion_rate::text, 'cached_prompt_rate', r.cached_prompt_rate::text,
        'cache_write_prompt_rate', r.cache_write_prompt_rate::text,
        'reasoning_completion_rate', r.reasoning_completion_rate::text,
        'minimum_charge_nanos', r.minimum_charge_nanos::text, 'request_fee_nanos', r.request_fee_nanos::text,
        'context_tiers', r.context_tiers) INTO STRICT concrete
        FROM customer_tariff_revisions r JOIN customer_tariffs t ON t.id = r.tariff_id
        WHERE r.id = NEW.revision_id AND r.tariff_id = NEW.tariff_id
          AND r.currency = head_currency AND t.model_alias = alias
          AND r.discount_baseline_revision IS NOT DISTINCT FROM baseline;
    IF concrete IS DISTINCT FROM (schedule - 'kind') THEN
        RAISE EXCEPTION 'Materialized text price differs from its published schedule'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_retail_text_materialization BEFORE INSERT ON retail_text_materializations
    FOR EACH ROW EXECUTE FUNCTION validate_retail_text_materialization();
CREATE TRIGGER immutable_retail_text_materialization BEFORE UPDATE OR DELETE ON retail_text_materializations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE TABLE retail_text_operation_prices (
    operation_id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    revision_id UUID NOT NULL REFERENCES retail_text_materializations(revision_id),
    selected_at BIGINT NOT NULL CHECK (selected_at >= 0),
    promotion_scope TEXT CHECK (promotion_scope IN ('global', 'customer')),
    FOREIGN KEY (organization_id, project_id, operation_id)
        REFERENCES operations(organization_id, project_id, id)
);
CREATE FUNCTION validate_retail_text_operation_price() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE selected_promotion UUID; selected_customer UUID; bound_revision UUID;
BEGIN
    SELECT m.promotion_revision INTO STRICT selected_promotion
        FROM retail_text_materializations m
        JOIN customer_tariffs t ON t.id = m.tariff_id JOIN operations o ON o.id = NEW.operation_id
        WHERE m.revision_id = NEW.revision_id AND t.organization_id = NEW.organization_id
          AND t.project_id = NEW.project_id AND t.model_alias = o.model_alias;
    SELECT revision_id INTO STRICT bound_revision FROM customer_operation_tariffs
        WHERE operation_id = NEW.operation_id;
    IF bound_revision <> NEW.revision_id THEN
        RAISE EXCEPTION 'Retail provenance must match the pinned operation price' USING ERRCODE = '23514';
    END IF;
    IF selected_promotion IS NULL THEN
        IF NEW.promotion_scope IS NOT NULL THEN
            RAISE EXCEPTION 'Standard price cannot claim a promotion scope' USING ERRCODE = '23514';
        END IF;
    ELSE
        SELECT customer_organization_id INTO STRICT selected_customer
            FROM platform_retail_promotions p WHERE id = selected_promotion
              AND p.effective_from <= NEW.selected_at AND p.effective_until > NEW.selected_at
              AND NOT EXISTS (SELECT 1 FROM platform_retail_promotion_retirements r
                  WHERE r.promotion_id = p.id AND r.effective_until <= NEW.selected_at);
        IF (selected_customer IS NULL AND NEW.promotion_scope IS DISTINCT FROM 'global')
            OR (selected_customer IS NOT NULL AND (selected_customer <> NEW.organization_id
                OR NEW.promotion_scope IS DISTINCT FROM 'customer')) THEN
            RAISE EXCEPTION 'Retail promotion customer scope conflicts' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_retail_text_operation_price BEFORE INSERT ON retail_text_operation_prices
    FOR EACH ROW EXECUTE FUNCTION validate_retail_text_operation_price();
CREATE TRIGGER immutable_retail_text_operation_price BEFORE UPDATE OR DELETE ON retail_text_operation_prices
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
