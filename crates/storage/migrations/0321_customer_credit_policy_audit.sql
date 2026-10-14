-- Authenticated credit approvals only; no attribution of historical revisions.
CREATE TABLE customer_credit_policy_events (
    id UUID PRIMARY KEY,
    account_id UUID NOT NULL,
    revision BIGINT NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(account_id,revision),
    FOREIGN KEY(account_id,revision) REFERENCES customer_balance_policy_revisions(account_id,revision),
    CHECK ((actor_kind='installation' AND actor_operator_id IS NULL)
        OR (actor_kind='operator' AND actor_operator_id IS NOT NULL))
);
CREATE FUNCTION validate_customer_credit_policy_event() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM customer_balance_policy_revisions p
        WHERE p.account_id=NEW.account_id AND p.revision=NEW.revision
          AND p.xmin::text=mod(pg_current_xact_id()::text::numeric,4294967296)::text) THEN
        RAISE EXCEPTION 'credit actor requires a new policy in the same transaction' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER validate_customer_credit_policy_event BEFORE INSERT ON customer_credit_policy_events
    FOR EACH ROW EXECUTE FUNCTION validate_customer_credit_policy_event();
CREATE TRIGGER immutable_customer_credit_policy_event BEFORE UPDATE OR DELETE ON customer_credit_policy_events
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE INDEX customer_credit_policy_events_audit ON customer_credit_policy_events(created_at DESC,id DESC);
