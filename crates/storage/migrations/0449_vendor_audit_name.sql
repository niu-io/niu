-- Preserve the connection name observed when the audit event was recorded.
ALTER TABLE vendor_audit_events
    ADD COLUMN vendor_name text CHECK (char_length(vendor_name) BETWEEN 1 AND 100);
