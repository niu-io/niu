-- Separate Credits workspace and API-key spending limits (#110).
-- Existing monetary caps in customer_workspace_spending_limits and
-- customer_key_spending_limits remain preserved for currency mode and block
-- Credits admission until an explicit Credits policy revision is published.

CREATE TABLE customer_unit_workspace_spending_limits (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    definition_revision BIGINT NOT NULL REFERENCES customer_unit_definitions(revision),
    limit_atoms BIGINT CHECK (limit_atoms >= 0), -- NULL explicitly configures unlimited in Credits.
    revision BIGINT NOT NULL CHECK (revision > 0),
    PRIMARY KEY (organization_id, project_id),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id)
);

CREATE TABLE customer_unit_workspace_limit_history (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    revision BIGINT NOT NULL CHECK (revision > 0),
    expected_revision BIGINT NOT NULL CHECK (expected_revision >= 0 AND revision = expected_revision + 1),
    definition_revision BIGINT NOT NULL REFERENCES customer_unit_definitions(revision),
    limit_atoms BIGINT CHECK (limit_atoms >= 0),
    idempotency_key UUID NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'member')),
    actor_name TEXT NOT NULL CHECK (
        char_length(actor_name) BETWEEN 1 AND 200
        AND actor_name = btrim(actor_name)
        AND actor_name !~ '[[:cntrl:]]'
    ),
    actor_operator_id UUID REFERENCES admin_operators(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id, project_id, revision),
    UNIQUE (organization_id, project_id, idempotency_key),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    CHECK ((actor_kind = 'member') = (actor_operator_id IS NOT NULL))
);
CREATE TRIGGER immutable_customer_unit_workspace_limit_history
    BEFORE UPDATE OR DELETE ON customer_unit_workspace_limit_history
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE TABLE customer_unit_key_spending_limits (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    spending_root_id UUID NOT NULL,
    definition_revision BIGINT NOT NULL REFERENCES customer_unit_definitions(revision),
    limit_atoms BIGINT CHECK (limit_atoms >= 0), -- NULL explicitly configures unlimited in Credits.
    revision BIGINT NOT NULL CHECK (revision > 0),
    PRIMARY KEY (organization_id, project_id, spending_root_id),
    FOREIGN KEY (organization_id, project_id, spending_root_id)
        REFERENCES api_keys(organization_id, project_id, id)
);

CREATE TABLE customer_unit_key_limit_history (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    spending_root_id UUID NOT NULL,
    revision BIGINT NOT NULL CHECK (revision > 0),
    expected_revision BIGINT NOT NULL CHECK (expected_revision >= 0 AND revision = expected_revision + 1),
    definition_revision BIGINT NOT NULL REFERENCES customer_unit_definitions(revision),
    limit_atoms BIGINT CHECK (limit_atoms >= 0),
    idempotency_key UUID NOT NULL,
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'member')),
    actor_name TEXT NOT NULL CHECK (
        char_length(actor_name) BETWEEN 1 AND 200
        AND actor_name = btrim(actor_name)
        AND actor_name !~ '[[:cntrl:]]'
    ),
    actor_operator_id UUID REFERENCES admin_operators(id),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id, project_id, spending_root_id, revision),
    UNIQUE (organization_id, project_id, spending_root_id, idempotency_key),
    FOREIGN KEY (organization_id, project_id, spending_root_id)
        REFERENCES api_keys(organization_id, project_id, id),
    CHECK ((actor_kind = 'member') = (actor_operator_id IS NOT NULL))
);
CREATE TRIGGER immutable_customer_unit_key_limit_history
    BEFORE UPDATE OR DELETE ON customer_unit_key_limit_history
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION niu_customer_unit_workspace_committed(
    p_organization UUID,
    p_project UUID,
    p_exclude_attempt UUID DEFAULT NULL
) RETURNS NUMERIC LANGUAGE sql VOLATILE AS $$
    SELECT COALESCE((
        SELECT SUM(s.charged_atoms)
        FROM customer_unit_reservations r
        JOIN customer_unit_resolutions s ON s.attempt_id = r.attempt_id
        WHERE r.organization_id = p_organization
          AND r.project_id = p_project
          AND (p_exclude_attempt IS NULL OR r.attempt_id <> p_exclude_attempt)
          AND s.kind = 'charge'
    ), 0)
    - COALESCE((
        SELECT SUM(rest.end_atom - rest.first_atom)
        FROM customer_unit_reservations r
        JOIN customer_unit_resolutions s ON s.attempt_id = r.attempt_id
        JOIN customer_unit_restorations rest ON rest.attempt_id = s.attempt_id
        WHERE r.organization_id = p_organization
          AND r.project_id = p_project
          AND (p_exclude_attempt IS NULL OR r.attempt_id <> p_exclude_attempt)
          AND s.kind = 'charge'
    ), 0)
    + COALESCE((
        SELECT SUM(GREATEST(
            r.maximum_atoms::numeric + COALESCE(e.additional_atoms, 0),
            COALESCE(c.charged_atoms, 0)::numeric
        ))
        FROM customer_unit_reservations r
        LEFT JOIN customer_unit_reservation_extensions e ON e.attempt_id = r.attempt_id
        LEFT JOIN customer_unit_text_charges c ON c.attempt_id = r.attempt_id
        WHERE r.organization_id = p_organization
          AND r.project_id = p_project
          AND (p_exclude_attempt IS NULL OR r.attempt_id <> p_exclude_attempt)
          AND NOT EXISTS (
              SELECT 1 FROM customer_unit_resolutions s
              WHERE s.attempt_id = r.attempt_id
          )
    ), 0)
