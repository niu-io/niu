-- Composer state is independent of sent conversations and owned by one actor.
CREATE TABLE chat_drafts (
    organization_id uuid NOT NULL,
    project_id uuid NOT NULL,
    owner text NOT NULL,
    payload jsonb,
    revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id, project_id, owner),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    CHECK (payload IS NULL OR jsonb_typeof(payload) = 'object')
);
