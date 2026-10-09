-- Qualification applies to the reviewed route, not only its model alias and rates.
-- Keep immutable evidence for audit, but require a new review after material changes.
CREATE FUNCTION niu_invalidate_supplier_route_qualification() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    affected RECORD;
BEGIN
    FOR affected IN
        UPDATE provider_offers
           SET active = FALSE, current_qualification_review = NULL
         WHERE vendor_id = OLD.id
           AND current_qualification_review IS NOT NULL
        RETURNING provider_id, id
    LOOP
        INSERT INTO provider_audit_events(provider_id, action, resource_id)
        VALUES (affected.provider_id, 'route_qualification_invalidated', affected.id);
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER supplier_configuration_requires_new_review
AFTER UPDATE OF api_base, adapter, credential_ciphertext ON vendors
FOR EACH ROW WHEN (
    OLD.api_base IS DISTINCT FROM NEW.api_base
    OR OLD.adapter IS DISTINCT FROM NEW.adapter
    OR OLD.credential_ciphertext IS DISTINCT FROM NEW.credential_ciphertext
)
EXECUTE FUNCTION niu_invalidate_supplier_route_qualification();

CREATE FUNCTION niu_invalidate_supplier_model_qualification() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    affected RECORD;
BEGIN
    FOR affected IN
        UPDATE provider_offers
           SET active = FALSE, current_qualification_review = NULL
         WHERE model_alias = OLD.alias
           AND current_qualification_review IS NOT NULL
        RETURNING provider_id, id
    LOOP
        INSERT INTO provider_audit_events(provider_id, action, resource_id)
        VALUES (affected.provider_id, 'model_qualification_invalidated', affected.id);
    END LOOP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER supplier_model_requires_new_review
AFTER UPDATE OF upstream_model, vendor_id, capabilities ON vendor_models
FOR EACH ROW WHEN (
    OLD.upstream_model IS DISTINCT FROM NEW.upstream_model
    OR OLD.vendor_id IS DISTINCT FROM NEW.vendor_id
    OR OLD.capabilities IS DISTINCT FROM NEW.capabilities
)
EXECUTE FUNCTION niu_invalidate_supplier_model_qualification();
