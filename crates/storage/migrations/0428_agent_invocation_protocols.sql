-- Task context and interface scope are independently reviewable facts. Neither
-- grants authority by itself. Existing requests and credentials retain every
-- interface so their previously approved invocation meaning does not narrow.
ALTER TABLE agent_authorizations ADD COLUMN requested_task TEXT
  CHECK (
    requested_task IS NULL
    OR (
      requested_task = btrim(requested_task)
      AND char_length(requested_task) BETWEEN 1 AND 200
      AND requested_task !~ '[[:cntrl:]]'
    )
  );

ALTER TABLE agent_authorizations ADD COLUMN invocation_protocols TEXT[] NOT NULL
  DEFAULT ARRAY['chat','responses','messages','content','decisions','embeddings','video'];
ALTER TABLE api_keys ADD COLUMN invocation_protocols TEXT[] NOT NULL
  DEFAULT ARRAY['chat','responses','messages','content','decisions','embeddings','video'];

ALTER TABLE agent_authorizations ADD CONSTRAINT agent_authorizations_invocation_protocols_check
  CHECK (
    cardinality(invocation_protocols) > 0
    AND invocation_protocols <@ ARRAY['chat','responses','messages','content','decisions','embeddings','video']
  );
ALTER TABLE api_keys ADD CONSTRAINT api_keys_invocation_protocols_check
  CHECK (
    cardinality(invocation_protocols) > 0
    AND invocation_protocols <@ ARRAY['chat','responses','messages','content','decisions','embeddings','video']
  );
