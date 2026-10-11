-- Read-side operational Supplier statistics; no commercial qualification backfill.
CREATE INDEX managed_attempt_routes_vendor_attempt ON managed_attempt_routes(vendor_id,attempt_id);
CREATE INDEX media_recovery_routes_vendor_attempt ON media_recovery_routes(vendor_id,attempt_id);
