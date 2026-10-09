-- Preserve migration 32 and reject conflicting retries rather than silently
-- treating different usage under the same response key as a duplicate.
ALTER TABLE agent_observations ADD COLUMN response_fingerprint BYTEA;
-- Existing observations lack a canonical payload fingerprint. Retain them;
-- retries cannot overwrite them and require explicit reconciliation.
UPDATE agent_observations SET response_fingerprint = response_key;
ALTER TABLE agent_observations ALTER COLUMN response_fingerprint SET NOT NULL;
ALTER TABLE agent_observations ADD CONSTRAINT agent_observation_fingerprint_length
    CHECK (octet_length(response_fingerprint) = 32);
