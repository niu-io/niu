-- Server-only correlation evidence, separate from customer payload retention.
-- An upstream reference is not usage, a charge, or proof of nonexecution.
CREATE TABLE openrouter_generation_references (
    attempt_id UUID PRIMARY KEY REFERENCES managed_attempt_routes(attempt_id),
    generation_id TEXT NOT NULL UNIQUE
        CHECK (length(generation_id) BETWEEN 5 AND 200 AND generation_id ~ '^gen-[A-Za-z0-9_-]+$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp()
);
CREATE TRIGGER immutable_openrouter_generation_reference
    BEFORE UPDATE OR DELETE ON openrouter_generation_references
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
