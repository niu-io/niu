-- Limited Preview registration policy, admission rate limits, request queue,
-- and immutable review audit journal.
-- Pending requests store only pre-hashed Argon2id credentials until approved or
-- rejected, at which point password_hash is cleared monotonically.

CREATE TABLE platform_registration_policy (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    mode TEXT NOT NULL DEFAULT 'approval_required'
        CHECK (mode IN ('disabled', 'approval_required')),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO platform_registration_policy (singleton, mode, revision)
VALUES (TRUE, 'approval_required', 1)
ON CONFLICT DO NOTHING;

CREATE TABLE platform_registration_policy_events (
    revision BIGINT PRIMARY KEY CHECK (revision >= 1),
    mode TEXT NOT NULL CHECK (mode IN ('disabled', 'approval_required')),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator', 'unknown')),
    actor_operator_id UUID REFERENCES admin_operators(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK (
        (actor_kind = 'operator' AND actor_operator_id IS NOT NULL)
        OR (actor_kind <> 'operator' AND actor_operator_id IS NULL)
    )
);

CREATE INDEX platform_registration_policy_events_created
    ON platform_registration_policy_events (created_at DESC, revision DESC);

CREATE TRIGGER immutable_platform_registration_policy_events
    BEFORE UPDATE OR DELETE ON platform_registration_policy_events
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

-- Shared bounded admission counters for registration requests.
-- Stores only SHA-256 digests, never plaintext email addresses or client IPs.
CREATE TABLE registration_submission_admission (
    kind TEXT NOT NULL CHECK (kind IN ('global', 'email', 'ip')),
    bucket BYTEA NOT NULL CHECK (octet_length(bucket) = 32),
    window_start TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    attempts INTEGER NOT NULL CHECK (attempts BETWEEN 1 AND 60),
    PRIMARY KEY (kind, bucket)
);

CREATE INDEX registration_submission_admission_expiry
    ON registration_submission_admission (window_start);

CREATE TABLE account_registration_requests (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL CHECK (
        email = lower(email)
        AND email = btrim(email)
        AND char_length(email) BETWEEN 3 AND 254
    ),
    applicant_name TEXT NOT NULL CHECK (
        applicant_name = btrim(applicant_name)
        AND char_length(applicant_name) BETWEEN 1 AND 120
    ),
    organization_name TEXT NOT NULL CHECK (
        organization_name = btrim(organization_name)
        AND char_length(organization_name) BETWEEN 1 AND 120
    ),
    workspace_name TEXT NOT NULL CHECK (
        workspace_name = btrim(workspace_name)
        AND char_length(workspace_name) BETWEEN 1 AND 120
    ),
    password_hash TEXT CHECK (
        password_hash IS NULL
        OR (
            char_length(password_hash) BETWEEN 32 AND 256
            AND password_hash LIKE '$argon2id$v=19$%'
        )
    ),
    note TEXT CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500),
    status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by_kind TEXT CHECK (
        reviewed_by_kind IS NULL OR reviewed_by_kind IN ('installation', 'operator')
    ),
    reviewed_by_operator_id UUID REFERENCES admin_operators(id) ON DELETE SET NULL,
    decision_note TEXT CHECK (
        decision_note IS NULL OR char_length(decision_note) BETWEEN 1 AND 500
    ),
    approved_organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    approved_project_id UUID,
    approved_operator_id UUID REFERENCES admin_operators(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_organization_id, approved_project_id)
        REFERENCES projects(organization_id, id),
    CHECK (
        (reviewed_by_kind IS NULL AND reviewed_by_operator_id IS NULL)
        OR (reviewed_by_kind = 'installation' AND reviewed_by_operator_id IS NULL)
        OR (reviewed_by_kind = 'operator' AND reviewed_by_operator_id IS NOT NULL)
    ),
    CHECK (
        (
            status = 'pending'
            AND password_hash IS NOT NULL
            AND reviewed_at IS NULL
            AND reviewed_by_kind IS NULL
            AND approved_organization_id IS NULL
            AND approved_project_id IS NULL
            AND approved_operator_id IS NULL
        )
        OR (
            status = 'approved'
            AND password_hash IS NULL
            AND reviewed_at IS NOT NULL
            AND reviewed_by_kind IS NOT NULL
            AND approved_organization_id IS NOT NULL
            AND approved_project_id IS NOT NULL
            AND approved_operator_id IS NOT NULL
        )
        OR (
            status = 'rejected'
            AND password_hash IS NULL
            AND reviewed_at IS NOT NULL
            AND reviewed_by_kind IS NOT NULL
            AND approved_organization_id IS NULL
            AND approved_project_id IS NULL
            AND approved_operator_id IS NULL
        )
    )
);

CREATE UNIQUE INDEX account_registration_requests_pending_email_idx
    ON account_registration_requests (email)
    WHERE status = 'pending';

CREATE INDEX account_registration_requests_created_idx
    ON account_registration_requests (created_at DESC, id DESC);

CREATE INDEX account_registration_requests_status_created_idx
    ON account_registration_requests (status, created_at DESC, id DESC);

CREATE FUNCTION guard_account_registration_transition() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status <> 'pending' THEN
        RAISE EXCEPTION 'Completed registration requests are immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'account_registration_immutable';
    END IF;
    IF NEW.status NOT IN ('approved', 'rejected') OR NEW.revision <> OLD.revision + 1 THEN
        RAISE EXCEPTION 'Invalid registration state transition'
            USING ERRCODE = '23514', CONSTRAINT = 'account_registration_transition';
    END IF;
    IF NEW.email IS DISTINCT FROM OLD.email OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Registration identity cannot change'
            USING ERRCODE = '23514', CONSTRAINT = 'account_registration_identity';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER guard_account_registration_transition
    BEFORE UPDATE ON account_registration_requests
    FOR EACH ROW EXECUTE FUNCTION guard_account_registration_transition();

CREATE TABLE account_registration_review_events (
    id UUID PRIMARY KEY,
    request_id UUID NOT NULL REFERENCES account_registration_requests(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('registration_approved', 'registration_rejected')),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator', 'unknown')),
    actor_operator_id UUID REFERENCES admin_operators(id) ON DELETE SET NULL,
    target_label TEXT NOT NULL CHECK (char_length(btrim(target_label)) BETWEEN 1 AND 260),
    revision BIGINT NOT NULL CHECK (revision >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK (
        (actor_kind = 'operator' AND actor_operator_id IS NOT NULL)
        OR (actor_kind <> 'operator' AND actor_operator_id IS NULL)
    )
);

CREATE INDEX account_registration_review_events_created
    ON account_registration_review_events (created_at DESC, id DESC);

CREATE TRIGGER immutable_account_registration_review_events
    BEFORE UPDATE OR DELETE ON account_registration_review_events
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