$$;

CREATE FUNCTION niu_customer_unit_key_committed(
    p_organization UUID,
    p_project UUID,
    p_root UUID,
    p_exclude_attempt UUID DEFAULT NULL
) RETURNS NUMERIC LANGUAGE sql VOLATILE AS $$
    WITH root_keys AS MATERIALIZED (
        SELECT organization_id, project_id, id
        FROM api_keys
        WHERE organization_id = p_organization
          AND project_id = p_project
          AND spending_root_id = p_root
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
        SELECT SUM(s.charged_atoms)
        FROM root_attempts ra
        JOIN customer_unit_reservations r ON r.attempt_id = ra.attempt_id
        JOIN customer_unit_resolutions s ON s.attempt_id = r.attempt_id
        WHERE r.organization_id = p_organization
          AND r.project_id = p_project
          AND (p_exclude_attempt IS NULL OR r.attempt_id <> p_exclude_attempt)
          AND s.kind = 'charge'
    ), 0)
    - COALESCE((
        SELECT SUM(rest.end_atom - rest.first_atom)
        FROM root_attempts ra
        JOIN customer_unit_reservations r ON r.attempt_id = ra.attempt_id
        JOIN customer_unit_resolutions s ON s.attempt_id = r.attempt_id
        JOIN customer_unit_restorations rest ON rest.attempt_id = s.attempt_id
        WHERE r.organization_id = p_organization
          AND r.project_id = p_project
          AND (p_exclude_attempt IS NULL OR r.attempt_id <> p_exclude_attempt)
          AND s.kind = 'charge'
    ), 0)
    + COALESCE((
        SELECT SUM(GREATEST(
            r.maximum_atoms::numeric + COALESCE(e.additional_atoms, 0),
            COALESCE(c.charged_atoms, 0)::numeric
        ))
        FROM root_attempts ra
        JOIN customer_unit_reservations r ON r.attempt_id = ra.attempt_id
        LEFT JOIN customer_unit_reservation_extensions e ON e.attempt_id = r.attempt_id
        LEFT JOIN customer_unit_text_charges c ON c.attempt_id = r.attempt_id
        WHERE r.organization_id = p_organization
          AND r.project_id = p_project
          AND (p_exclude_attempt IS NULL OR r.attempt_id <> p_exclude_attempt)
          AND NOT EXISTS (
              SELECT 1 FROM customer_unit_resolutions s
              WHERE s.attempt_id = r.attempt_id
          )
    ), 0)
$$;

