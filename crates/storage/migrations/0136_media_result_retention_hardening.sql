-- Preserve the already applied 0135 checksum; harden retention append-only.
-- Its separate clock_timestamp defaults could differ by microseconds. Shorten
-- existing windows before enforcing the exact 24-hour maximum; never extend.
DROP TRIGGER protect_media_result_reference ON media_result_references;
UPDATE media_result_references SET expires_at=created_at+interval '24 hours'
    WHERE expires_at>created_at+interval '24 hours';
ALTER TABLE media_result_references
    ALTER COLUMN created_at SET DEFAULT now(),
    ALTER COLUMN expires_at SET DEFAULT now()+interval '24 hours',
    ADD CONSTRAINT media_result_retention_maximum CHECK(expires_at<=created_at+interval '24 hours');
CREATE TRIGGER protect_media_result_reference BEFORE UPDATE ON media_result_references
    FOR EACH ROW EXECUTE FUNCTION protect_media_result_reference();
CREATE TRIGGER retain_media_result_tombstone BEFORE DELETE ON media_result_references
    FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
