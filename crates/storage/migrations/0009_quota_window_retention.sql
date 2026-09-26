-- Imported quota snapshots remain immutable except for an authorized
-- window-scoped retention deletion through the management API.
DROP TRIGGER immutable_quota ON quota_observations;
CREATE TRIGGER immutable_quota_updates BEFORE UPDATE ON quota_observations
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
