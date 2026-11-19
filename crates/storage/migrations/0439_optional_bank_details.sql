CREATE TABLE platform_bank_details (
    singleton boolean PRIMARY KEY CHECK (singleton),
    revision bigint NOT NULL CHECK (revision > 0),
    details jsonb CHECK (jsonb_typeof(details) = 'object')
);
-- An independent, stable reference for the organization that owns the balance.
ALTER TABLE organizations ADD COLUMN bank_memo text NOT NULL
    DEFAULT ('NIU-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 12)));
ALTER TABLE organizations ADD CONSTRAINT bank_memo_unique UNIQUE(bank_memo);
