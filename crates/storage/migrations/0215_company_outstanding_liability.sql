-- Outstanding customer liability can exceed its original immutable hold.
CREATE FUNCTION niu_customer_account_outstanding(p_account UUID, p_exclude_attempt UUID DEFAULT NULL)
RETURNS NUMERIC LANGUAGE sql VOLATILE AS $$
    SELECT COALESCE(SUM(GREATEST(r.amount_nanos, COALESCE(m.amount_nanos, 0))),0)
    FROM customer_balance_reservations r
    LEFT JOIN customer_media_charges m ON m.attempt_id=r.attempt_id
    WHERE r.account_id=p_account AND r.released_at IS NULL
      AND (p_exclude_attempt IS NULL OR r.attempt_id<>p_exclude_attempt)
      AND NOT EXISTS (SELECT 1 FROM customer_balance_entries e
          WHERE e.attempt_id=r.attempt_id AND e.kind='charge')
$$;

CREATE OR REPLACE FUNCTION enforce_customer_media_debit_capacity() RETURNS TRIGGER AS $$
DECLARE funded BOOLEAN;
BEGIN
    IF NEW.kind<>'charge' OR NOT EXISTS (SELECT 1 FROM customer_media_charges WHERE attempt_id=NEW.attempt_id) THEN RETURN NEW; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR UPDATE;
    SELECT COALESCE((SELECT SUM(amount_nanos) FROM customer_balance_entries WHERE account_id=a.id),0)
        +a.credit_limit_nanos-niu_customer_account_outstanding(a.id, NEW.attempt_id)
        >=-NEW.amount_nanos INTO funded FROM customer_balance_accounts a WHERE a.id=NEW.account_id;
    IF funded IS DISTINCT FROM true THEN RAISE EXCEPTION 'media debit exceeds available approved capacity' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
