-- Add a dedicated per-IP bucket kind to password_login_admission so login
-- throttling can combine IP, normalized email identity, and global buckets in
-- a single transaction with an independent per-IP limit.

ALTER TABLE password_login_admission
    DROP CONSTRAINT password_login_admission_kind_check;
ALTER TABLE password_login_admission
    ADD CONSTRAINT password_login_admission_kind_check
    CHECK (kind IN ('global', 'identity', 'ip'));
