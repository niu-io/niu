-- Durable personal-route evidence only. This does not waive prepaid admission.
CREATE TABLE personal_attempt_routes (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id),
    vendor_id UUID NOT NULL REFERENCES personal_vendor_ownership(vendor_id),
    vendor_revision BIGINT NOT NULL,
    model_revision BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE FUNCTION validate_personal_attempt_route() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'personal attempt route is immutable' USING ERRCODE='P0008';
    END IF;
    -- Lock the credential before the model, matching model configuration writes.
    PERFORM id FROM vendors WHERE id=NEW.vendor_id FOR SHARE;
    PERFORM m.alias FROM vendor_models m JOIN attempts a ON a.resource_id=m.alias
        WHERE a.id=NEW.attempt_id FOR SHARE OF m;
    PERFORM id FROM attempts WHERE id=NEW.attempt_id FOR UPDATE;
    IF NOT EXISTS (
        SELECT 1 FROM attempts a
        JOIN vendor_models m ON m.alias=a.resource_id
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
CREATE TRIGGER validate_personal_attempt_route BEFORE INSERT OR UPDATE OR DELETE
    ON personal_attempt_routes FOR EACH ROW EXECUTE FUNCTION validate_personal_attempt_route();
