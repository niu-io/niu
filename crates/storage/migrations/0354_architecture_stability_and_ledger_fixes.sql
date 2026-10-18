-- Architecture stability, key spending attribution, request-rate fast-paths,
-- and hot-path composite indexes (#85, #86, #87).

-- 1. Hot-path composite and covering indexes (#87)
CREATE INDEX IF NOT EXISTS attempts_dispatched_window_idx
    ON attempts (dispatched_at, id)
    WHERE dispatched_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS attempts_completed_window_idx
    ON attempts (completed_at, id)
    WHERE completed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS attempts_may_have_executed_id_idx
    ON attempts (id)
    INCLUDE (organization_id, project_id)
    WHERE execution = 'may_have_executed';

CREATE INDEX IF NOT EXISTS media_jobs_created_attempt_idx
    ON media_jobs (created_at, attempt_id);

CREATE INDEX IF NOT EXISTS gateway_retry_policies_key_lookup_idx
    ON gateway_retry_policies (key_id, operation_id);

CREATE INDEX IF NOT EXISTS customer_balance_entries_attempt_charge_account_idx
    ON customer_balance_entries (attempt_id, account_id)
    INCLUDE (amount_nanos, id)
    WHERE kind = 'charge' AND attempt_id IS NOT NULL;

-- 2. Key spending attribution & index-friendly key committed lookup (#85, #87)
CREATE OR REPLACE FUNCTION niu_customer_attempt_spending_root(p_attempt UUID)
RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT k.spending_root_id FROM attempts a
    LEFT JOIN inspected_guardrail_bindings b ON b.attempt_id=a.id
    LEFT JOIN gateway_retry_policies rp ON rp.operation_id=a.operation_id
    JOIN api_keys k ON k.id=COALESCE(a.api_key_id,b.key_id,rp.key_id)
        AND k.organization_id=a.organization_id AND k.project_id=a.project_id
    WHERE a.id=p_attempt
$$;

CREATE OR REPLACE FUNCTION niu_customer_key_committed(p_root UUID, p_account UUID)
RETURNS NUMERIC LANGUAGE sql VOLATILE AS $$
    WITH root_keys AS MATERIALIZED (
        SELECT organization_id, project_id, id
        FROM api_keys
        WHERE spending_root_id = p_root
    ),
    root_attempts AS MATERIALIZED (
        SELECT a.id AS attempt_id
        FROM root_keys k
        JOIN attempts a
          ON a.api_key_id = k.id
         AND a.organization_id = k.organization_id
         AND a.project_id = k.project_id
        UNION
        SELECT a.id AS attempt_id
        FROM root_keys k
        JOIN inspected_guardrail_bindings b ON b.key_id = k.id
        JOIN attempts a
          ON a.id = b.attempt_id
         AND a.organization_id = k.organization_id
         AND a.project_id = k.project_id
        UNION
        SELECT a.id AS attempt_id
        FROM root_keys k
        JOIN gateway_retry_policies rp ON rp.key_id = k.id
        JOIN attempts a
          ON a.operation_id = rp.operation_id
         AND a.organization_id = k.organization_id
         AND a.project_id = k.project_id
    )
    SELECT COALESCE((
        SELECT -SUM(e.amount_nanos)
        FROM root_attempts ra
        JOIN customer_balance_entries e ON e.attempt_id = ra.attempt_id
        WHERE e.account_id = p_account
          AND e.kind = 'charge'
    ), 0)
    - COALESCE((
        SELECT SUM(r.amount_nanos)
        FROM root_attempts ra
        JOIN customer_balance_entries c ON c.attempt_id = ra.attempt_id
        JOIN customer_balance_entries r ON r.reverses_entry_id = c.id
        WHERE c.account_id = p_account
          AND c.kind = 'charge'
          AND r.account_id = p_account
          AND r.kind = 'refund'
    ), 0)
    + COALESCE((
        SELECT SUM(GREATEST(r.amount_nanos, COALESCE(m.amount_nanos, 0)))
        FROM root_attempts ra
        JOIN customer_balance_reservations r ON r.attempt_id = ra.attempt_id
        LEFT JOIN customer_media_charges m ON m.attempt_id = r.attempt_id
        WHERE r.account_id = p_account
          AND r.released_at IS NULL
          AND NOT EXISTS (
              SELECT 1 FROM customer_balance_entries e
              WHERE e.attempt_id = r.attempt_id AND e.kind = 'charge'
          )
    ), 0)
$$;

-- 3. Request-rate trigger fast-path restoration (#86)
CREATE OR REPLACE FUNCTION niu_enforce_key_request_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    root UUID;
    rpm BIGINT;
    admitted BIGINT;
    checked_at TIMESTAMPTZ;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN
        RETURN NEW;
    END IF;
    SELECT spending_root_id INTO root FROM api_keys WHERE id=NEW.api_key_id;
    IF root IS NULL THEN RETURN NEW; END IF;
    PERFORM 1 FROM key_request_rate_limits
        WHERE spending_root_id=root AND requests_per_minute IS NULL FOR SHARE;
    IF FOUND THEN
        RETURN NEW;
    END IF;
    -- Lock the configured policy, not the key row: dispatch already holds key SHARE locks.
    SELECT requests_per_minute INTO rpm FROM key_request_rate_limits
        WHERE spending_root_id=root FOR UPDATE;
    IF NOT FOUND OR rpm IS NULL THEN RETURN NEW; END IF;
    IF rpm = 0 THEN
        RAISE EXCEPTION 'API key request rate is disabled' USING ERRCODE='P0026';
    END IF;
    checked_at := clock_timestamp();
    SELECT count(*) INTO admitted FROM key_request_rate_admissions
        WHERE spending_root_id=root AND admitted_at > checked_at - INTERVAL '60 seconds';
    IF admitted >= rpm THEN
        RAISE EXCEPTION 'API key request rate exhausted' USING ERRCODE='P0020';
    END IF;
    DELETE FROM key_request_rate_admissions
        WHERE spending_root_id=root AND admitted_at <= checked_at - INTERVAL '60 seconds';
    INSERT INTO key_request_rate_admissions(attempt_id,spending_root_id,admitted_at)
        VALUES(NEW.id,root,checked_at);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION niu_enforce_vendor_request_rate() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    credential UUID;
    credentials UUID[];
    rpm BIGINT;
    checked_at TIMESTAMPTZ;
BEGIN
    IF NEW.dispatched_at IS NULL OR (TG_OP='UPDATE' AND OLD.dispatched_at IS NOT NULL) THEN
        RETURN NEW;
    END IF;
    -- The immutable attempt bindings identify the actual credential, never the current alias.
    SELECT array_agg(vendor_id) INTO credentials FROM (
        SELECT vendor_id FROM managed_attempt_routes WHERE attempt_id=NEW.id
        UNION SELECT vendor_id FROM personal_attempt_routes WHERE attempt_id=NEW.id
        UNION SELECT vendor_id FROM media_recovery_routes WHERE attempt_id=NEW.id
    ) bound;
    IF cardinality(credentials) > 1 THEN
        RAISE EXCEPTION 'Conflicting credential bindings' USING ERRCODE='P0024';
    END IF;
    credential := credentials[1];
    IF credential IS NULL THEN RETURN NEW; END IF;
    PERFORM 1 FROM vendor_request_rate_limits
        WHERE vendor_id=credential AND requests_per_minute IS NULL FOR SHARE;
    IF FOUND THEN
        RETURN NEW;
    END IF;
    -- Serialize policy edits and admissions without upgrading vendor SHARE locks.
    SELECT requests_per_minute INTO rpm FROM vendor_request_rate_limits
        WHERE vendor_id=credential FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credential rate policy missing' USING ERRCODE='P0024'; END IF;
    IF rpm IS NULL THEN
        RETURN NEW;
    END IF;
    IF rpm = 0 THEN
        RAISE EXCEPTION 'Upstream credential request rate is disabled' USING ERRCODE='P0027';
    END IF;
    checked_at := clock_timestamp();
    IF (SELECT count(*) FROM vendor_request_rate_admissions
        WHERE vendor_id=credential AND admitted_at > checked_at - INTERVAL '60 seconds') >= rpm THEN
        RAISE EXCEPTION 'Upstream credential request rate exhausted' USING ERRCODE='P0025';
    END IF;
    DELETE FROM vendor_request_rate_admissions WHERE vendor_id=credential
        AND admitted_at <= checked_at - INTERVAL '60 seconds';
    INSERT INTO vendor_request_rate_admissions(attempt_id,vendor_id,admitted_at)
        VALUES(NEW.id,credential,checked_at);
    RETURN NEW;
END;
$$;

-- 4. Priced dispatch rate-denial audit function (#86)
CREATE OR REPLACE FUNCTION niu_reserve_and_dispatch_gateway_audited(
    p_organization_id UUID, p_project_id UUID, p_key_id UUID, p_attempt_id UUID,
    p_price_revision_id UUID, p_resource_id TEXT, p_offer_revision TEXT,
    p_prompt_bound BIGINT, p_completion_bound BIGINT, p_audit_rate_denial BOOLEAN
) RETURNS BIGINT LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    rejection TEXT;
    metadata JSONB;
    denial_kind TEXT;
    denial_code BIGINT;
    key_name TEXT;
    key_rev BIGINT;
BEGIN
    BEGIN
        PERFORM niu_reserve_and_dispatch_gateway(p_organization_id,p_project_id,p_key_id,p_attempt_id,p_price_revision_id,p_resource_id,p_offer_revision,p_prompt_bound,p_completion_bound);
        RETURN 1;
    EXCEPTION
        WHEN SQLSTATE 'P0010' THEN
            GET STACKED DIAGNOSTICS rejection = PG_EXCEPTION_DETAIL;
            metadata := rejection::jsonb;
            INSERT INTO dispatch_guardrail_rejections(organization_id,project_id,attempt_id,key_id,reason,workspace_revision,key_policy_revision,key_assignment_revision)
            VALUES(p_organization_id,p_project_id,p_attempt_id,p_key_id,metadata->>'reason',(metadata->>'workspace_revision')::BIGINT,(metadata->>'key_policy_revision')::BIGINT,(metadata->>'key_assignment_revision')::BIGINT);
            RETURN -1;
        WHEN SQLSTATE 'P0026' THEN
            IF NOT COALESCE(p_audit_rate_denial, FALSE) THEN
                RAISE;
            END IF;
            denial_kind := 'key_request_rate_disabled';
            denial_code := -2;
        WHEN SQLSTATE 'P0020' THEN
            IF NOT COALESCE(p_audit_rate_denial, FALSE) THEN
                RAISE;
            END IF;
            denial_kind := 'key_request_rate_exceeded';
            denial_code := -3;
    END;

    SELECT name, revision INTO key_name, key_rev
    FROM api_keys
    WHERE id = p_key_id AND organization_id = p_organization_id AND project_id = p_project_id;
    IF FOUND THEN
        INSERT INTO gateway_admission_denials
            (attempt_id,organization_id,project_id,requested_key_id,requested_key_name,requested_key_revision,kind,http_status)
        VALUES (p_attempt_id,p_organization_id,p_project_id,p_key_id,key_name,key_rev,denial_kind,429)
        ON CONFLICT (attempt_id) DO NOTHING;
    END IF;
    RETURN denial_code;
END;
$$;

CREATE OR REPLACE FUNCTION niu_reserve_and_dispatch_gateway_audited(
    p_organization_id UUID, p_project_id UUID, p_key_id UUID, p_attempt_id UUID,
    p_price_revision_id UUID, p_resource_id TEXT, p_offer_revision TEXT,
    p_prompt_bound BIGINT, p_completion_bound BIGINT
) RETURNS BOOLEAN LANGUAGE plpgsql VOLATILE AS $$
BEGIN
    RETURN niu_reserve_and_dispatch_gateway_audited(
        p_organization_id, p_project_id, p_key_id, p_attempt_id,
        p_price_revision_id, p_resource_id, p_offer_revision,
        p_prompt_bound, p_completion_bound, FALSE
    ) = 1;
END;
$$;
