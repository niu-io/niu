CREATE TABLE key_ip_policies (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    spending_root_id UUID NOT NULL,
    allowed_cidrs TEXT[], -- NULL unrestricted; empty array denies every source.
    revision BIGINT NOT NULL CHECK(revision>0),
    PRIMARY KEY(organization_id,project_id,spending_root_id),
    FOREIGN KEY(organization_id,project_id,spending_root_id) REFERENCES api_keys(organization_id,project_id,id),
    CHECK(allowed_cidrs IS NULL OR cardinality(allowed_cidrs)<=64)
);
CREATE TABLE key_ip_policy_history (
    organization_id UUID NOT NULL, project_id UUID NOT NULL, spending_root_id UUID NOT NULL,
    revision BIGINT NOT NULL CHECK(revision>0), allowed_cidrs TEXT[],
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    actor_kind TEXT NOT NULL CHECK(actor_kind IN ('installation','member')),
    actor_name TEXT NOT NULL, actor_operator_id UUID REFERENCES admin_operators(id),
    PRIMARY KEY(organization_id,project_id,spending_root_id,revision),
    FOREIGN KEY(organization_id,project_id,spending_root_id) REFERENCES key_ip_policies(organization_id,project_id,spending_root_id),
    CHECK((actor_kind='installation' AND actor_operator_id IS NULL) OR (actor_kind='member' AND actor_operator_id IS NOT NULL))
);
CREATE TRIGGER immutable_key_ip_policy_history BEFORE UPDATE OR DELETE ON key_ip_policy_history
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
