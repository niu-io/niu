-- Link restoration identity before dispatch; inference remains owned by Video.
CREATE TABLE generations_turn_intents (
 organization_id UUID NOT NULL,project_id UUID NOT NULL,owner TEXT NOT NULL,
 session_id UUID NOT NULL,turn_id UUID NOT NULL,intent_id UUID NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(organization_id,project_id,owner,session_id,turn_id),
 UNIQUE(organization_id,project_id,owner,intent_id),
 FOREIGN KEY(organization_id,project_id,owner,session_id,turn_id)
  REFERENCES generations_turns(organization_id,project_id,owner,session_id,id),
 FOREIGN KEY(organization_id,project_id,owner,intent_id)
  REFERENCES video_submission_intents(organization_id,project_id,owner,id)
);
CREATE TRIGGER immutable_generations_turn_intent BEFORE UPDATE OR DELETE ON generations_turn_intents
 FOR EACH ROW EXECUTE FUNCTION reject_accounting_mutation();
-- Session content deletion and ordinary bounded expiry cleanup clear the bound
-- intent's retained copy under the same turn -> intent lock order. Immutable
-- submission identity, original expiry, task evidence and accounting survive.
CREATE FUNCTION clear_generations_bound_intent_content() RETURNS trigger AS $$
BEGIN
 IF NEW.instruction IS NULL THEN
  UPDATE video_submission_intents vi
   SET request=NULL,deleted_at=clock_timestamp(),revision=revision+1
   FROM generations_turn_intents binding
   WHERE binding.organization_id=NEW.organization_id AND binding.project_id=NEW.project_id
    AND binding.owner=NEW.owner AND binding.session_id=NEW.session_id AND binding.turn_id=NEW.id
    AND vi.organization_id=binding.organization_id AND vi.project_id=binding.project_id
    AND vi.owner=binding.owner AND vi.id=binding.intent_id AND vi.request IS NOT NULL;
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER clear_generations_bound_intent AFTER UPDATE ON generations_turns
 FOR EACH ROW EXECUTE FUNCTION clear_generations_bound_intent_content();
