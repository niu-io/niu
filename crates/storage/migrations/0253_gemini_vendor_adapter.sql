-- Native GenerateContent credentials share the existing encrypted Supplier lifecycle.
ALTER TABLE vendors DROP CONSTRAINT vendors_adapter_check;
ALTER TABLE vendors ADD CONSTRAINT vendors_adapter_check
    CHECK (adapter IN ('openrouter', 'openai', 'anthropic', 'gemini'));
