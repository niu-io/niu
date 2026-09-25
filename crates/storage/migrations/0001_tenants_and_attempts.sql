CREATE TABLE organizations (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, id)
);

CREATE TABLE operations (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    model_alias TEXT NOT NULL CHECK (length(model_alias) BETWEEN 1 AND 200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    UNIQUE (organization_id, project_id, id)
);

-- Intent must commit before upstream dispatch. A dispatched attempt is uncertain
-- after a crash; recovery must not infer that it was free or safe to replay.
CREATE TABLE attempts (
    id UUID PRIMARY KEY,
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    operation_id UUID NOT NULL,
    resource_id TEXT NOT NULL CHECK (length(resource_id) BETWEEN 1 AND 200),
    offer_revision TEXT NOT NULL CHECK (length(offer_revision) BETWEEN 1 AND 200),
    execution TEXT NOT NULL DEFAULT 'not_sent'
        CHECK (execution IN ('not_sent', 'may_have_executed', 'confirmed_completed', 'confirmed_not_executed')),
    usage_confidence TEXT NOT NULL DEFAULT 'unknown'
        CHECK (usage_confidence IN ('unknown', 'provider_reported')),
    prompt_tokens BIGINT CHECK (prompt_tokens >= 0),
    completion_tokens BIGINT CHECK (completion_tokens >= 0),
    settlement TEXT NOT NULL DEFAULT 'unresolved'
        CHECK (settlement IN ('unresolved', 'reconciliation_required')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    dispatched_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    FOREIGN KEY (organization_id, project_id, operation_id)
        REFERENCES operations(organization_id, project_id, id),
    CHECK ((usage_confidence = 'unknown' AND prompt_tokens IS NULL AND completion_tokens IS NULL)
        OR (usage_confidence = 'provider_reported' AND prompt_tokens IS NOT NULL AND completion_tokens IS NOT NULL)),
    CHECK ((execution = 'not_sent' AND dispatched_at IS NULL)
        OR (execution <> 'not_sent' AND dispatched_at IS NOT NULL))
);
CREATE INDEX attempts_operation ON attempts (organization_id, project_id, operation_id);
CREATE INDEX attempts_unresolved ON attempts (dispatched_at)
    WHERE execution = 'may_have_executed';
