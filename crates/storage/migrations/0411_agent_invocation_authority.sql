-- Existing credentials retain their previously approved invocation authority.
ALTER TABLE api_keys ADD COLUMN invocation_allowed boolean NOT NULL DEFAULT true;
ALTER TABLE agent_authorizations ADD COLUMN invocation_allowed boolean NOT NULL DEFAULT true;
