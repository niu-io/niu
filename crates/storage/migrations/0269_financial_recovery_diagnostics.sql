-- NULL means no durable worker step has committed since diagnostics were added.
-- A committed step is traversal evidence, not proof that liabilities are settled.
ALTER TABLE financial_recovery_progress
    ADD COLUMN last_step_at TIMESTAMPTZ,
    ADD COLUMN last_candidate_count INTEGER,
    ADD COLUMN last_failure_count INTEGER,
    ADD CONSTRAINT financial_recovery_diagnostics_consistent CHECK (
        (last_step_at IS NULL AND last_candidate_count IS NULL AND last_failure_count IS NULL)
        OR
        (last_step_at IS NOT NULL AND last_candidate_count IS NOT NULL
         AND last_failure_count IS NOT NULL AND last_candidate_count >= 0
         AND last_failure_count >= 0 AND last_failure_count <= last_candidate_count)
    );
