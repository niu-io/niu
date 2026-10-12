-- Global revisions prevent stale writes and delete/recreate ABA within an owner.
CREATE SEQUENCE chat_session_write_revisions AS BIGINT;
ALTER TABLE chat_sessions ADD COLUMN write_revision BIGINT NOT NULL
    DEFAULT nextval('chat_session_write_revisions') CHECK (write_revision > 0);
