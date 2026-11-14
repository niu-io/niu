DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    FOR constraint_record IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'agent_authorizations'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%client_name%'
    LOOP
        EXECUTE format(
            'ALTER TABLE agent_authorizations DROP CONSTRAINT %I',
            constraint_record.conname
        );
    END LOOP;
END $$;

ALTER TABLE agent_authorizations
    ADD CONSTRAINT agent_authorizations_client_name_check
        CHECK (
            char_length(btrim(client_name)) BETWEEN 1 AND 80
            AND client_name = btrim(client_name)
            AND client_name !~ '[[:cntrl:]]'
        ),
    ADD COLUMN IF NOT EXISTS approved_capabilities TEXT[]
        CHECK (
            approved_capabilities IS NULL
            OR (
                cardinality(approved_capabilities) <= 6
                AND approved_capabilities <@ ARRAY[
                    'pools:read',
                    'pools:write',
                    'events:read',
                    'events:write',
                    'evaluations:read',
                    'evaluations:write'
                ]::text[]
            )
        );
