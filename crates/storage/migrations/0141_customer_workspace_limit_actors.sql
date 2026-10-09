ALTER TABLE customer_workspace_limit_history
    ADD COLUMN actor_kind TEXT NOT NULL DEFAULT 'unknown' CHECK (actor_kind IN ('unknown','installation','member')),
    ADD COLUMN actor_member_id UUID REFERENCES admin_operators(id),
    ADD COLUMN actor_name TEXT,
    ADD CONSTRAINT valid_workspace_limit_actor CHECK (
        (actor_kind='unknown' AND actor_member_id IS NULL AND actor_name IS NULL)
        OR (actor_kind='installation' AND actor_member_id IS NULL AND actor_name IS NOT NULL)
        OR (actor_kind='member' AND actor_member_id IS NOT NULL AND actor_name IS NOT NULL));

CREATE OR REPLACE FUNCTION record_customer_workspace_limit_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor TEXT; member UUID; display_name TEXT; kind TEXT := 'unknown';
BEGIN
    actor := NULLIF(current_setting('niu.workspace_limit_actor',true),'');
    IF actor='installation' THEN
        kind := 'installation'; display_name := 'Installation administrator';
    ELSIF actor IS NOT NULL THEN
        member := actor::UUID;
        SELECT name INTO display_name FROM admin_operators
            WHERE id=member AND role='owner' AND revoked_at IS NULL
              AND organization_id=NEW.organization_id
              AND (project_id IS NULL OR project_id=NEW.project_id);
        IF display_name IS NULL THEN RAISE EXCEPTION 'invalid workspace limit actor' USING ERRCODE='23514'; END IF;
        kind := 'member';
    END IF;
    INSERT INTO customer_workspace_limit_history(organization_id,project_id,currency,revision,limit_nanos,recorded_at,source,actor_kind,actor_member_id,actor_name)
        VALUES(NEW.organization_id,NEW.project_id,NEW.currency,NEW.revision,NEW.limit_nanos,clock_timestamp(),'configuration',kind,member,display_name);
    RETURN NEW;
END;
$$;
