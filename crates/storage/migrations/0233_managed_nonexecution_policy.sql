-- Admission pins a qualified failure policy, never an endpoint inferred later
-- from a mutable credential. Historical routes have no invented qualification.
ALTER TABLE managed_attempt_routes ADD COLUMN nonexecution_policy TEXT
    CHECK (nonexecution_policy = 'openrouter-text-auth-rejection-v1');
