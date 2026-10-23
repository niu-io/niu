-- Server-owned verification attempts; no merchant responses or secrets are retained.
CREATE TABLE payment_verification_evidence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
    gateway text NOT NULL CHECK (gateway IN ('stripe', 'epay', 'zhifux')),
    configuration_digest bytea NOT NULL CHECK (octet_length(configuration_digest) = 32),
    evidence_kind text NOT NULL CHECK (evidence_kind IN ('account', 'callback')),
    outcome text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending', 'passed', 'failed')),
    started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    completed_at timestamptz,
    expires_at timestamptz,
    CHECK ((outcome = 'pending' AND completed_at IS NULL AND expires_at IS NULL)
        OR (outcome = 'failed' AND completed_at IS NOT NULL AND expires_at IS NULL)
        OR (outcome = 'passed' AND completed_at IS NOT NULL AND expires_at > completed_at))
);
CREATE INDEX payment_verification_current ON payment_verification_evidence
    (gateway, configuration_digest, evidence_kind, sequence DESC);
