CREATE TABLE platform_bank_details (
    singleton boolean PRIMARY KEY CHECK (singleton),
    revision bigint NOT NULL CHECK (revision > 0),
    details jsonb CHECK (jsonb_typeof(details) = 'object')
);
-- An independent, stable reference for the organization that owns the balance.
-- Avoid volatile-default ADD COLUMN NOT NULL (which forces a full-table rewrite
-- under ACCESS EXCLUSIVE lock): add nullable first (metadata-only), set default
-- for future inserts, backfill existing rows under ROW EXCLUSIVE lock, validate
-- NOT NULL under SHARE UPDATE EXCLUSIVE, then promote to NOT NULL without scan.
ALTER TABLE organizations ADD COLUMN bank_memo text;
ALTER TABLE organizations ALTER COLUMN bank_memo
    SET DEFAULT ('NIU-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 12)));
UPDATE organizations
SET bank_memo = ('NIU-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 12)))
WHERE bank_memo IS NULL;
ALTER TABLE organizations
    ADD CONSTRAINT organizations_bank_memo_not_null CHECK (bank_memo IS NOT NULL) NOT VALID;
ALTER TABLE organizations
    VALIDATE CONSTRAINT organizations_bank_memo_not_null;
ALTER TABLE organizations ALTER COLUMN bank_memo SET NOT NULL;
ALTER TABLE organizations DROP CONSTRAINT organizations_bank_memo_not_null;
ALTER TABLE organizations ADD CONSTRAINT bank_memo_unique UNIQUE (bank_memo);
