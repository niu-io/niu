-- Codex ChatGPT auth is supplied per request by Codex itself. Niu stores no
-- provider credential for this narrowly fixed upstream route.
ALTER TABLE vendors ALTER COLUMN credential_ciphertext DROP NOT NULL;
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_adapter_check;
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_credential_ciphertext_check;

ALTER TABLE vendors
    ADD CONSTRAINT vendors_adapter_check
        CHECK (adapter IN ('openrouter', 'openai', 'codex-chatgpt')),
    ADD CONSTRAINT vendors_credentials_check
        CHECK (
            (adapter = 'codex-chatgpt' AND credential_ciphertext IS NULL)
            OR
            (adapter IN ('openrouter', 'openai')
                AND credential_ciphertext IS NOT NULL
                AND octet_length(credential_ciphertext) BETWEEN 30 AND 16384)
        ),
    ADD CONSTRAINT vendors_codex_endpoint_check
        CHECK (adapter <> 'codex-chatgpt' OR api_base = 'https://chatgpt.com/backend-api/codex');
