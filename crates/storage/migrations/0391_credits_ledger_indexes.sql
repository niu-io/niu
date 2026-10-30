-- Scoped Credits admission, pending-liability and limit reads filter by company
-- and workspace, not by attempt alone. Without these indexes PostgreSQL must
-- scan the global reservation/restoration ledger on every Credits request, so
-- admission latency grows with unrelated tenants' history.
CREATE INDEX IF NOT EXISTS customer_unit_reservations_scope
    ON customer_unit_reservations (organization_id, project_id, attempt_id);

CREATE INDEX IF NOT EXISTS customer_unit_restorations_attempt
    ON customer_unit_restorations (attempt_id);

CREATE INDEX IF NOT EXISTS customer_unit_reserved_ranges_attempt
    ON customer_unit_reserved_ranges (attempt_id, ordinal);
