-- Existing operators have no tenant ownership information. Revoke both the
-- sessions and operators before introducing scoped authentication so those
-- credentials cannot retain installation-wide access after the upgrade.
UPDATE admin_sessions
SET revoked_at = COALESCE(revoked_at, now())
WHERE revoked_at IS NULL;

UPDATE admin_operators
SET revoked_at = COALESCE(revoked_at, now())
WHERE revoked_at IS NULL;

ALTER TABLE admin_operators
    ADD COLUMN organization_id UUID,
    ADD COLUMN project_id UUID,
    ADD CONSTRAINT admin_operators_organization_fk
        FOREIGN KEY (organization_id) REFERENCES organizations(id),
    ADD CONSTRAINT admin_operators_project_fk
        FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id),
    ADD CONSTRAINT admin_operators_project_requires_organization
        CHECK (project_id IS NULL OR organization_id IS NOT NULL),
    ADD CONSTRAINT admin_operators_active_scope
        CHECK (revoked_at IS NOT NULL OR organization_id IS NOT NULL);

CREATE INDEX admin_operators_scope
    ON admin_operators (organization_id, project_id, created_at, id);
