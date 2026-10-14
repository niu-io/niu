-- Refund/source reconciliation follows the original charge entry. No financial
-- row or historical provenance is rewritten by this lookup index.
CREATE INDEX customer_balance_refunds_by_charge
    ON customer_balance_entries(reverses_entry_id) WHERE kind='refund';
