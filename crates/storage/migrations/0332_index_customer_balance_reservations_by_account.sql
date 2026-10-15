-- Index open customer balance reservations and charge/refund lookups by account_id
-- so niu_customer_account_outstanding, niu_customer_workspace_committed, and
-- niu_customer_key_committed use index-only scans instead of table scans.

CREATE INDEX IF NOT EXISTS customer_balance_reservations_open_by_account_idx
    ON customer_balance_reservations (account_id, attempt_id)
    INCLUDE (amount_nanos)
    WHERE released_at IS NULL;

CREATE INDEX IF NOT EXISTS customer_balance_entries_account_charge_attempt_idx
    ON customer_balance_entries (account_id, attempt_id)
    INCLUDE (amount_nanos, id)
    WHERE kind = 'charge';

CREATE INDEX IF NOT EXISTS customer_balance_entries_account_refund_reverse_idx
    ON customer_balance_entries (account_id, reverses_entry_id)
    INCLUDE (amount_nanos)
    WHERE kind = 'refund';
