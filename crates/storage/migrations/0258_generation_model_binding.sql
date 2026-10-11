-- Capture the dispatched upstream identity, not a later editable model mapping.
-- Historical references lack this evidence and retain their strict revision check.
ALTER TABLE openrouter_generation_references
    ADD COLUMN upstream_model TEXT
    CHECK (upstream_model IS NULL OR length(upstream_model) BETWEEN 1 AND 200);
