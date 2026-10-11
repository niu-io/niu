-- Recovery walks pending reservations globally by attempt, independently of
-- account-scoped admission and company-scoped reservation directory indexes.
CREATE INDEX customer_balance_reservations_pending_recovery
    ON customer_balance_reservations(attempt_id)
    WHERE released_at IS NULL;
