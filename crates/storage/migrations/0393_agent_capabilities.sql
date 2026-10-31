-- Management is explicitly delegated during browser approval. Existing keys
-- receive no management grants and retain their existing inference behavior.
ALTER TABLE agent_authorizations ADD COLUMN requested_capabilities TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(requested_capabilities)<=6 AND requested_capabilities <@ ARRAY['pools:read','pools:write','events:read','events:write','evaluations:read','evaluations:write']::text[]);
CREATE TABLE agent_key_capabilities (
    key_id UUID NOT NULL REFERENCES api_keys(id),
    capability TEXT NOT NULL CHECK (capability IN ('pools:read','pools:write','events:read','events:write','evaluations:read','evaluations:write')),
    authorization_id UUID NOT NULL REFERENCES agent_authorizations(id),
    PRIMARY KEY(key_id,capability)
);
