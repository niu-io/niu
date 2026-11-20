-- Administrator-supplied internal Provider credentials may be shared explicitly
-- with every internal organization on the installation. Access scope is separate
-- from the funding/ownership account, remains excluded from commercial supply,
-- and never becomes shared in Resale operation. Existing rows stay personal.
ALTER TABLE personal_vendor_ownership
    ADD COLUMN access_scope TEXT NOT NULL DEFAULT 'personal'
    CHECK (access_scope IN ('personal', 'internal'));

COMMENT ON COLUMN personal_vendor_ownership.access_scope IS
    'personal: only organization_id may use the credential; internal: every organization on an Internal-use installation may use it while the funding account remains organization_id.';

-- Personal route bindings may now reference an internal-scope credential used by
-- another authorized organization. The vendor, route revision and workspace key
-- checks remain unchanged.
CREATE OR REPLACE FUNCTION validate_personal_attempt_route() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'personal attempt route is immutable' USING ERRCODE='P0008';
    END IF;
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
            AND (o.access_scope='internal' OR o.organization_id=a.organization_id)
            AND v.id=NEW.vendor_id
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

-- Managed route dispatch must accept an internal-scope credential for another
-- authorized organization. Personal ownership remains organization-bound.
CREATE OR REPLACE FUNCTION recheck_managed_attempt_route() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE binding managed_attempt_routes%ROWTYPE;
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    SELECT * INTO binding FROM managed_attempt_routes WHERE attempt_id = NEW.id;
    IF NOT FOUND THEN RETURN NEW; END IF; -- Static/legacy dispatch remains compatible.
    IF binding.pool_alias IS NOT NULL THEN
        PERFORM alias FROM model_route_pools WHERE alias = binding.pool_alias FOR SHARE;
        IF NOT EXISTS (
            SELECT 1 FROM model_route_pools p
            WHERE p.alias = binding.pool_alias AND p.alias = NEW.resource_id
              AND p.enabled AND p.revision = binding.pool_revision
              AND (p.organization_id IS NULL OR p.organization_id = NEW.organization_id)
              AND (p.project_id IS NULL OR p.project_id = NEW.project_id)
              AND (
                  EXISTS (
                      SELECT 1 FROM jsonb_array_elements(p.candidates) c
                      WHERE c->>'alias' = binding.model_alias AND (c->>'enabled')::boolean
                  )
                  OR (
                      EXISTS (
                          SELECT 1 FROM jsonb_array_elements(p.candidates) c
                          WHERE c->>'alias' = binding.model_alias
                      )
                      AND EXISTS (
                          SELECT 1
                          FROM jsonb_array_elements(p.rules) r,
                               jsonb_array_elements(COALESCE(r->'candidates', '[]'::jsonb)) rc
                          WHERE COALESCE((r->>'enabled')::boolean, false)
                            AND rc->>'alias' = binding.model_alias
                            AND COALESCE((rc->>'enabled')::boolean, false)
                      )
                  )
              )
              AND ((p.organization_id IS NULL AND NOT EXISTS(
                  SELECT 1 FROM personal_vendor_ownership o WHERE o.vendor_id = binding.vendor_id))
                  OR EXISTS(SELECT 1 FROM personal_vendor_ownership o
                      WHERE o.vendor_id = binding.vendor_id
                        AND (o.access_scope = 'internal' OR o.organization_id = p.organization_id)))
        ) THEN
            RAISE EXCEPTION 'route pool changed before dispatch' USING ERRCODE = 'P0024';
        END IF;
    END IF;
    PERFORM id FROM vendors WHERE id = binding.vendor_id FOR SHARE;
    PERFORM alias FROM vendor_models WHERE alias = binding.model_alias FOR SHARE;
    IF NOT EXISTS (
        SELECT 1 FROM vendor_models m JOIN vendors v ON v.id = m.vendor_id
        WHERE m.alias = binding.model_alias AND (binding.pool_alias = NEW.resource_id OR (binding.pool_alias IS NULL AND m.alias = NEW.resource_id))
          AND v.id = binding.vendor_id AND v.enabled AND m.enabled
          AND v.revision = binding.vendor_revision AND m.revision = binding.model_revision
          AND v.adapter = NEW.dispatch_provider
          AND NOT EXISTS (SELECT 1 FROM personal_vendor_ownership o
              WHERE o.vendor_id = v.id
                AND o.access_scope <> 'internal'
                AND o.organization_id <> NEW.organization_id)
    ) THEN
        RAISE EXCEPTION 'managed route changed before dispatch' USING ERRCODE = 'P0024';
    END IF;
    RETURN NEW;
END;
$$;

-- The dispatch funding check must accept the same internal scope while retaining
-- every policy, key, Guardrail and revision assertion.
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
            WHERE b.attempt_id = NEW.id
                AND (o.access_scope = 'internal' OR o.organization_id = NEW.organization_id)
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
