-- Purpose-bound, one-time member invitations. The redemption secret is never
-- stored in plaintext; only its SHA-256 digest is persisted. Expiry, scope and
-- role are fixed when the invitation is created and cannot be widened on use.
CREATE TABLE member_invitations (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    project_id UUID,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'viewer')),
    recipient_email TEXT NOT NULL CHECK (
        recipient_email = lower(recipient_email)
        AND recipient_email = btrim(recipient_email)
        AND length(recipient_email) BETWEEN 3 AND 254
    ),
    recipient_name TEXT CHECK (
        recipient_name IS NULL
        OR (recipient_name = btrim(recipient_name) AND length(recipient_name) BETWEEN 1 AND 200)
    ),
    token_sha256 BYTEA NOT NULL UNIQUE CHECK (octet_length(token_sha256) = 32),
    created_by_kind TEXT NOT NULL CHECK (created_by_kind IN ('installation', 'operator')),
    created_by_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    accepted_operator_id UUID REFERENCES admin_operators(id),
    accepted_identity_id UUID REFERENCES account_identities(id),
    revoked_at TIMESTAMPTZ,
    CHECK (expires_at > created_at),
    CHECK (
        (created_by_kind = 'installation' AND created_by_operator_id IS NULL)
        OR (created_by_kind = 'operator' AND created_by_operator_id IS NOT NULL)
    ),
    CHECK (accepted_at IS NULL OR (accepted_operator_id IS NOT NULL AND accepted_identity_id IS NOT NULL)),
    CHECK (accepted_at IS NULL OR revoked_at IS NULL),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id)
);

CREATE INDEX member_invitations_organization_created
    ON member_invitations (organization_id, created_at DESC, id DESC);
CREATE INDEX member_invitations_pending_recipient
    ON member_invitations (organization_id, recipient_email)
    WHERE accepted_at IS NULL AND revoked_at IS NULL;

-- Immutable lifecycle journal. The invitation row holds current state; this
-- journal preserves who created, replaced, canceled or accepted it.
CREATE TABLE member_invitation_events (
    id UUID PRIMARY KEY,
    invitation_id UUID NOT NULL REFERENCES member_invitations(id),
    action TEXT NOT NULL CHECK (action IN ('created', 'replaced', 'canceled', 'accepted')),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation', 'operator')),
    actor_operator_id UUID REFERENCES admin_operators(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK (
        (actor_kind = 'installation' AND actor_operator_id IS NULL)
        OR (actor_kind = 'operator' AND actor_operator_id IS NOT NULL)
    )
);

CREATE INDEX member_invitation_events_invitation
    ON member_invitation_events (invitation_id, created_at, id);
CREATE TRIGGER immutable_member_invitation_events
    BEFORE UPDATE OR DELETE ON member_invitation_events
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
