-- Avoid dirtying and rolling back expired rate-admission rows on rejected 429 attempts,
-- and record key request-rate denials in the same dispatch transaction via subtransaction rollback.

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
    -- Lock the configured policy, not the key row: dispatch already holds key SHARE locks.
    SELECT requests_per_minute INTO rpm FROM key_request_rate_limits
        WHERE spending_root_id=root FOR UPDATE;
    IF NOT FOUND THEN RETURN NEW; END IF;
    IF rpm = 0 THEN
        RAISE EXCEPTION 'API key request rate is disabled' USING ERRCODE='P0026';
    END IF;
    checked_at := clock_timestamp();
    IF rpm IS NOT NULL THEN
        SELECT count(*) INTO admitted FROM key_request_rate_admissions
            WHERE spending_root_id=root AND admitted_at > checked_at - INTERVAL '60 seconds';
        IF admitted >= rpm THEN
            RAISE EXCEPTION 'API key request rate exhausted' USING ERRCODE='P0020';
        END IF;
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
    -- Serialize policy edits and admissions without upgrading vendor SHARE locks.
    SELECT requests_per_minute INTO rpm FROM vendor_request_rate_limits
        WHERE vendor_id=credential FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Credential rate policy missing' USING ERRCODE='P0024'; END IF;
    IF rpm = 0 THEN
        RAISE EXCEPTION 'Upstream credential request rate is disabled' USING ERRCODE='P0027';
    END IF;
    checked_at := clock_timestamp();
    IF rpm IS NOT NULL AND (SELECT count(*) FROM vendor_request_rate_admissions
        WHERE vendor_id=credential AND admitted_at > checked_at - INTERVAL '60 seconds') >= rpm THEN
        RAISE EXCEPTION 'Upstream credential request rate exhausted' USING ERRCODE='P0025';
    END IF;
    DELETE FROM vendor_request_rate_admissions WHERE vendor_id=credential
        AND admitted_at <= checked_at - INTERVAL '60 seconds';
    -- Count even unlimited dispatches so applying a cap cannot forget the current window.
    INSERT INTO vendor_request_rate_admissions(attempt_id,vendor_id,admitted_at)
        VALUES(NEW.id,credential,checked_at);
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION niu_mark_dispatched_with_guardrail_audit(UUID,UUID,UUID,UUID,BOOLEAN)
RETURNS BIGINT LANGUAGE plpgsql AS $$
DECLARE
    changed BIGINT;
    rejection TEXT;
    metadata JSONB;
    denial_kind TEXT;
    denial_code BIGINT;
    key_name TEXT;
    key_rev BIGINT;
BEGIN
    BEGIN
        UPDATE attempts a
        SET execution = 'may_have_executed', dispatched_at = clock_timestamp(), api_key_id = $4
        FROM operations o, api_keys k
        WHERE a.organization_id = $1 AND a.project_id = $2 AND a.id = $3
            AND a.execution = 'not_sent' AND o.id = a.operation_id AND k.id = $4
            AND ('*' = ANY(k.allowed_models) OR o.model_alias = ANY(k.allowed_models))
            AND k.expires_at > clock_timestamp()
            AND NOT EXISTS (
                SELECT 1 FROM account_assignments s
                WHERE s.attempt_id=a.id AND s.state <> 'held'
            )
            AND (
                NOT EXISTS (
                    SELECT 1 FROM project_budgets b
                    WHERE b.organization_id=$1 AND b.project_id=$2
                )
                OR EXISTS (
                    SELECT 1 FROM cost_reservations r
                    WHERE r.attempt_id=a.id AND r.state='held'
                )
                OR EXISTS (
                    SELECT 1 FROM personal_attempt_routes personal
                    WHERE personal.attempt_id=a.id
                )
            );
        GET DIAGNOSTICS changed = ROW_COUNT;
        RETURN changed;
    EXCEPTION
        WHEN SQLSTATE 'P0010' THEN
            GET STACKED DIAGNOSTICS rejection = PG_EXCEPTION_DETAIL;
            metadata := rejection::jsonb;
            INSERT INTO dispatch_guardrail_rejections(organization_id,project_id,attempt_id,key_id,reason,workspace_revision,key_policy_revision,key_assignment_revision)
            VALUES($1,$2,$3,$4,metadata->>'reason',(metadata->>'workspace_revision')::BIGINT,(metadata->>'key_policy_revision')::BIGINT,(metadata->>'key_assignment_revision')::BIGINT);
            RETURN -1;
        WHEN SQLSTATE 'P0026' THEN
            IF NOT COALESCE($5, FALSE) THEN
                RAISE;
            END IF;
            denial_kind := 'key_request_rate_disabled';
            denial_code := -2;
        WHEN SQLSTATE 'P0020' THEN
            IF NOT COALESCE($5, FALSE) THEN
                RAISE;
            END IF;
            denial_kind := 'key_request_rate_exceeded';
            denial_code := -3;
    END;

    SELECT name, revision INTO key_name, key_rev
    FROM api_keys
    WHERE id = $4 AND organization_id = $1 AND project_id = $2;
    IF FOUND THEN
        INSERT INTO gateway_admission_denials
            (attempt_id,organization_id,project_id,requested_key_id,requested_key_name,requested_key_revision,kind,http_status)
        VALUES ($3,$1,$2,$4,key_name,key_rev,denial_kind,429)
        ON CONFLICT (attempt_id) DO NOTHING;
    END IF;
    RETURN denial_code;
END;
$$;

CREATE OR REPLACE FUNCTION niu_mark_dispatched_with_guardrail_audit(UUID,UUID,UUID,UUID)
RETURNS BIGINT LANGUAGE plpgsql AS $$
BEGIN
    RETURN niu_mark_dispatched_with_guardrail_audit($1, $2, $3, $4, FALSE);
END;
$$;
