-- Automatic same-Provider multi-key credential pooling.
-- Enabled API keys belonging to the same Provider business, API adapter, normalized
-- api_base, and ownership/access scope automatically share model routes, load-balance
-- requests, and fail over without requiring duplicate model aliases or duplicate offers.

CREATE OR REPLACE FUNCTION niu_vendor_serves_model(p_vendor_id UUID, p_model_alias TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM vendor_models m
        JOIN vendors primary_v ON primary_v.id = m.vendor_id
        JOIN vendors v ON v.id = p_vendor_id
        LEFT JOIN personal_vendor_ownership po_primary ON po_primary.vendor_id = primary_v.id
        LEFT JOIN personal_vendor_ownership po_v ON po_v.vendor_id = v.id
        WHERE m.alias = p_model_alias
          AND (
              v.id = primary_v.id
              OR (
                  v.adapter = primary_v.adapter
                  AND rtrim(v.api_base, '/') = rtrim(primary_v.api_base, '/')
                  AND EXISTS (
                      SELECT 1
                      FROM vendor_supplier_ownership own_primary
                      JOIN vendor_supplier_ownership own_v
                        ON own_v.provider_id = own_primary.provider_id
                      WHERE own_primary.vendor_id = primary_v.id
                        AND own_v.vendor_id = v.id
                  )
                  AND po_primary.organization_id IS NOT DISTINCT FROM po_v.organization_id
                  AND po_primary.access_scope IS NOT DISTINCT FROM po_v.access_scope
              )
          )
    )
$$;

CREATE OR REPLACE FUNCTION niu_model_has_enabled_vendor(p_model_alias TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM vendor_models m
        JOIN vendors primary_v ON primary_v.id = m.vendor_id
        LEFT JOIN personal_vendor_ownership po_primary ON po_primary.vendor_id = primary_v.id
        WHERE m.alias = p_model_alias
          AND (
              (primary_v.enabled AND octet_length(primary_v.credential_ciphertext) > 0)
              OR EXISTS (
                  SELECT 1
                  FROM vendor_supplier_ownership own_primary
                  JOIN vendor_supplier_ownership own_v
                    ON own_v.provider_id = own_primary.provider_id
                  JOIN vendors v ON v.id = own_v.vendor_id
                  LEFT JOIN personal_vendor_ownership po_v ON po_v.vendor_id = v.id
                  WHERE own_primary.vendor_id = primary_v.id
                    AND v.enabled
                    AND octet_length(v.credential_ciphertext) > 0
                    AND v.adapter = primary_v.adapter
                    AND rtrim(v.api_base, '/') = rtrim(primary_v.api_base, '/')
                    AND po_primary.organization_id IS NOT DISTINCT FROM po_v.organization_id
                    AND po_primary.access_scope IS NOT DISTINCT FROM po_v.access_scope
              )
          )
    )
$$;

CREATE OR REPLACE FUNCTION niu_offer_qualification_current(
    p_provider UUID, p_offer UUID, p_revision UUID
) RETURNS BOOLEAN LANGUAGE SQL VOLATILE AS $$
    SELECT niu_media_offer_binding_current(p_provider, p_offer, p_revision)
       AND EXISTS (
        SELECT 1 FROM provider_offers o
        WHERE o.provider_id=p_provider AND o.id=p_offer AND o.current_revision=p_revision
          AND (
            (o.current_authorization IS NOT NULL AND EXISTS (
                SELECT 1 FROM provider_offer_authorizations a
                JOIN vendors v ON v.id=o.vendor_id
                JOIN vendor_models m ON m.alias=o.model_alias AND m.vendor_id=v.id
                JOIN vendor_supplier_ownership own ON own.vendor_id=v.id AND own.provider_id=o.provider_id
                WHERE a.id=o.current_authorization AND a.provider_id=o.provider_id
                  AND a.offer_id=o.id AND a.rate_revision=p_revision
                  AND m.enabled AND niu_model_has_enabled_vendor(o.model_alias)
                  AND NOT EXISTS (SELECT 1 FROM personal_vendor_ownership personal WHERE personal.vendor_id=v.id)
                  AND NOT EXISTS (SELECT 1 FROM provider_offer_authorization_revocations r WHERE r.authorization_id=a.id)
            ))
            OR
            (o.current_qualification_review IS NOT NULL AND niu_supplier_qualification_current(p_provider)
             AND EXISTS (
                SELECT 1 FROM provider_offer_qualification_reviews q
                WHERE q.provider_id=o.provider_id AND q.offer_id=o.id
                  AND q.id=o.current_qualification_review AND q.rate_revision=p_revision
                  AND q.revoked_at IS NULL AND q.valid_until>clock_timestamp()
                  AND NOT EXISTS (SELECT 1 FROM provider_qualification_revocations r WHERE r.offer_review_id=q.id)
             ))
          )
       )