CREATE FUNCTION protect_customer_unit_workspace_limit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Credits workspace spending limits cannot be deleted' USING ERRCODE = '23514';
    END IF;
    PERFORM organization_id FROM customer_unit_accounts WHERE organization_id = NEW.organization_id FOR NO KEY UPDATE;
    IF (TG_OP = 'INSERT' AND NEW.revision <> 1)
       OR (TG_OP = 'UPDATE' AND (
            NEW.revision <> OLD.revision + 1
            OR ROW(NEW.organization_id, NEW.project_id) IS DISTINCT FROM ROW(OLD.organization_id, OLD.project_id)
       ))
       OR NOT EXISTS (
            SELECT 1 FROM customer_unit_workspace_limit_history h
            WHERE h.organization_id = NEW.organization_id
              AND h.project_id = NEW.project_id
              AND h.revision = NEW.revision
              AND h.definition_revision = NEW.definition_revision
              AND h.limit_atoms IS NOT DISTINCT FROM NEW.limit_atoms
       ) THEN
        RAISE EXCEPTION 'Credits workspace spending limit requires a matching sequential history revision'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.limit_atoms IS NOT NULL
       AND niu_customer_unit_workspace_committed(NEW.organization_id, NEW.project_id) > NEW.limit_atoms THEN
        RAISE EXCEPTION 'Credits workspace spending limit is below committed liability'
            USING ERRCODE = '23514', CONSTRAINT = 'customer_unit_workspace_limit_below_committed';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_customer_unit_workspace_limit
    BEFORE INSERT OR UPDATE OR DELETE ON customer_unit_workspace_spending_limits
    FOR EACH ROW EXECUTE FUNCTION protect_customer_unit_workspace_limit();

CREATE FUNCTION protect_customer_unit_key_limit() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Credits key spending limits cannot be deleted' USING ERRCODE = '23514';
    END IF;
    PERFORM organization_id FROM customer_unit_accounts WHERE organization_id = NEW.organization_id FOR NO KEY UPDATE;
    IF NOT EXISTS (
        SELECT 1 FROM api_keys k
        WHERE k.organization_id = NEW.organization_id
          AND k.project_id = NEW.project_id
          AND k.id = NEW.spending_root_id
          AND k.spending_root_id = NEW.spending_root_id
    ) THEN
        RAISE EXCEPTION 'Credits key spending limit must target a root spending identity'
            USING ERRCODE = '23514';
    END IF;
    IF (TG_OP = 'INSERT' AND NEW.revision <> 1)
       OR (TG_OP = 'UPDATE' AND (
            NEW.revision <> OLD.revision + 1
            OR ROW(NEW.organization_id, NEW.project_id, NEW.spending_root_id)
               IS DISTINCT FROM ROW(OLD.organization_id, OLD.project_id, OLD.spending_root_id)
       ))
       OR NOT EXISTS (
            SELECT 1 FROM customer_unit_key_limit_history h
            WHERE h.organization_id = NEW.organization_id
              AND h.project_id = NEW.project_id
              AND h.spending_root_id = NEW.spending_root_id
              AND h.revision = NEW.revision
              AND h.definition_revision = NEW.definition_revision
              AND h.limit_atoms IS NOT DISTINCT FROM NEW.limit_atoms
       ) THEN
        RAISE EXCEPTION 'Credits key spending limit requires a matching sequential history revision'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.limit_atoms IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM customer_unit_reservations r
            WHERE r.organization_id = NEW.organization_id
              AND r.project_id = NEW.project_id
              AND niu_customer_attempt_spending_root(r.attempt_id) IS NULL
              AND NOT EXISTS (
                  SELECT 1 FROM customer_unit_resolutions s
                  WHERE s.attempt_id = r.attempt_id AND s.kind = 'release'
              )
        ) THEN
            RAISE EXCEPTION 'Unattributed Credits liabilities require reconciliation before setting a key limit'
                USING ERRCODE = '23514';
        END IF;
        IF niu_customer_unit_key_committed(NEW.organization_id, NEW.project_id, NEW.spending_root_id) > NEW.limit_atoms THEN
            RAISE EXCEPTION 'Credits key spending limit is below committed liability'
                USING ERRCODE = '23514', CONSTRAINT = 'customer_unit_key_limit_below_committed';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER protect_customer_unit_key_limit
    BEFORE INSERT OR UPDATE OR DELETE ON customer_unit_key_spending_limits
    FOR EACH ROW EXECUTE FUNCTION protect_customer_unit_key_limit();

