-- SQL CHECK treats null as passing, so explicitly require both result fields.
ALTER TABLE inspected_guardrail_bindings DROP CONSTRAINT valid_input_inspection;
ALTER TABLE inspected_guardrail_bindings ADD CONSTRAINT valid_input_inspection CHECK (
    (input_outcome IS NULL AND input_elapsed_ms IS NULL)
    OR (input_outcome IS NOT NULL AND input_outcome IN ('allowed','redacted')
        AND input_elapsed_ms IS NOT NULL AND input_elapsed_ms >= 0)
);
