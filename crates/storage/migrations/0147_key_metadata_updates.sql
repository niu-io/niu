ALTER TABLE api_keys ADD COLUMN revision BIGINT NOT NULL DEFAULT 1;
ALTER TABLE key_audit_events DROP CONSTRAINT key_audit_events_action_check;
ALTER TABLE key_audit_events ADD CONSTRAINT key_audit_events_action_check
    CHECK (action IN ('issued', 'revoked', 'rotated', 'updated'));
ALTER TABLE key_audit_events ADD COLUMN previous_metadata JSONB;
ALTER TABLE key_audit_events ADD COLUMN updated_metadata JSONB;
