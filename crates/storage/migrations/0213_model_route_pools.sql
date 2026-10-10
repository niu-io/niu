-- Customer aliases remain distinct from selected credential/model mappings.
CREATE TABLE model_route_pools (
    alias TEXT PRIMARY KEY CHECK (length(alias) BETWEEN 1 AND 200 AND alias=btrim(alias)),
    organization_id UUID REFERENCES organizations(id),
    enabled BOOLEAN NOT NULL,
    revision BIGINT NOT NULL CHECK (revision>0),
    candidates JSONB NOT NULL CHECK (jsonb_typeof(candidates)='array' AND jsonb_array_length(candidates) BETWEEN 1 AND 64)
);
CREATE TABLE model_route_pool_history (
    alias TEXT NOT NULL REFERENCES model_route_pools(alias),
    revision BIGINT NOT NULL,
    organization_id UUID REFERENCES organizations(id),
    enabled BOOLEAN NOT NULL,
    candidates JSONB NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(alias,revision)
);
CREATE FUNCTION protect_model_route_pool() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' OR (TG_OP='UPDATE' AND
        (NEW.alias<>OLD.alias OR NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.revision<>OLD.revision+1))
        OR (TG_OP='INSERT' AND NEW.revision<>1) THEN
        RAISE EXCEPTION 'route pool identity or revision conflict' USING ERRCODE='P0024';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_model_route_pool BEFORE INSERT OR UPDATE OR DELETE ON model_route_pools
    FOR EACH ROW EXECUTE FUNCTION protect_model_route_pool();
CREATE FUNCTION protect_model_route_pool_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'route pool history is immutable' USING ERRCODE='P0024'; END;
$$;
CREATE TRIGGER protect_model_route_pool_history BEFORE UPDATE OR DELETE ON model_route_pool_history
    FOR EACH ROW EXECUTE FUNCTION protect_model_route_pool_history();
ALTER TABLE managed_attempt_routes ADD COLUMN pool_alias TEXT REFERENCES model_route_pools(alias);
ALTER TABLE managed_attempt_routes ADD COLUMN pool_revision BIGINT;
ALTER TABLE managed_attempt_routes ADD CHECK ((pool_alias IS NULL)=(pool_revision IS NULL));
ALTER TABLE managed_attempt_routes ADD FOREIGN KEY(pool_alias,pool_revision) REFERENCES model_route_pool_history(alias,revision);

