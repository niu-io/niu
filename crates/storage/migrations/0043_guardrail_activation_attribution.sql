ALTER TABLE workspace_guardrail_revisions
    ADD COLUMN activated_by TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN restored_from_revision BIGINT;
ALTER TABLE workspace_guardrail_revisions
    ADD CONSTRAINT guardrail_actor_bounded CHECK (length(activated_by) BETWEEN 1 AND 200),
    ADD CONSTRAINT guardrail_restore_prior CHECK (restored_from_revision IS NULL OR (restored_from_revision > 0 AND restored_from_revision < revision));
