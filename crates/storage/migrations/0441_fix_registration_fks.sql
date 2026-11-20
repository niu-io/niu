-- Remove the RESTRICT FK from account_registration_requests to projects so
-- empty Limited Preview workspaces can be deleted while preserving immutable
-- historical approval provenance. Reconcile contradictory ON DELETE SET NULL /
-- ON DELETE CASCADE clauses on immutable registration audit tables with
-- ON DELETE RESTRICT so schema rules match immutability triggers and CHECKs.

DO $$
DECLARE
    fk_name TEXT;
BEGIN
    SELECT conname
    INTO fk_name
    FROM pg_constraint
    WHERE conrelid = 'account_registration_requests'::regclass
      AND confrelid = 'projects'::regclass
      AND contype = 'f';

    IF fk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE account_registration_requests DROP CONSTRAINT %I', fk_name);
    END IF;
END;
$$;

ALTER TABLE platform_registration_policy_events
    DROP CONSTRAINT IF EXISTS platform_registration_policy_events_actor_operator_id_fkey;
ALTER TABLE platform_registration_policy_events
    ADD CONSTRAINT platform_registration_policy_events_actor_operator_id_fkey
    FOREIGN KEY (actor_operator_id) REFERENCES admin_operators(id) ON DELETE RESTRICT;

ALTER TABLE account_registration_requests
    DROP CONSTRAINT IF EXISTS account_registration_requests_reviewed_by_operator_id_fkey;
ALTER TABLE account_registration_requests
    ADD CONSTRAINT account_registration_requests_reviewed_by_operator_id_fkey
    FOREIGN KEY (reviewed_by_operator_id) REFERENCES admin_operators(id) ON DELETE RESTRICT;

ALTER TABLE account_registration_requests
    DROP CONSTRAINT IF EXISTS account_registration_requests_approved_organization_id_fkey;
ALTER TABLE account_registration_requests
    ADD CONSTRAINT account_registration_requests_approved_organization_id_fkey
    FOREIGN KEY (approved_organization_id) REFERENCES organizations(id) ON DELETE RESTRICT;

ALTER TABLE account_registration_requests
    DROP CONSTRAINT IF EXISTS account_registration_requests_approved_operator_id_fkey;
ALTER TABLE account_registration_requests
    ADD CONSTRAINT account_registration_requests_approved_operator_id_fkey
    FOREIGN KEY (approved_operator_id) REFERENCES admin_operators(id) ON DELETE RESTRICT;

ALTER TABLE account_registration_review_events
    DROP CONSTRAINT IF EXISTS account_registration_review_events_request_id_fkey;
ALTER TABLE account_registration_review_events
    ADD CONSTRAINT account_registration_review_events_request_id_fkey
    FOREIGN KEY (request_id) REFERENCES account_registration_requests(id) ON DELETE RESTRICT;

ALTER TABLE account_registration_review_events
    DROP CONSTRAINT IF EXISTS account_registration_review_events_actor_operator_id_fkey;
ALTER TABLE account_registration_review_events
    ADD CONSTRAINT account_registration_review_events_actor_operator_id_fkey
    FOREIGN KEY (actor_operator_id) REFERENCES admin_operators(id) ON DELETE RESTRICT;
