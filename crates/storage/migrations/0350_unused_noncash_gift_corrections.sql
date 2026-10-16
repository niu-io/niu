-- Explicit correction of a wholly unused gift. No receipt, consumption refund,
-- revenue adjustment, policy change or historical journal rewrite.
CREATE TABLE customer_balance_grant_corrections (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    grant_id UUID NOT NULL UNIQUE REFERENCES customer_balance_grants(id),
    entry_id UUID NOT NULL UNIQUE,
    amount_nanos BIGINT NOT NULL CHECK(amount_nanos>0),
    noncash_offset_nanos BIGINT NOT NULL CHECK(noncash_offset_nanos=amount_nanos),
    idempotency_key UUID NOT NULL,
    reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 500 AND reason=trim(reason) AND reason !~ '[[:cntrl:]]'),
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('installation','operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id,idempotency_key),
    FOREIGN KEY(organization_id,account_id,currency,entry_id)
        REFERENCES customer_balance_entries(organization_id,account_id,currency,id),
    CHECK((actor_kind='installation' AND actor_operator_id IS NULL) OR (actor_kind='operator' AND actor_operator_id IS NOT NULL))
);
CREATE INDEX customer_balance_grant_corrections_account ON customer_balance_grant_corrections(account_id);
CREATE INDEX customer_balance_grant_corrections_audit ON customer_balance_grant_corrections(created_at DESC,(id::text) DESC);
CREATE TRIGGER immutable_customer_balance_grant_correction BEFORE UPDATE OR DELETE ON customer_balance_grant_corrections
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION validate_unused_customer_gift_correction() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE original customer_balance_grants%ROWTYPE;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id AND organization_id=NEW.organization_id AND currency=NEW.currency FOR NO KEY UPDATE;
    SELECT * INTO original FROM customer_balance_grants WHERE id=NEW.grant_id AND organization_id=NEW.organization_id AND account_id=NEW.account_id AND currency=NEW.currency;
    IF original.id IS NULL OR original.amount_nanos<>NEW.amount_nanos
       OR EXISTS(SELECT 1 FROM customer_grant_credit_applications WHERE grant_id=original.id)
       OR EXISTS(SELECT 1 FROM customer_balance_entries WHERE account_id=NEW.account_id AND kind IN ('charge','refund'))
       OR EXISTS(SELECT 1 FROM customer_balance_reservations WHERE account_id=NEW.account_id AND released_at IS NULL)
       OR NOT niu_customer_credit_account_covered(NEW.account_id,NEW.entry_id)
       OR niu_customer_explicit_gift_pool(NEW.account_id)<NEW.amount_nanos
       OR NOT EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.id=NEW.entry_id
            AND e.organization_id=NEW.organization_id AND e.account_id=NEW.account_id AND e.currency=NEW.currency
            AND e.kind='adjustment' AND e.amount_nanos::numeric=-NEW.amount_nanos::numeric
            AND e.idempotency_key=NEW.idempotency_key AND e.reverses_entry_id IS NULL
            AND e.project_id IS NULL AND e.attempt_id IS NULL) THEN
        RAISE EXCEPTION 'Correction requires an exact wholly unused gift with known sources and no open liabilities' USING ERRCODE='P0040';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_unused_customer_gift_correction BEFORE INSERT ON customer_balance_grant_corrections
    FOR EACH ROW EXECUTE FUNCTION validate_unused_customer_gift_correction();

CREATE OR REPLACE FUNCTION niu_customer_credit_account_covered(account UUID,ignore_entry UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE SQL VOLATILE AS $$
SELECT EXISTS(SELECT 1 FROM customer_balance_accounts a WHERE a.id=account)
AND NOT EXISTS (
    SELECT 1 FROM customer_balance_entries e
    WHERE e.account_id=account AND e.id IS DISTINCT FROM ignore_entry AND (
        e.kind='funding_reversal'
        OR (e.kind IN ('charge','refund') AND NOT EXISTS (
            SELECT 1 FROM customer_credit_sources s WHERE s.entry_id=e.id AND s.source_coverage='known'))
        OR (e.kind='funding' AND NOT EXISTS (
            SELECT 1 FROM customer_funding_receipts r
            WHERE r.entry_id=e.id AND r.organization_id=e.organization_id AND r.account_id=e.account_id
              AND r.currency=e.currency AND r.amount_nanos=e.amount_nanos AND e.amount_nanos>0))
        OR (e.kind='adjustment' AND NOT EXISTS (
            SELECT 1 FROM customer_balance_grants g
            WHERE g.entry_id=e.id AND g.organization_id=e.organization_id AND g.account_id=e.account_id
              AND g.currency=e.currency AND g.amount_nanos=e.amount_nanos AND e.amount_nanos>0) AND NOT EXISTS (
            SELECT 1 FROM customer_balance_grant_corrections c WHERE c.entry_id=e.id
              AND c.organization_id=e.organization_id AND c.account_id=e.account_id AND c.currency=e.currency
              AND e.amount_nanos::numeric=-c.amount_nanos::numeric))
    )
)
AND NOT EXISTS (
    SELECT 1 FROM customer_funding_receipts r
    LEFT JOIN customer_balance_entries e ON e.id=r.entry_id
    WHERE r.account_id=account AND (e.id IS NULL OR e.kind<>'funding'
        OR e.organization_id<>r.organization_id OR e.account_id<>r.account_id
        OR e.currency<>r.currency OR e.amount_nanos<>r.amount_nanos)
);
$$;

CREATE OR REPLACE FUNCTION niu_customer_explicit_gift_pool(account UUID) RETURNS NUMERIC
LANGUAGE SQL VOLATILE AS $$
SELECT COALESCE((SELECT sum(g.amount_nanos::numeric) FROM customer_balance_grants g WHERE g.account_id=account),0)
    -COALESCE((SELECT sum(CASE WHEN a.kind='charge' THEN a.explicit_gift_nanos::numeric ELSE -a.explicit_gift_nanos::numeric END)
        FROM customer_balance_consumption_allocations a WHERE a.account_id=account),0)
    -COALESCE((SELECT sum(a.amount_nanos::numeric) FROM customer_grant_credit_applications a WHERE a.account_id=account),0)
    -COALESCE((SELECT sum(c.amount_nanos::numeric) FROM customer_balance_grant_corrections c WHERE c.account_id=account),0);
$$;