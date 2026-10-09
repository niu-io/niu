-- Commit before contacting an aggregator. An uncertain request is reconciled,
-- never automatically re-created, even after process replacement.
CREATE TABLE customer_topup_creation_claims (
    order_id UUID PRIMARY KEY REFERENCES customer_topup_orders(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER immutable_customer_topup_creation_claim
    BEFORE UPDATE OR DELETE ON customer_topup_creation_claims
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
