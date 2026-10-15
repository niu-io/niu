-- Ensure BEFORE STATEMENT updates to vendors.credential_ciphertext acquire the
-- routing registry advisory lock (716554) before taking row locks on vendors,
-- matching registry_writer_vendors lock ordering, and index provider_offers(vendor_id)
-- so route qualification invalidation and FK checks avoid sequential scans.

CREATE INDEX IF NOT EXISTS provider_offers_vendor_id_idx
    ON provider_offers (vendor_id);

CREATE OR REPLACE FUNCTION niu_serialize_vendor_credential_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(716554);
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS serialize_vendor_credential_update ON vendors;
CREATE TRIGGER serialize_vendor_credential_update
    BEFORE UPDATE OF credential_ciphertext ON vendors
    FOR EACH STATEMENT
    EXECUTE FUNCTION niu_serialize_vendor_credential_update();
