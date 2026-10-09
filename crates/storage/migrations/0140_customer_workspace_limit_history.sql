CREATE TABLE customer_workspace_limit_history (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    currency TEXT NOT NULL,
    revision BIGINT NOT NULL CHECK (revision>0),
    limit_nanos BIGINT NOT NULL CHECK (limit_nanos>=0),
    recorded_at TIMESTAMPTZ,
    source TEXT NOT NULL CHECK (source IN ('migration_baseline','configuration')),
    PRIMARY KEY (organization_id,project_id,currency,revision),
    FOREIGN KEY (organization_id,project_id,currency)
        REFERENCES customer_workspace_spending_limits(organization_id,project_id,currency),
    CHECK ((source='migration_baseline' AND recorded_at IS NULL)
        OR (source='configuration' AND recorded_at IS NOT NULL))
);

-- Only the current revision is known on upgrade; do not invent earlier changes.
INSERT INTO customer_workspace_limit_history(organization_id,project_id,currency,revision,limit_nanos,source)
SELECT organization_id,project_id,currency,revision,limit_nanos,'migration_baseline'
FROM customer_workspace_spending_limits;

CREATE TRIGGER immutable_customer_workspace_limit_history BEFORE UPDATE OR DELETE
    ON customer_workspace_limit_history FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE FUNCTION record_customer_workspace_limit_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO customer_workspace_limit_history(organization_id,project_id,currency,revision,limit_nanos,recorded_at,source)
        VALUES(NEW.organization_id,NEW.project_id,NEW.currency,NEW.revision,NEW.limit_nanos,clock_timestamp(),'configuration');
    RETURN NEW;
END;
$$;
CREATE TRIGGER record_customer_workspace_limit_revision AFTER INSERT OR UPDATE
    ON customer_workspace_spending_limits FOR EACH ROW EXECUTE FUNCTION record_customer_workspace_limit_revision();
