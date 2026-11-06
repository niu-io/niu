-- A key can explicitly follow the workspace's active Guardrail policy instead
-- of pinning an immutable revision. Follow-active assignments carry no key
-- policy revision: the workspace policy already applies to every request, so
-- later activations take effect without a second key layer or an integer re-pin.
-- Existing rows default to the historical fixed behaviour.
ALTER TABLE key_guardrail_assignments
    ADD COLUMN mode TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE key_guardrail_assignments
    ADD CONSTRAINT key_guardrail_assignments_mode_check
        CHECK (mode IN ('fixed', 'active')),
    ADD CONSTRAINT key_guardrail_assignments_active_unpinned
        CHECK (mode <> 'active' OR policy_revision IS NULL);

-- Assignment history records which mode was chosen. Follow events keep a null
-- policy revision; removal remains a fixed-mode event with a null revision.
ALTER TABLE key_guardrail_assignment_events
    ADD COLUMN mode TEXT NOT NULL DEFAULT 'fixed';
ALTER TABLE key_guardrail_assignment_events
    ADD CONSTRAINT key_guardrail_assignment_events_mode_check
        CHECK (mode IN ('fixed', 'active')),
    ADD CONSTRAINT key_guardrail_assignment_events_active_unpinned
        CHECK (mode <> 'active' OR policy_revision IS NULL);
