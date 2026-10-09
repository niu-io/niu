-- Observation is independent of enforcement and never labels delivery blocked.
CREATE TABLE output_guardrail_observations (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    attempt_id UUID NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('clear','matched','indeterminate')),
    reason TEXT NOT NULL CHECK (reason IN ('inspected_text','pattern_match','unsupported_content','resource_limit','inspection_unavailable')),
    elapsed_ms BIGINT NOT NULL CHECK (elapsed_ms >= 0),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (organization_id,project_id,attempt_id),
    FOREIGN KEY (organization_id,project_id,attempt_id) REFERENCES attempts(organization_id,project_id,id),
    CHECK ((outcome='clear' AND reason='inspected_text')
        OR (outcome='matched' AND reason='pattern_match')
        OR (outcome='indeterminate' AND reason IN ('unsupported_content','resource_limit','inspection_unavailable')))
);
CREATE TRIGGER immutable_output_guardrail_observation
BEFORE UPDATE OR DELETE ON output_guardrail_observations
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
