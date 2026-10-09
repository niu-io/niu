-- Secret rotation retains one spending identity and all historical liabilities.
ALTER TABLE api_keys ADD COLUMN spending_root_id UUID;
WITH RECURSIVE lineage AS (
    SELECT k.id, k.id AS root FROM api_keys k
    WHERE NOT EXISTS (SELECT 1 FROM key_audit_events e WHERE e.action='rotated' AND e.replacement_key_id=k.id)
    UNION ALL
    SELECT e.replacement_key_id, l.root FROM lineage l
    JOIN key_audit_events e ON e.key_id=l.id AND e.action='rotated'
    WHERE e.replacement_key_id IS NOT NULL
)
UPDATE api_keys k SET spending_root_id=l.root FROM lineage l WHERE l.id=k.id;
ALTER TABLE api_keys ALTER COLUMN spending_root_id SET NOT NULL;
ALTER TABLE api_keys ADD FOREIGN KEY (organization_id,project_id,spending_root_id)
    REFERENCES api_keys(organization_id,project_id,id);
CREATE INDEX api_keys_spending_root ON api_keys(spending_root_id,id);
CREATE FUNCTION protect_key_spending_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='INSERT' THEN
        NEW.spending_root_id := COALESCE(NEW.spending_root_id,NEW.id);
    ELSIF NEW.spending_root_id IS DISTINCT FROM OLD.spending_root_id THEN
        RAISE EXCEPTION 'key spending identity is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_key_spending_identity BEFORE INSERT OR UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION protect_key_spending_identity();

CREATE TABLE customer_key_spending_limits (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    spending_root_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    limit_nanos BIGINT CHECK (limit_nanos>=0), -- NULL explicitly restores unlimited.
    revision BIGINT NOT NULL CHECK (revision>0),
    PRIMARY KEY (organization_id,project_id,spending_root_id,currency),
    FOREIGN KEY (organization_id,project_id,spending_root_id) REFERENCES api_keys(organization_id,project_id,id),
    FOREIGN KEY (organization_id,account_id,currency) REFERENCES customer_balance_accounts(organization_id,id,currency)
);
CREATE FUNCTION niu_customer_attempt_spending_root(p_attempt UUID)
RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT k.spending_root_id FROM attempts a
    LEFT JOIN inspected_guardrail_bindings b ON b.attempt_id=a.id
    JOIN api_keys k ON k.id=COALESCE(a.api_key_id,b.key_id)
        AND k.organization_id=a.organization_id AND k.project_id=a.project_id
    WHERE a.id=p_attempt
$$;
CREATE FUNCTION niu_customer_key_committed(p_root UUID,p_account UUID)
RETURNS NUMERIC LANGUAGE sql VOLATILE AS $$
    SELECT COALESCE((SELECT -SUM(e.amount_nanos) FROM customer_balance_entries e
        WHERE e.account_id=p_account AND e.kind='charge'
          AND niu_customer_attempt_spending_root(e.attempt_id)=p_root),0)
      - COALESCE((SELECT SUM(r.amount_nanos) FROM customer_balance_entries r
        JOIN customer_balance_entries c ON c.id=r.reverses_entry_id
        WHERE r.account_id=p_account AND r.kind='refund' AND c.kind='charge'
          AND niu_customer_attempt_spending_root(c.attempt_id)=p_root),0)
      + COALESCE((SELECT SUM(r.amount_nanos) FROM customer_balance_reservations r
        WHERE r.account_id=p_account AND r.released_at IS NULL
          AND niu_customer_attempt_spending_root(r.attempt_id)=p_root
          AND NOT EXISTS(SELECT 1 FROM customer_balance_entries e WHERE e.attempt_id=r.attempt_id AND e.kind='charge')),0)
$$;
CREATE FUNCTION protect_customer_key_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'key limits cannot be deleted'; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR UPDATE;
    IF (TG_OP='INSERT' AND NEW.revision<>1) OR
       (TG_OP='UPDATE' AND (NEW.revision<>OLD.revision+1 OR
        ROW(NEW.organization_id,NEW.project_id,NEW.spending_root_id,NEW.account_id,NEW.currency)
        IS DISTINCT FROM ROW(OLD.organization_id,OLD.project_id,OLD.spending_root_id,OLD.account_id,OLD.currency))) THEN
        RAISE EXCEPTION 'invalid key limit revision' USING ERRCODE='23514';
    END IF;
    IF NEW.limit_nanos IS NOT NULL AND EXISTS (
        SELECT 1 FROM customer_balance_reservations r JOIN attempts a ON a.id=r.attempt_id
        WHERE r.account_id=NEW.account_id AND a.project_id=NEW.project_id
          AND r.released_at IS NULL AND niu_customer_attempt_spending_root(r.attempt_id) IS NULL
    ) THEN
        RAISE EXCEPTION 'unattributed liabilities require reconciliation before setting a key limit' USING ERRCODE='23514';
    END IF;
    IF NEW.limit_nanos IS NOT NULL AND niu_customer_key_committed(NEW.spending_root_id,NEW.account_id)>NEW.limit_nanos THEN
        RAISE EXCEPTION 'key limit below committed liability' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_customer_key_limit BEFORE INSERT OR UPDATE OR DELETE ON customer_key_spending_limits
    FOR EACH ROW EXECUTE FUNCTION protect_customer_key_limit();
CREATE FUNCTION enforce_customer_key_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root UUID; maximum BIGINT; workspace UUID;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR UPDATE;
    root := niu_customer_attempt_spending_root(NEW.attempt_id);
    SELECT project_id INTO workspace FROM attempts WHERE id=NEW.attempt_id;
    IF root IS NULL AND EXISTS(SELECT 1 FROM customer_key_spending_limits
        WHERE organization_id=NEW.organization_id AND project_id=workspace
          AND account_id=NEW.account_id AND limit_nanos IS NOT NULL) THEN
        RAISE EXCEPTION 'key attribution required for bounded spending' USING ERRCODE='23514';
    END IF;
    SELECT limit_nanos INTO maximum FROM customer_key_spending_limits
        WHERE organization_id=NEW.organization_id AND spending_root_id=root AND account_id=NEW.account_id;
    IF maximum IS NOT NULL AND niu_customer_key_committed(root,NEW.account_id)+NEW.amount_nanos>maximum THEN
        RAISE EXCEPTION 'customer key spending limit exceeded' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_customer_key_reservation BEFORE INSERT ON customer_balance_reservations
    FOR EACH ROW EXECUTE FUNCTION enforce_customer_key_reservation();

CREATE TABLE customer_key_limit_history (
    organization_id UUID NOT NULL, project_id UUID NOT NULL, spending_root_id UUID NOT NULL,
    currency TEXT NOT NULL, revision BIGINT NOT NULL, limit_nanos BIGINT CHECK(limit_nanos>=0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('installation','member')),
    actor_name TEXT NOT NULL,
    actor_operator_id UUID REFERENCES admin_operators(id),
    CHECK ((actor_kind='installation' AND actor_operator_id IS NULL) OR (actor_kind='member' AND actor_operator_id IS NOT NULL)),
    PRIMARY KEY(organization_id,project_id,spending_root_id,currency,revision),
    FOREIGN KEY(organization_id,project_id,spending_root_id,currency)
        REFERENCES customer_key_spending_limits(organization_id,project_id,spending_root_id,currency)
);
CREATE TRIGGER immutable_customer_key_limit_history BEFORE UPDATE OR DELETE ON customer_key_limit_history
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