$$;

CREATE OR REPLACE FUNCTION niu_supplier_model_route_available(p_alias TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE AS $$
    SELECT NOT EXISTS (
        SELECT 1 FROM provider_offers o
        LEFT JOIN vendor_models m ON m.alias = o.model_alias
        LEFT JOIN vendors v ON v.id = m.vendor_id
        WHERE o.model_alias = p_alias AND (
            NOT o.active
            OR NOT niu_offer_qualification_current(o.provider_id, o.id, o.current_revision)
            OR m.alias IS NULL OR v.id IS NULL
            OR NOT m.enabled OR NOT niu_model_has_enabled_vendor(m.alias)
            OR m.vendor_id IS DISTINCT FROM o.vendor_id
        )
    )
$$;

CREATE OR REPLACE FUNCTION niu_guard_qualified_supplier_dispatch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.execution='not_sent' AND NEW.execution='may_have_executed'
       AND EXISTS (
           SELECT 1 FROM provider_attempt_offers b
           LEFT JOIN provider_offers o ON o.provider_id=b.provider_id AND o.id=b.offer_id
           LEFT JOIN vendor_models m ON m.alias=o.model_alias
           LEFT JOIN vendors v ON v.id=m.vendor_id
           WHERE b.attempt_id=NEW.id AND (
               o.id IS NULL OR NOT o.active OR m.alias IS NULL OR v.id IS NULL
               OR NOT m.enabled OR NOT niu_model_has_enabled_vendor(m.alias)
               OR m.vendor_id IS DISTINCT FROM o.vendor_id
               OR o.current_revision IS DISTINCT FROM b.revision_id
               OR (b.qualification_review_id IS NULL AND b.authorization_id IS NULL)
               OR o.current_qualification_review IS DISTINCT FROM b.qualification_review_id
               OR o.current_authorization IS DISTINCT FROM b.authorization_id
               OR NOT niu_offer_qualification_current(b.provider_id,b.offer_id,b.revision_id)
           )
       ) THEN
        RAISE EXCEPTION 'supplier offer authorization changed before dispatch' USING ERRCODE='P0007';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION recheck_managed_attempt_route() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    binding managed_attempt_routes%ROWTYPE;
    primary_vendor UUID;
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
    SELECT vendor_id INTO primary_vendor FROM vendor_models WHERE alias = binding.model_alias FOR SHARE;
    PERFORM id FROM vendors
        WHERE id = binding.vendor_id OR (primary_vendor IS NOT NULL AND id = primary_vendor)
        ORDER BY id FOR SHARE;
    IF NOT EXISTS (
        SELECT 1 FROM vendor_models m JOIN vendors v ON v.id = binding.vendor_id
        WHERE m.alias = binding.model_alias
          AND (binding.pool_alias = NEW.resource_id OR (binding.pool_alias IS NULL AND m.alias = NEW.resource_id))
          AND niu_vendor_serves_model(v.id, m.alias)
          AND v.enabled AND octet_length(v.credential_ciphertext) > 0 AND m.enabled
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

CREATE OR REPLACE FUNCTION validate_personal_attempt_route() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    target_alias TEXT;
    primary_vendor UUID;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'personal attempt route is immutable' USING ERRCODE='P0008';
    END IF;
    SELECT COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id=a.id), a.resource_id)
      INTO target_alias
      FROM attempts a WHERE a.id=NEW.attempt_id FOR UPDATE;
    SELECT vendor_id INTO primary_vendor FROM vendor_models WHERE alias=target_alias FOR SHARE;
    PERFORM id FROM vendors
        WHERE id=NEW.vendor_id OR (primary_vendor IS NOT NULL AND id=primary_vendor)
        ORDER BY id FOR SHARE;
    IF NOT EXISTS (
        SELECT 1 FROM attempts a
        JOIN vendor_models m ON m.alias=target_alias
        JOIN vendors v ON v.id=NEW.vendor_id
        JOIN personal_vendor_ownership o ON o.vendor_id=v.id
        WHERE a.id=NEW.attempt_id AND a.execution='not_sent'
            AND niu_vendor_serves_model(v.id, m.alias)
            AND (o.access_scope='internal' OR o.organization_id=a.organization_id)
            AND v.enabled AND octet_length(v.credential_ciphertext) > 0 AND m.enabled
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
DECLARE
    mode TEXT;
    target_alias TEXT;
    bound_vendor UUID;
    primary_vendor UUID;
BEGIN
    IF NEW.execution <> 'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' THEN
        IF OLD.execution <> 'not_sent' THEN RETURN NEW; END IF;
    END IF;
    SELECT billing_mode INTO STRICT mode FROM customer_unit_configuration WHERE singleton FOR SHARE;
    PERFORM id FROM organizations WHERE id = NEW.organization_id FOR SHARE;
    IF EXISTS (SELECT 1 FROM personal_attempt_routes WHERE attempt_id = NEW.id) THEN
        target_alias := COALESCE((SELECT model_alias FROM managed_attempt_routes WHERE attempt_id = NEW.id), NEW.resource_id);
        SELECT vendor_id INTO bound_vendor FROM personal_attempt_routes WHERE attempt_id = NEW.id;
        SELECT vendor_id INTO primary_vendor FROM vendor_models WHERE alias = target_alias FOR SHARE;
        PERFORM id FROM vendors
            WHERE id = bound_vendor OR (primary_vendor IS NOT NULL AND id = primary_vendor)
            ORDER BY id FOR SHARE;
        IF NOT EXISTS (
            SELECT 1 FROM personal_attempt_routes b
            JOIN personal_vendor_ownership o ON o.vendor_id = b.vendor_id
            JOIN vendors v ON v.id = b.vendor_id
            JOIN vendor_models m ON m.alias = target_alias
            JOIN api_keys k ON k.id = NEW.api_key_id
            JOIN inspected_guardrail_bindings g ON g.attempt_id = NEW.id AND g.key_id = k.id
            WHERE b.attempt_id = NEW.id
                AND niu_vendor_serves_model(v.id, m.alias)
                AND (o.access_scope = 'internal' OR o.organization_id = NEW.organization_id)
                AND v.enabled AND octet_length(v.credential_ciphertext) > 0 AND m.enabled
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

CREATE OR REPLACE FUNCTION niu_record_connection_incident(p_attempt UUID) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE route RECORD; incident BIGINT; since_time TIMESTAMPTZ; total BIGINT; inserted BIGINT;
BEGIN
    PERFORM niu_record_qualified_connection_incident(p_attempt);
    SELECT r.vendor_id,r.model_alias,r.vendor_revision,r.model_revision INTO route
    FROM managed_attempt_routes r JOIN attempts a ON a.id=r.attempt_id
    JOIN request_failures f ON f.attempt_id=a.id
    JOIN vendors v ON v.id=r.vendor_id AND v.enabled AND v.revision=r.vendor_revision
    JOIN vendor_models m ON m.alias=r.model_alias AND m.enabled AND m.revision=r.model_revision
      AND niu_vendor_serves_model(r.vendor_id, m.alias)
    WHERE a.id=p_attempt AND a.dispatched_at IS NOT NULL
      AND (f.kind IN ('upstream_timeout','upstream_connection_error')
           OR (f.kind='upstream_http_error' AND f.upstream_http_status BETWEEN 500 AND 599))
    FOR SHARE OF v,m;
    IF route.vendor_id IS NULL THEN RETURN; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(route.vendor_id::text || ':' || route.model_alias, 0));
    INSERT INTO connection_incident_signals(attempt_id,vendor_id,model_alias,vendor_revision,model_revision)
    VALUES(p_attempt,route.vendor_id,route.model_alias,route.vendor_revision,route.model_revision)
    ON CONFLICT(attempt_id) DO NOTHING;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT id INTO incident FROM connection_incidents
    WHERE vendor_id=route.vendor_id AND model_alias=route.model_alias
      AND cause='repeated_upstream_failures' AND resolved_at IS NULL FOR UPDATE;
    IF incident IS NOT NULL THEN
        INSERT INTO connection_incident_observations(attempt_id,incident_id,vendor_revision,model_revision,observed_at)
        SELECT attempt_id,incident,vendor_revision,model_revision,observed_at
        FROM connection_incident_signals WHERE attempt_id=p_attempt ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS inserted = ROW_COUNT;
        IF inserted > 0 THEN
            UPDATE connection_incidents SET last_observed_at=clock_timestamp(),observations=observations+1 WHERE id=incident;
        END IF;
        RETURN;
    END IF;
    SELECT GREATEST(clock_timestamp()-interval '5 minutes',COALESCE(max(resolved_at),'-infinity'::timestamptz)) INTO since_time
    FROM connection_incidents WHERE vendor_id=route.vendor_id AND model_alias=route.model_alias AND cause='repeated_upstream_failures';
    SELECT count(*) INTO total FROM connection_incident_signals
    WHERE vendor_id=route.vendor_id AND model_alias=route.model_alias
      AND vendor_revision=route.vendor_revision AND model_revision=route.model_revision AND observed_at>since_time;
    IF total < 3 THEN RETURN; END IF;
    INSERT INTO connection_incidents(vendor_id,model_alias,cause,first_observed_at,last_observed_at,observations)
    SELECT route.vendor_id,route.model_alias,'repeated_upstream_failures',min(observed_at),max(observed_at),count(*)
    FROM connection_incident_signals WHERE vendor_id=route.vendor_id AND model_alias=route.model_alias
      AND vendor_revision=route.vendor_revision AND model_revision=route.model_revision AND observed_at>since_time
    RETURNING id INTO incident;
    INSERT INTO connection_incident_observations(attempt_id,incident_id,vendor_revision,model_revision,observed_at)
    SELECT attempt_id,incident,vendor_revision,model_revision,observed_at FROM connection_incident_signals
    WHERE vendor_id=route.vendor_id AND model_alias=route.model_alias
      AND vendor_revision=route.vendor_revision AND model_revision=route.model_revision AND observed_at>since_time
    ON CONFLICT DO NOTHING;
END;
$$;

-- Retiring an old credential in a multi-key Provider pool must not invalidate
-- commercial offers while another enabled sibling key on the same Provider,
-- adapter, and endpoint continues serving the model.
CREATE OR REPLACE FUNCTION niu_invalidate_supplier_route_qualification() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    affected RECORD;
    retiring_credential BOOLEAN;
BEGIN
    IF niu_authorized_encryption_rewrap(
        TG_TABLE_NAME, 'credential_ciphertext', to_jsonb(OLD), to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
    retiring_credential :=
        NEW.adapter = OLD.adapter
        AND rtrim(NEW.api_base, '/') = rtrim(OLD.api_base, '/')
        AND NOT NEW.enabled
        AND octet_length(NEW.credential_ciphertext) = 0;
    FOR affected IN
        UPDATE provider_offers
           SET active = FALSE, current_qualification_review = NULL, current_authorization = NULL
         WHERE vendor_id = OLD.id
           AND (current_qualification_review IS NOT NULL OR current_authorization IS NOT NULL)
           AND (NOT retiring_credential OR NOT niu_model_has_enabled_vendor(provider_offers.model_alias))
        RETURNING provider_id, id
    LOOP
        INSERT INTO provider_audit_events(provider_id, action, resource_id)
        VALUES (affected.provider_id, 'route_qualification_invalidated', affected.id);
    END LOOP;
    RETURN NEW;
END;
$$;
