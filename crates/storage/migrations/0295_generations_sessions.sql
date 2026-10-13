-- Actor-private conversation identity. Task evidence and outputs are never cascaded.
CREATE TABLE generations_sessions (
 organization_id UUID NOT NULL, project_id UUID NOT NULL, owner TEXT NOT NULL,
 id UUID NOT NULL, title TEXT NOT NULL CHECK(octet_length(title) BETWEEN 1 AND 800),
 revision BIGINT NOT NULL DEFAULT 1 CHECK(revision>0), archived BOOLEAN NOT NULL DEFAULT false,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,project_id,owner,id),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE INDEX generations_session_cursor ON generations_sessions(organization_id,project_id,owner,created_at DESC,id DESC);
CREATE TABLE generations_turns (
 organization_id UUID NOT NULL,project_id UUID NOT NULL,owner TEXT NOT NULL,session_id UUID NOT NULL,id UUID NOT NULL,
 sequence BIGINT NOT NULL CHECK(sequence>0),instruction JSONB, instruction_digest BYTEA NOT NULL CHECK(octet_length(instruction_digest)=32),
 content_deleted_at TIMESTAMPTZ,content_expires_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()+interval '30 days',
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,project_id,owner,session_id,id),UNIQUE(organization_id,project_id,owner,session_id,sequence),
 FOREIGN KEY(organization_id,project_id,owner,session_id) REFERENCES generations_sessions(organization_id,project_id,owner,id),
 CHECK(instruction IS NULL OR octet_length(instruction::text)<=65536)
);
CREATE TABLE generations_turn_tasks (
 organization_id UUID NOT NULL,project_id UUID NOT NULL,owner TEXT NOT NULL,session_id UUID NOT NULL,turn_id UUID NOT NULL,
 task_id UUID PRIMARY KEY,created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(organization_id,project_id,owner,session_id,turn_id),
 FOREIGN KEY(organization_id,project_id,owner,session_id,turn_id) REFERENCES generations_turns(organization_id,project_id,owner,session_id,id),
 FOREIGN KEY(organization_id,project_id,task_id) REFERENCES attempts(organization_id,project_id,id)
);
CREATE TRIGGER immutable_generations_task_association BEFORE UPDATE OR DELETE ON generations_turn_tasks
 FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();

CREATE INDEX generations_instruction_expiry ON generations_turns(content_expires_at,id) WHERE instruction IS NOT NULL;
