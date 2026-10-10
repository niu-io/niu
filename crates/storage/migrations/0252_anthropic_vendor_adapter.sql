-- Native Messages already supports Anthropic transport; allow managed credentials
-- to select that adapter without relabeling it as an OpenAI-compatible service.
ALTER TABLE vendors DROP CONSTRAINT vendors_adapter_check;
ALTER TABLE vendors ADD CONSTRAINT vendors_adapter_check
    CHECK (adapter IN ('openrouter', 'openai', 'anthropic'));
