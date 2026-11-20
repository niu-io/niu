-- Invalidate both authorization forms together on material route changes.
-- Existing legacy review and audit records remain immutable.
CREATE OR REPLACE FUNCTION niu_invalidate_supplier_route_qualification() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE affected RECORD;
BEGIN
    IF niu_authorized_encryption_rewrap(
        TG_TABLE_NAME, 'credential_ciphertext', to_jsonb(OLD), to_jsonb(NEW)
    ) THEN RETURN NEW; END IF;
    FOR affected IN
        UPDATE provider_offers
           SET active = FALSE, current_qualification_review = NULL, current_authorization = NULL
         WHERE vendor_id = OLD.id
           AND (current_qualification_review IS NOT NULL OR current_authorization IS NOT NULL)
        RETURNING provider_id, id
    LOOP
        INSERT INTO provider_audit_events(provider_id, action, resource_id)
        VALUES (affected.provider_id, 'route_qualification_invalidated', affected.id);
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION niu_invalidate_supplier_model_qualification() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE affected RECORD;
BEGIN
    FOR affected IN
        UPDATE provider_offers
           SET active = FALSE, current_qualification_review = NULL, current_authorization = NULL
         WHERE model_alias = OLD.alias
           AND (current_qualification_review IS NOT NULL OR current_authorization IS NOT NULL)
        RETURNING provider_id, id
    LOOP
        INSERT INTO provider_audit_events(provider_id, action, resource_id)
        VALUES (affected.provider_id, 'model_qualification_invalidated', affected.id);
    END LOOP;
    RETURN NEW;
END;
$$;

-- A rate revision change must not carry forward an authorization of the old
-- rate. Preserve the immutable record for already-pinned historical attempts.
CREATE FUNCTION niu_invalidate_offer_authorization_on_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.current_revision IS DISTINCT FROM OLD.current_revision THEN
        NEW.current_authorization := NULL;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER offer_revision_invalidates_authorization
    BEFORE UPDATE OF current_revision ON provider_offers
    FOR EACH ROW EXECUTE FUNCTION niu_invalidate_offer_authorization_on_revision();
