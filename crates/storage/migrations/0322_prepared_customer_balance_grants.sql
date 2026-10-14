-- Durable administrator intent only: preparation never creates balance capacity.
CREATE TABLE prepared_customer_balance_grants (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
    amount_nanos BIGINT NOT NULL CHECK (amount_nanos>0),
    reason TEXT NOT NULL CHECK (length(reason) BETWEEN 1 AND 500 AND reason=trim(reason) AND reason !~ '[[:cntrl:]]'),
    idempotency_key UUID NOT NULL,
    application_policy TEXT NOT NULL CHECK (application_policy IN ('future_only','unpaid_credit_first')),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(organization_id,idempotency_key),
    CHECK ((actor_kind='installation' AND actor_operator_id IS NULL)
        OR (actor_kind='operator' AND actor_operator_id IS NOT NULL))
);
CREATE TRIGGER immutable_prepared_customer_balance_grant BEFORE UPDATE OR DELETE ON prepared_customer_balance_grants
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
CREATE INDEX prepared_customer_balance_grants_history ON prepared_customer_balance_grants(organization_id,currency,created_at DESC,id DESC);
CREATE FUNCTION validate_prepared_customer_balance_grant_match() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM prepared_customer_balance_grants intent
        JOIN customer_balance_grants grant_row ON grant_row.organization_id=intent.organization_id AND grant_row.idempotency_key=intent.idempotency_key
        LEFT JOIN customer_grant_policies policy ON policy.grant_id=grant_row.id
        WHERE intent.organization_id=NEW.organization_id AND intent.idempotency_key=NEW.idempotency_key
          AND (intent.currency<>grant_row.currency OR intent.amount_nanos<>grant_row.amount_nanos OR intent.reason<>grant_row.reason
            OR intent.application_policy<>COALESCE(policy.policy,'future_only'))) THEN
        RAISE EXCEPTION 'grant publication differs from durable intent' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE CONSTRAINT TRIGGER validate_prepared_customer_balance_grant_match AFTER INSERT ON prepared_customer_balance_grants
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_prepared_customer_balance_grant_match();
CREATE CONSTRAINT TRIGGER validate_customer_balance_grant_preparation AFTER INSERT ON customer_balance_grants
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_prepared_customer_balance_grant_match();

CREATE INDEX prepared_customer_balance_grants_audit ON prepared_customer_balance_grants(created_at DESC,id DESC);
