-- Customer retail spending is independent of legacy procurement budgets.
CREATE TABLE customer_workspace_spending_limits (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    account_id UUID NOT NULL,
    currency TEXT NOT NULL,
    limit_nanos BIGINT NOT NULL CHECK (limit_nanos >= 0),
    revision BIGINT NOT NULL CHECK (revision > 0),
    PRIMARY KEY (organization_id, project_id, currency),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id,id),
    FOREIGN KEY (organization_id, account_id, currency)
        REFERENCES customer_balance_accounts(organization_id,id,currency)
);

CREATE FUNCTION niu_customer_workspace_committed(p_organization UUID,p_project UUID,p_account UUID)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
    SELECT COALESCE((SELECT -SUM(e.amount_nanos) FROM customer_balance_entries e
        WHERE e.organization_id=p_organization AND e.project_id=p_project
          AND e.account_id=p_account AND e.kind='charge'),0)
        - COALESCE((SELECT SUM(r.amount_nanos) FROM customer_balance_entries r
            JOIN customer_balance_entries c ON c.id=r.reverses_entry_id
            WHERE r.account_id=p_account AND r.kind='refund'
              AND c.organization_id=p_organization AND c.project_id=p_project AND c.kind='charge'),0)
        + COALESCE((SELECT SUM(r.amount_nanos) FROM customer_balance_reservations r
            JOIN customer_attempt_balance_accounts b ON b.attempt_id=r.attempt_id
            WHERE b.organization_id=p_organization AND b.project_id=p_project
              AND r.account_id=p_account AND r.released_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM customer_balance_entries e
                  WHERE e.attempt_id=r.attempt_id AND e.kind='charge')),0)
$$;

CREATE FUNCTION protect_customer_workspace_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' THEN RAISE EXCEPTION 'spending limits cannot be deleted'; END IF;
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR UPDATE;
    IF TG_OP='UPDATE' AND (ROW(NEW.organization_id,NEW.project_id,NEW.account_id,NEW.currency)
        IS DISTINCT FROM ROW(OLD.organization_id,OLD.project_id,OLD.account_id,OLD.currency)
        OR NEW.revision<>OLD.revision+1) THEN
        RAISE EXCEPTION 'invalid spending limit revision' USING ERRCODE='23514';
    END IF;
    IF TG_OP='INSERT' AND NEW.revision<>1 THEN
        RAISE EXCEPTION 'invalid initial spending limit revision' USING ERRCODE='23514';
    END IF;
    IF niu_customer_workspace_committed(NEW.organization_id,NEW.project_id,NEW.account_id)>NEW.limit_nanos THEN
        RAISE EXCEPTION 'spending limit below committed customer liability' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_customer_workspace_limit BEFORE INSERT OR UPDATE OR DELETE
    ON customer_workspace_spending_limits FOR EACH ROW EXECUTE FUNCTION protect_customer_workspace_limit();

CREATE FUNCTION enforce_customer_workspace_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE workspace UUID; maximum BIGINT;
BEGIN
    PERFORM id FROM customer_balance_accounts WHERE id=NEW.account_id FOR UPDATE;
    SELECT project_id INTO workspace FROM customer_attempt_balance_accounts
        WHERE attempt_id=NEW.attempt_id AND organization_id=NEW.organization_id
          AND account_id=NEW.account_id AND currency=NEW.currency;
    SELECT limit_nanos INTO maximum FROM customer_workspace_spending_limits
        WHERE organization_id=NEW.organization_id AND project_id=workspace
          AND account_id=NEW.account_id AND currency=NEW.currency;
    IF maximum IS NOT NULL AND
        niu_customer_workspace_committed(NEW.organization_id,workspace,NEW.account_id)+NEW.amount_nanos>maximum THEN
        RAISE EXCEPTION 'customer workspace spending limit exceeded' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_customer_workspace_reservation BEFORE INSERT ON customer_balance_reservations
    FOR EACH ROW EXECUTE FUNCTION enforce_customer_workspace_reservation();
