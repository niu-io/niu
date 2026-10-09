-- Retain assignment revisions after removal so stale writers cannot recreate policy.
ALTER TABLE key_guardrail_assignments ALTER COLUMN policy_revision DROP NOT NULL;
ALTER TABLE key_guardrail_assignment_events ALTER COLUMN policy_revision DROP NOT NULL;
