-- Keep the trusted budget reservation and dispatch transition in one database
-- call so network latency does not extend the project-budget row lock.
CREATE FUNCTION niu_reserve_and_dispatch_gateway(
    p_organization_id UUID,
    p_project_id UUID,
    p_key_id UUID,
    p_attempt_id UUID,
    p_price_revision_id UUID,
    p_resource_id TEXT,
    p_offer_revision TEXT,
    p_prompt_bound BIGINT,
    p_completion_bound BIGINT
)
RETURNS VOID
LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    account_eligible BOOLEAN;
    attempt_row RECORD;
    price_row RECORD;
    computed_amount NUMERIC;
    changed BIGINT;
BEGIN
    IF p_prompt_bound < 0 OR p_completion_bound < 0 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0009', MESSAGE = 'invalid token bound';
    END IF;

    -- Revocation, expiry, model permission and project budget creation all
    -- synchronize with this admission before it allocates funds.
    PERFORM k.id
      FROM api_keys k
      JOIN projects p ON p.organization_id=k.organization_id AND p.id=k.project_id
     WHERE k.id=p_key_id
       AND k.organization_id=p_organization_id
       AND k.project_id=p_project_id
       AND k.revoked_at IS NULL
       AND k.expires_at > clock_timestamp()
       AND p_resource_id=ANY(k.allowed_models)
     FOR SHARE OF k, p;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
    END IF;

    SELECT a.health='ready'
           AND a.refresh_owner IS NULL
           AND a.credential_revision=s.credential_revision
      INTO account_eligible
      FROM account_assignments s
      JOIN supplier_accounts a
        ON a.organization_id=s.organization_id
       AND a.project_id=s.project_id
       AND a.id=s.account_id
     WHERE s.organization_id=p_organization_id
       AND s.project_id=p_project_id
       AND s.attempt_id=p_attempt_id
     FOR SHARE OF s, a;
    IF FOUND AND account_eligible IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION USING ERRCODE = 'P0007', MESSAGE = 'supplier account is unavailable';
    END IF;

    SELECT a.execution, a.resource_id, a.offer_revision, o.model_alias
      INTO attempt_row
      FROM attempts a
      JOIN operations o
        ON o.organization_id=a.organization_id
       AND o.project_id=a.project_id
       AND o.id=a.operation_id
     WHERE a.organization_id=p_organization_id
       AND a.project_id=p_project_id
       AND a.id=p_attempt_id
       AND o.model_alias=p_resource_id
     FOR UPDATE OF a;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt does not exist';
    END IF;
    IF attempt_row.execution <> 'not_sent'
       OR attempt_row.resource_id <> p_resource_id
       OR attempt_row.offer_revision <> p_offer_revision THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt conflicts with admission';
    END IF;

    SELECT currency, cash_prompt_rate, cash_completion_rate
      INTO price_row
      FROM price_revisions
     WHERE organization_id=p_organization_id
       AND project_id=p_project_id
       AND id=p_price_revision_id
       AND resource_id=p_resource_id
       AND offer_revision=p_offer_revision;
    IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'price revision does not match route';
    END IF;

    IF EXISTS (SELECT 1 FROM cost_reservations WHERE attempt_id=p_attempt_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt already has a reservation';
    END IF;

    computed_amount := ceil((
        price_row.cash_prompt_rate::NUMERIC * p_prompt_bound::NUMERIC
        + price_row.cash_completion_rate::NUMERIC * p_completion_bound::NUMERIC
    ) / 1000000);
    IF computed_amount > 9223372036854775807::NUMERIC THEN
        RAISE EXCEPTION USING ERRCODE = 'P0009', MESSAGE = 'reservation exceeds supported amount';
    END IF;

    UPDATE project_budgets
       SET reserved_nanos=reserved_nanos + computed_amount::BIGINT
     WHERE organization_id=p_organization_id
       AND project_id=p_project_id
       AND currency=price_row.currency
       AND limit_nanos::NUMERIC - spent_nanos::NUMERIC - reserved_nanos::NUMERIC >= computed_amount
       AND EXISTS (
           SELECT 1 FROM api_keys k
            WHERE k.id=p_key_id
              AND k.organization_id=p_organization_id
              AND k.project_id=p_project_id
              AND k.revoked_at IS NULL
              AND k.expires_at > clock_timestamp()
              AND p_resource_id=ANY(k.allowed_models)
       );
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
        IF NOT EXISTS (
            SELECT 1 FROM api_keys k
             WHERE k.id=p_key_id
               AND k.organization_id=p_organization_id
               AND k.project_id=p_project_id
               AND k.revoked_at IS NULL
               AND k.expires_at > clock_timestamp()
               AND p_resource_id=ANY(k.allowed_models)
        ) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
        END IF;
        RAISE EXCEPTION USING ERRCODE = 'P0008', MESSAGE = 'project budget is unavailable';
    END IF;

    INSERT INTO cost_reservations
        (attempt_id, organization_id, project_id, price_revision_id,
         reserved_nanos, prompt_bound, completion_bound)
    VALUES
        (p_attempt_id, p_organization_id, p_project_id, p_price_revision_id,
         computed_amount::BIGINT, p_prompt_bound, p_completion_bound);

    UPDATE attempts a
       SET execution='may_have_executed',
           dispatched_at=clock_timestamp(),
           api_key_id=p_key_id
     WHERE a.organization_id=p_organization_id
       AND a.project_id=p_project_id
       AND a.id=p_attempt_id
       AND a.execution='not_sent'
       AND EXISTS (
           SELECT 1 FROM api_keys k
            WHERE k.id=p_key_id
              AND k.organization_id=p_organization_id
              AND k.project_id=p_project_id
              AND a.resource_id=ANY(k.allowed_models)
              AND k.revoked_at IS NULL
              AND k.expires_at > clock_timestamp()
       )
       AND NOT EXISTS (
           SELECT 1 FROM account_assignments s
            WHERE s.organization_id=p_organization_id
              AND s.project_id=p_project_id
              AND s.attempt_id=a.id
              AND s.state <> 'held'
       )
       AND EXISTS (
           SELECT 1 FROM cost_reservations r
            WHERE r.organization_id=p_organization_id
              AND r.project_id=p_project_id
              AND r.attempt_id=a.id
              AND r.state='held'
       );
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed <> 1 THEN
        IF NOT EXISTS (
            SELECT 1 FROM api_keys k
             WHERE k.id=p_key_id
               AND k.organization_id=p_organization_id
               AND k.project_id=p_project_id
               AND k.revoked_at IS NULL
               AND k.expires_at > clock_timestamp()
               AND p_resource_id=ANY(k.allowed_models)
        ) THEN
            RAISE EXCEPTION USING ERRCODE = 'P0005', MESSAGE = 'key is unauthorized';
        END IF;
        RAISE EXCEPTION USING ERRCODE = 'P0006', MESSAGE = 'gateway attempt changed during admission';
    END IF;
END;
$$;
