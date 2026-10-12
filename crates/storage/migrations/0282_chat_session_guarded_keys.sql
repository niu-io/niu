-- Retain guard identity without content so old autosaves cannot resurrect deletions.
CREATE TABLE chat_session_guarded_keys (
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    owner TEXT NOT NULL,
    session_id UUID NOT NULL,
    PRIMARY KEY (organization_id, project_id, owner, session_id),
    FOREIGN KEY (organization_id, project_id) REFERENCES projects(organization_id, id)
);
INSERT INTO chat_session_guarded_keys (organization_id, project_id, owner, session_id)
SELECT organization_id, project_id, owner, id FROM chat_sessions WHERE guarded_writes;
