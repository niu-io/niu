-- Separate the account identity from its organization-scoped operator records.
-- Existing operators remain the authorization and audit subjects during migration.
CREATE TABLE account_identities (
    id UUID PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE admin_operators ADD CONSTRAINT admin_operators_id_organization_unique
    UNIQUE (id, organization_id);

CREATE TABLE account_memberships (
    identity_id UUID NOT NULL REFERENCES account_identities(id),
    operator_id UUID NOT NULL UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (identity_id, organization_id),
    FOREIGN KEY (operator_id, organization_id)
        REFERENCES admin_operators(id, organization_id)
);

-- Each existing scoped operator starts as its own identity. No accounts or
-- permissions are merged based on names, addresses, or other inferred matches.
INSERT INTO account_identities (id)
SELECT id FROM admin_operators WHERE organization_id IS NOT NULL;
INSERT INTO account_memberships (identity_id, operator_id, organization_id)
SELECT id, id, organization_id FROM admin_operators WHERE organization_id IS NOT NULL;

CREATE TABLE account_organization_creation_receipts (
    identity_id UUID NOT NULL REFERENCES account_identities(id),
    key_sha256 BYTEA NOT NULL CHECK (octet_length(key_sha256) = 32),
    request_sha256 BYTEA NOT NULL CHECK (octet_length(request_sha256) = 32),
    organization_id UUID NOT NULL,
    operator_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (identity_id, key_sha256)
);
CREATE TRIGGER immutable_account_organization_creation_receipts
    BEFORE UPDATE OR DELETE ON account_organization_creation_receipts
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
