-- Specific, short-lived consent to irreversible deletion of a saved ordinary
-- group and every contained asset. No dispatch or automatic replay is enabled.
CREATE TABLE asset_group_deletion_consents (
    id UUID PRIMARY KEY,
    intent_id UUID NOT NULL REFERENCES asset_group_create_intents(id),
    authorization_id UUID NOT NULL REFERENCES asset_operation_authorizations(id),
    valid_for_seconds INTEGER NOT NULL CHECK (valid_for_seconds BETWEEN 1 AND 900),
    confirm_cascade BOOLEAN NOT NULL CHECK (confirm_cascade),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK ((actor_kind='operator')=(actor_id IS NOT NULL)),
    CHECK (expires_at>created_at AND expires_at<=created_at+INTERVAL '15 minutes')
);
CREATE TRIGGER immutable_asset_group_deletion_consent BEFORE UPDATE OR DELETE ON asset_group_deletion_consents
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
CREATE TABLE asset_group_deletion_consent_revocations (
    consent_id UUID PRIMARY KEY REFERENCES asset_group_deletion_consents(id),
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','operator')),
    actor_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CHECK ((actor_kind='operator')=(actor_id IS NOT NULL))
);
CREATE TRIGGER immutable_asset_group_deletion_consent_revocation BEFORE UPDATE OR DELETE ON asset_group_deletion_consent_revocations
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
