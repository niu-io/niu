-- Record future member role transitions without inferring historical roles.
ALTER TABLE operator_audit_events DROP CONSTRAINT operator_audit_events_action_check;
ALTER TABLE operator_audit_events ADD CONSTRAINT operator_audit_events_action_check CHECK (
 action IN ('operator_created','session_created','session_revoked','operator_revoked','password_changed','password_login_succeeded','role_changed')
);
ALTER TABLE operator_audit_events DROP CONSTRAINT operator_audit_events_check1;
ALTER TABLE operator_audit_events ADD CONSTRAINT operator_audit_events_check1 CHECK (
 (action IN ('session_created','session_revoked','password_login_succeeded') AND target_session_id IS NOT NULL)
 OR (action IN ('operator_created','operator_revoked','password_changed','role_changed') AND target_session_id IS NULL)
);
ALTER TABLE operator_audit_events ADD COLUMN before_role TEXT;
ALTER TABLE operator_audit_events ADD COLUMN after_role TEXT;
ALTER TABLE operator_audit_events ADD CONSTRAINT operator_audit_role_transition CHECK (
 (action='role_changed' AND before_role IS NOT NULL AND after_role IS NOT NULL
  AND before_role IN ('owner','admin','viewer') AND after_role IN ('owner','admin','viewer') AND before_role<>after_role)
 OR (action<>'role_changed' AND before_role IS NULL AND after_role IS NULL)
);