CREATE OR REPLACE FUNCTION recheck_managed_attempt_route() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE binding managed_attempt_routes%ROWTYPE;
BEGIN
    IF NEW.execution<>'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.execution<>'not_sent' THEN RETURN NEW; END IF;
    SELECT * INTO binding FROM managed_attempt_routes WHERE attempt_id=NEW.id;
    IF NOT FOUND THEN RETURN NEW; END IF; -- Static/legacy dispatch remains compatible.
    IF binding.pool_alias IS NOT NULL THEN
        PERFORM alias FROM model_route_pools WHERE alias=binding.pool_alias FOR SHARE;
        IF NOT EXISTS (
            SELECT 1 FROM model_route_pools p
            WHERE p.alias=binding.pool_alias AND p.alias=NEW.resource_id
              AND p.enabled AND p.revision=binding.pool_revision
              AND (p.organization_id IS NULL OR p.organization_id=NEW.organization_id)
              AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.candidates) c
                  WHERE c->>'alias'=binding.model_alias AND (c->>'enabled')::boolean)
              AND ((p.organization_id IS NULL AND NOT EXISTS(
                  SELECT 1 FROM personal_vendor_ownership o WHERE o.vendor_id=binding.vendor_id))
                  OR EXISTS(SELECT 1 FROM personal_vendor_ownership o
                      WHERE o.vendor_id=binding.vendor_id AND o.organization_id=p.organization_id))
        ) THEN
            RAISE EXCEPTION 'route pool changed before dispatch' USING ERRCODE='P0024';
        END IF;
    END IF;
    PERFORM id FROM vendors WHERE id=binding.vendor_id FOR SHARE;
    PERFORM alias FROM vendor_models WHERE alias=binding.model_alias FOR SHARE;
    IF NOT EXISTS (
        SELECT 1 FROM vendor_models m JOIN vendors v ON v.id=m.vendor_id
        WHERE m.alias=binding.model_alias AND (binding.pool_alias=NEW.resource_id OR (binding.pool_alias IS NULL AND m.alias=NEW.resource_id))
          AND v.id=binding.vendor_id AND v.enabled AND m.enabled
          AND v.revision=binding.vendor_revision AND m.revision=binding.model_revision
          AND v.adapter=NEW.dispatch_provider
          AND NOT EXISTS (SELECT 1 FROM personal_vendor_ownership o
              WHERE o.vendor_id=v.id AND o.organization_id<>NEW.organization_id)
    ) THEN
        RAISE EXCEPTION 'managed route changed before dispatch' USING ERRCODE='P0024';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION validate_personal_attempt_route() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'personal attempt route is immutable' USING ERRCODE='P0008';
    END IF;
    -- Lock the credential before the model, matching model configuration writes.
    PERFORM id FROM vendors WHERE id=NEW.vendor_id FOR SHARE;
    PERFORM m.alias FROM vendor_models m JOIN attempts a ON COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=a.id),a.resource_id)=m.alias
        WHERE a.id=NEW.attempt_id FOR SHARE OF m;
    PERFORM id FROM attempts WHERE id=NEW.attempt_id FOR UPDATE;
    IF NOT EXISTS (
        SELECT 1 FROM attempts a
        JOIN vendor_models m ON m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=a.id),a.resource_id)
        JOIN vendors v ON v.id=m.vendor_id
        JOIN personal_vendor_ownership o ON o.vendor_id=v.id
        WHERE a.id=NEW.attempt_id AND a.execution='not_sent'
            AND o.organization_id=a.organization_id AND v.id=NEW.vendor_id
            AND v.enabled AND m.enabled
            AND v.revision=NEW.vendor_revision AND m.revision=NEW.model_revision
    ) THEN
        RAISE EXCEPTION 'personal route ownership or revision changed' USING ERRCODE='P0008';
    END IF;
    IF EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=NEW.attempt_id)
        OR EXISTS (SELECT 1 FROM provider_attempt_offers WHERE attempt_id=NEW.attempt_id)
        OR EXISTS (SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id=NEW.attempt_id) THEN
        RAISE EXCEPTION 'personal route already has commercial accounting' USING ERRCODE='P0008';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION require_customer_balance_dispatch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    END IF;
    -- Funding/account activation takes an organization update lock. Admission
    -- holds a shared lock until commit so activation cannot race this check.
    PERFORM id FROM organizations WHERE id=NEW.organization_id FOR SHARE;
    IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id=NEW.id) THEN
        -- Recheck under locks at the dispatch boundary, not merely at resolution.
        PERFORM v.id FROM vendors v JOIN personal_attempt_routes b ON b.vendor_id=v.id
            WHERE b.attempt_id=NEW.id FOR SHARE OF v;
        PERFORM m.alias FROM vendor_models m WHERE m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id) FOR SHARE;
        IF NOT EXISTS (
            SELECT 1 FROM personal_attempt_routes b
            JOIN personal_vendor_ownership o ON o.vendor_id=b.vendor_id
            JOIN vendors v ON v.id=b.vendor_id
            JOIN vendor_models m ON m.vendor_id=v.id AND m.alias=COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=NEW.id),NEW.resource_id)
            JOIN api_keys k ON k.id=NEW.api_key_id
            JOIN inspected_guardrail_bindings g ON g.attempt_id=NEW.id AND g.key_id=k.id
            WHERE b.attempt_id=NEW.id AND o.organization_id=NEW.organization_id
                AND v.enabled AND m.enabled
                AND v.revision=b.vendor_revision AND m.revision=b.model_revision
                AND NEW.dispatch_provider=v.adapter
                AND k.organization_id=NEW.organization_id AND k.project_id=NEW.project_id
                AND k.revoked_at IS NULL AND k.expires_at>clock_timestamp()
                AND ('*'=ANY(k.allowed_models) OR NEW.resource_id=ANY(k.allowed_models))
        ) THEN
            RAISE EXCEPTION 'personal dispatch ownership, policy or route changed' USING ERRCODE='P0011';
        END IF;
        IF EXISTS (SELECT 1 FROM customer_attempt_tariffs WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM provider_attempt_offers WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM customer_attempt_balance_accounts WHERE attempt_id=NEW.id)
            OR EXISTS (SELECT 1 FROM account_assignments WHERE attempt_id=NEW.id) THEN
            RAISE EXCEPTION 'personal dispatch has incompatible accounting' USING ERRCODE='P0011';
        END IF;
        RETURN NEW;
    END IF;
    IF EXISTS (SELECT 1 FROM customer_balance_accounts WHERE organization_id=NEW.organization_id)
        AND NOT EXISTS (SELECT 1 FROM customer_balance_reservations
            WHERE attempt_id=NEW.id AND organization_id=NEW.organization_id AND released_at IS NULL)
        AND NOT EXISTS (
            SELECT 1 FROM customer_attempt_tariffs t
            JOIN customer_tariff_revisions r ON r.id=t.revision_id
            JOIN customer_attempt_balance_accounts b ON b.attempt_id=t.attempt_id AND b.currency=r.currency
            WHERE t.attempt_id=NEW.id AND b.organization_id=NEW.organization_id
                AND r.prompt_rate=0 AND r.completion_rate=0
        ) THEN
        RAISE EXCEPTION 'prepaid dispatch requires a funded retail reservation' USING ERRCODE='P0009';
    END IF;
    RETURN NEW;
END;
$$;
