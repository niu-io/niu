-- Every required workspace/key detector must approve the exact saved bytes.
-- Earlier private snapshots without this proof remain unavailable for handoff.
CREATE TABLE inspected_image_source_approvals (
    source_id UUID NOT NULL REFERENCES inspected_image_sources(id),
    approval_id UUID NOT NULL REFERENCES image_processing_approvals(id),
    PRIMARY KEY(source_id,approval_id)
);
CREATE TRIGGER immutable_inspected_image_source_approvals BEFORE UPDATE OR DELETE ON inspected_image_source_approvals
FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
