-- Extend checked request-rate evidence without rewriting historical observations.
ALTER TABLE gateway_admission_denials
    DROP CONSTRAINT gateway_admission_denials_kind_check,
    ADD CONSTRAINT gateway_admission_denials_kind_check
        CHECK (kind IN ('key_request_rate_disabled', 'key_request_rate_exceeded'));
