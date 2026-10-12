-- Once an owner opts into guarded writes, compatibility clients cannot bypass them.
ALTER TABLE chat_sessions ADD COLUMN guarded_writes BOOLEAN NOT NULL DEFAULT false;
