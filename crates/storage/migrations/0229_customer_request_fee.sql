-- Fixed retail fee for known completed text requests; historical fees stay zero.
ALTER TABLE customer_tariff_revisions ADD COLUMN request_fee_nanos BIGINT NOT NULL DEFAULT 0
    CHECK (request_fee_nanos >= 0);

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
                AND r.prompt_rate=0 AND r.completion_rate=0 AND COALESCE(r.cached_prompt_rate,0)=0
                AND r.minimum_charge_nanos=0 AND r.request_fee_nanos=0
        ) THEN
        RAISE EXCEPTION 'prepaid dispatch requires a funded retail reservation' USING ERRCODE='P0009';
    END IF;
    RETURN NEW;
END;
$$;