CREATE FUNCTION enforce_customer_unit_spending_limits() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
    root UUID;
    workspace_maximum BIGINT;
    key_maximum BIGINT;
BEGIN
    PERFORM organization_id FROM customer_unit_accounts WHERE organization_id = NEW.organization_id FOR NO KEY UPDATE;
    IF EXISTS (
        SELECT 1 FROM customer_workspace_spending_limits
        WHERE organization_id = NEW.organization_id AND project_id = NEW.project_id
    ) AND NOT EXISTS (
        SELECT 1 FROM customer_unit_workspace_spending_limits
        WHERE organization_id = NEW.organization_id AND project_id = NEW.project_id
    ) THEN
        RAISE EXCEPTION 'Monetary workspace spending limit requires explicit Credits limit configuration'
            USING ERRCODE = '23514', CONSTRAINT = 'customer_unit_workspace_limit_migration_required';
    END IF;

    SELECT limit_atoms INTO workspace_maximum
    FROM customer_unit_workspace_spending_limits
    WHERE organization_id = NEW.organization_id AND project_id = NEW.project_id;
    IF workspace_maximum IS NOT NULL
       AND niu_customer_unit_workspace_committed(NEW.organization_id, NEW.project_id, NEW.attempt_id) + NEW.maximum_atoms > workspace_maximum THEN
        RAISE EXCEPTION 'customer workspace spending limit exceeded'
            USING ERRCODE = '23514', CONSTRAINT = 'customer_workspace_spending_limit_exceeded';
    END IF;

    root := niu_customer_attempt_spending_root(NEW.attempt_id);
    IF root IS NULL THEN
        IF EXISTS (
            SELECT 1 FROM customer_key_spending_limits m
            WHERE m.organization_id = NEW.organization_id
              AND m.project_id = NEW.project_id
              AND m.limit_nanos IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM customer_unit_key_spending_limits u
                  WHERE u.organization_id = m.organization_id
                    AND u.project_id = m.project_id
                    AND u.spending_root_id = m.spending_root_id
              )
        ) OR EXISTS (
            SELECT 1 FROM customer_unit_key_spending_limits u
            WHERE u.organization_id = NEW.organization_id
              AND u.project_id = NEW.project_id
              AND u.limit_atoms IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'key attribution required for bounded spending'
                USING ERRCODE = '23514', CONSTRAINT = 'key_attribution_required_for_bounded_spending';
        END IF;
    ELSE
        IF EXISTS (
            SELECT 1 FROM customer_key_spending_limits m
            WHERE m.organization_id = NEW.organization_id
              AND m.project_id = NEW.project_id
              AND m.spending_root_id = root
              AND m.limit_nanos IS NOT NULL
        ) AND NOT EXISTS (
            SELECT 1 FROM customer_unit_key_spending_limits u
            WHERE u.organization_id = NEW.organization_id
              AND u.project_id = NEW.project_id
              AND u.spending_root_id = root
        ) THEN
            RAISE EXCEPTION 'Monetary key spending limit requires explicit Credits limit configuration'
                USING ERRCODE = '23514', CONSTRAINT = 'customer_unit_key_limit_migration_required';
        END IF;

        SELECT limit_atoms INTO key_maximum
        FROM customer_unit_key_spending_limits
        WHERE organization_id = NEW.organization_id
          AND project_id = NEW.project_id
          AND spending_root_id = root;
        IF key_maximum IS NOT NULL
           AND niu_customer_unit_key_committed(NEW.organization_id, NEW.project_id, root, NEW.attempt_id) + NEW.maximum_atoms > key_maximum THEN
            RAISE EXCEPTION 'customer key spending limit exceeded'
                USING ERRCODE = '23514', CONSTRAINT = 'customer_key_spending_limit_exceeded';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER enforce_customer_unit_spending_limits
    BEFORE INSERT ON customer_unit_reservations
    FOR EACH ROW EXECUTE FUNCTION enforce_customer_unit_spending_limits();
