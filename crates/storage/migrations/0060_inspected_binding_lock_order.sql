-- Binding insertion precedes admission's ordered workspace/key locks.
-- Defer the key reference check until commit to preserve that lock order.
DO $$
DECLARE key_constraint TEXT;
BEGIN
    SELECT conname INTO STRICT key_constraint FROM pg_constraint
        WHERE conrelid='inspected_guardrail_bindings'::regclass
          AND confrelid='api_keys'::regclass AND contype='f';
    EXECUTE format('ALTER TABLE inspected_guardrail_bindings ALTER CONSTRAINT %I DEFERRABLE INITIALLY DEFERRED', key_constraint);
END;
$$;
