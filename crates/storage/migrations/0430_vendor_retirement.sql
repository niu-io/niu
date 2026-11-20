-- An explicit retirement action is auditable and never deletes historical
-- vendor, model, offer, request or incident records.
ALTER TABLE vendor_audit_events DROP CONSTRAINT vendor_audit_events_action_check;
ALTER TABLE vendor_audit_events ADD CONSTRAINT vendor_audit_events_action_check
    CHECK (action = ANY (ARRAY[
        'vendor_created', 'vendor_updated', 'vendor_seeded', 'vendor_retired',
        'vendor_model_created', 'vendor_model_updated', 'vendor_model_seeded',
        'supplier_associated', 'personal_owner_assigned'
    ]));
-- Retired connections erase their credential while retaining a valid row.
ALTER TABLE vendors DROP CONSTRAINT vendors_credential_ciphertext_check;
ALTER TABLE vendors ADD CONSTRAINT vendors_credential_ciphertext_check
    CHECK (octet_length(credential_ciphertext) = 0
        OR octet_length(credential_ciphertext) BETWEEN 30 AND 16384);
