-- Explicit noncash administrator gifts. Never create a funding receipt or
-- rewrite historical adjustments. The opposite signed memorandum
-- records the noncash source of capacity. Issuance recognizes neither revenue
-- nor promotional expense. Gift consumption requires separate sales-allowance
-- allocation; it must reduce reported revenue, never create an expense offset.
CREATE TABLE customer_balance_grants (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    entry_id UUID NOT NULL UNIQUE,
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos > 0),
    noncash_offset_nanos BIGINT NOT NULL CHECK (noncash_offset_nanos < 0),
    idempotency_key UUID NOT NULL,
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500
        AND reason = trim(reason) AND reason !~ '[[:cntrl:]]'),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, idempotency_key),
    FOREIGN KEY (organization_id, account_id, currency, entry_id)
        REFERENCES customer_balance_entries(organization_id, account_id, currency, id),
    CHECK (amount_nanos::numeric + noncash_offset_nanos::numeric = 0),
    CHECK ((actor_kind = 'installation' AND actor_operator_id IS NULL)
        OR (actor_kind = 'operator' AND actor_operator_id IS NOT NULL))
);

CREATE FUNCTION validate_customer_balance_grant() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM customer_balance_entries e
        WHERE e.id = NEW.entry_id AND e.organization_id = NEW.organization_id
          AND e.account_id = NEW.account_id AND e.currency = NEW.currency
          AND e.kind = 'adjustment' AND e.amount_nanos = NEW.amount_nanos
          AND e.idempotency_key = NEW.idempotency_key
          AND e.project_id IS NULL AND e.attempt_id IS NULL
          AND e.reverses_entry_id IS NULL
    ) THEN
        RAISE EXCEPTION 'noncash grant requires an exact positive adjustment'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_balance_grant BEFORE INSERT ON customer_balance_grants
    FOR EACH ROW EXECUTE FUNCTION validate_customer_balance_grant();
CREATE TRIGGER immutable_customer_balance_grant BEFORE UPDATE OR DELETE ON customer_balance_grants
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE INDEX customer_balance_grants_history
    ON customer_balance_grants(organization_id, created_at DESC, id DESC);
