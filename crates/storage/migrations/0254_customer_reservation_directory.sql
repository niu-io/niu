-- Company-wide keyset inspection of open customer holds. Released cursor lookup
-- continues to use the existing attempt primary key after settlement.
CREATE INDEX customer_balance_reservations_company_open
    ON customer_balance_reservations(organization_id,created_at DESC,attempt_id DESC)
    WHERE released_at IS NULL;
