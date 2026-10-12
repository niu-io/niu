-- Guard identities protect references only while their workspace exists.
-- They contain no conversation or accounting data and must not block deleting
-- an otherwise empty workspace. Other business-record foreign keys still block.
ALTER TABLE chat_session_guarded_keys
    DROP CONSTRAINT chat_session_guarded_keys_organization_id_project_id_fkey;
ALTER TABLE chat_session_guarded_keys
    ADD CONSTRAINT chat_session_guarded_keys_organization_id_project_id_fkey
    FOREIGN KEY (organization_id, project_id)
    REFERENCES projects(organization_id, id) ON DELETE CASCADE;
