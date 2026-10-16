-- Snapshot future access-change context; retain unknown historical attribution.
ALTER TABLE provider_audit_events
 ADD COLUMN provider_label TEXT,
 ADD COLUMN affected_member_label TEXT,
 ADD COLUMN before_role TEXT CHECK(before_role IN ('manager','viewer')),
 ADD COLUMN after_role TEXT CHECK(after_role IN ('manager','viewer'));
