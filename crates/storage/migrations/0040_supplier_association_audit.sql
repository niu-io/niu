ALTER TABLE vendor_audit_events DROP CONSTRAINT vendor_audit_events_action_check;
ALTER TABLE vendor_audit_events ADD CONSTRAINT vendor_audit_events_action_check CHECK (action IN (
    'vendor_created', 'vendor_updated', 'vendor_seeded',
    'vendor_model_created', 'vendor_model_updated', 'vendor_model_seeded',
    'supplier_associated'
));
