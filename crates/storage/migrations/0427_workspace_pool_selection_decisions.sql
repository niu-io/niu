-- Optional semantic Auto decisions are recorded with the selection they
-- produced. The evidence contains only bounded outcome, overhead and reason
-- fields; it never contains prompts, response content or Provider identifiers.
ALTER TABLE workspace_pool_selections
    ADD COLUMN decision JSONB
    CHECK (decision IS NULL OR jsonb_typeof(decision) = 'object');
