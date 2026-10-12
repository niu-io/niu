-- The existing direct video adapter must also be configurable through Supplier
-- management. This does not qualify offers, publish prices or grant dispatch.
ALTER TABLE vendors DROP CONSTRAINT vendors_adapter_check;
ALTER TABLE vendors ADD CONSTRAINT vendors_adapter_check
    CHECK (adapter IN ('openrouter', 'openai', 'anthropic', 'gemini', 'ark'));
