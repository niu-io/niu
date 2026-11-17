-- Preserve historical estimator provenance and admit an explicit image bound.
ALTER TABLE key_attempt_token_bounds
    DROP CONSTRAINT key_attempt_token_bounds_estimator_check;
ALTER TABLE key_attempt_token_bounds
    ADD CONSTRAINT key_attempt_token_bounds_estimator_check
    CHECK (estimator IN ('serialized-utf8-plus-output-v1', 'route-input-limit-plus-output-v1'));
