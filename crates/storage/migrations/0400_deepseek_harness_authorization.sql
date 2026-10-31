-- Extend the finite host allowlist without changing existing authorization state.
ALTER TABLE agent_authorizations DROP CONSTRAINT agent_authorizations_client_name_check;
ALTER TABLE agent_authorizations ADD CONSTRAINT agent_authorizations_client_name_check
    CHECK (client_name IN ('Claude Code', 'Codex', 'DeepSeek Harness'));
