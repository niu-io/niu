-- Resolution evidence contains identifiers/revisions only, never credentials.
CREATE TABLE managed_attempt_routes (
    attempt_id UUID PRIMARY KEY REFERENCES attempts(id) DEFERRABLE INITIALLY DEFERRED,
    vendor_id UUID NOT NULL REFERENCES vendors(id),
    model_alias TEXT NOT NULL REFERENCES vendor_models(alias),
    vendor_revision BIGINT NOT NULL CHECK (vendor_revision > 0),
    model_revision BIGINT NOT NULL CHECK (model_revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE FUNCTION protect_managed_attempt_route() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        RAISE EXCEPTION 'managed route binding is immutable' USING ERRCODE='P0024';
    END IF;
    IF EXISTS (SELECT 1 FROM attempts WHERE id=NEW.attempt_id AND execution<>'not_sent') THEN
        RAISE EXCEPTION 'managed route must bind before dispatch' USING ERRCODE='P0024';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_managed_attempt_route BEFORE INSERT OR UPDATE OR DELETE
    ON managed_attempt_routes FOR EACH ROW EXECUTE FUNCTION protect_managed_attempt_route();

CREATE FUNCTION recheck_managed_attempt_route() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE binding managed_attempt_routes%ROWTYPE;
BEGIN
    IF NEW.execution<>'may_have_executed' THEN RETURN NEW; END IF;
    IF TG_OP='UPDATE' AND OLD.execution<>'not_sent' THEN RETURN NEW; END IF;
    SELECT * INTO binding FROM managed_attempt_routes WHERE attempt_id=NEW.id;
    IF NOT FOUND THEN RETURN NEW; END IF; -- Static/legacy dispatch remains compatible.
    PERFORM id FROM vendors WHERE id=binding.vendor_id FOR SHARE;
    PERFORM alias FROM vendor_models WHERE alias=binding.model_alias FOR SHARE;
    IF NOT EXISTS (
        SELECT 1 FROM vendor_models m JOIN vendors v ON v.id=m.vendor_id
        WHERE m.alias=binding.model_alias AND m.alias=NEW.resource_id
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
CREATE TRIGGER recheck_managed_attempt_route BEFORE INSERT OR UPDATE OF execution
    ON attempts FOR EACH ROW EXECUTE FUNCTION recheck_managed_attempt_route();
