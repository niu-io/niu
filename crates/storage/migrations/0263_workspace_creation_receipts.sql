-- Actor-scoped creation identity survives workspace deletion; replay never
-- recreates a deleted workspace. Store hashes, not client keys or request names.
CREATE TABLE workspace_creation_receipts (
    actor_kind TEXT NOT NULL CHECK (actor_kind IN ('installation','member')),
    actor_id UUID NOT NULL,
    key_sha256 BYTEA NOT NULL CHECK (octet_length(key_sha256)=32),
    request_sha256 BYTEA NOT NULL CHECK (octet_length(request_sha256)=32),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (actor_kind,actor_id,key_sha256),
    CHECK ((actor_kind='installation')=(actor_id='00000000-0000-0000-0000-000000000000'::uuid))
);
CREATE TRIGGER immutable_workspace_creation_receipt BEFORE UPDATE OR DELETE
    ON workspace_creation_receipts FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
