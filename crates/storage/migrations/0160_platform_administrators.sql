-- Platform administration is independent of customer workspace membership.
-- Existing members retain their scope and never gain platform access implicitly.
ALTER TABLE admin_operators ADD COLUMN platform_admin boolean NOT NULL DEFAULT false;
