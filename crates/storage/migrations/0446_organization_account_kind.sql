-- Distinguish personal accounts from multi-member organizations while sharing
-- one billing, workspace, and API key isolation model.
ALTER TABLE organizations
    ADD COLUMN account_kind TEXT NOT NULL DEFAULT 'organization'
    CHECK (account_kind IN ('personal', 'organization'));

UPDATE organizations
SET account_kind = 'personal'
WHERE name = 'Personal workspace'
   OR id IN (SELECT organization_id FROM default_workspace);

CREATE INDEX organizations_account_kind_id_idx ON organizations (account_kind, id);
