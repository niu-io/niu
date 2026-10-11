-- Existing operations retain their immutable protocol-specific policy.
ALTER TABLE gateway_retry_policies DROP CONSTRAINT gateway_retry_policies_policy_revision_check;
ALTER TABLE gateway_retry_policies ADD CONSTRAINT gateway_retry_policies_policy_revision_check CHECK (policy_revision IN ('openrouter-chat-auth-rejection-v1','openrouter-responses-auth-rejection-v1'));
