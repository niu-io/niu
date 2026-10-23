-- A temporary inability to check does not revoke unexpired prior evidence.
ALTER TABLE payment_verification_evidence DROP CONSTRAINT payment_verification_evidence_outcome_check;
ALTER TABLE payment_verification_evidence DROP CONSTRAINT payment_verification_evidence_check;
ALTER TABLE payment_verification_evidence ADD CHECK (outcome IN ('pending', 'passed', 'failed', 'unavailable'));
ALTER TABLE payment_verification_evidence ADD CHECK (
    (outcome = 'pending' AND completed_at IS NULL AND expires_at IS NULL)
    OR (outcome IN ('failed', 'unavailable') AND completed_at IS NOT NULL AND expires_at IS NULL)
    OR (outcome = 'passed' AND completed_at IS NOT NULL AND expires_at > completed_at)
);
