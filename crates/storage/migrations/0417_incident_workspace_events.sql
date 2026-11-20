-- A workspace becomes a recipient only when one of its own dispatched attempts
-- contributes incident evidence. The random reference is local to that scope;
-- neither the platform incident number nor the connection is sent to customers.
CREATE TABLE incident_workspace_events (
    incident_id BIGINT NOT NULL REFERENCES connection_incidents(id),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    reference TEXT NOT NULL DEFAULT ('incident-' || replace(gen_random_uuid()::text, '-', '')),
    opened_sequence BIGINT,
    resolved_sequence BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(incident_id,organization_id,project_id),
    UNIQUE(organization_id,project_id,reference),
    FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id),
    FOREIGN KEY(organization_id,project_id,opened_sequence) REFERENCES workspace_events(organization_id,project_id,sequence),
    FOREIGN KEY(organization_id,project_id,resolved_sequence) REFERENCES workspace_events(organization_id,project_id,sequence),
    CHECK(resolved_sequence IS NULL OR opened_sequence IS NOT NULL)
);
CREATE INDEX incident_workspace_events_unopened ON incident_workspace_events(created_at,incident_id) WHERE opened_sequence IS NULL;
CREATE INDEX incident_workspace_events_unresolved ON incident_workspace_events(incident_id) WHERE resolved_sequence IS NULL;

CREATE FUNCTION niu_record_incident_workspace() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO incident_workspace_events(incident_id,organization_id,project_id)
    SELECT NEW.incident_id,a.organization_id,a.project_id FROM attempts a WHERE a.id=NEW.attempt_id
    ON CONFLICT(incident_id,organization_id,project_id) DO NOTHING;
    RETURN NEW;
END;
$$;
CREATE TRIGGER incident_workspace_observed AFTER INSERT ON connection_incident_observations
    FOR EACH ROW EXECUTE FUNCTION niu_record_incident_workspace();

-- Existing clients continue to receive the same pool/evaluation event forms.
ALTER TABLE workspace_events DROP CONSTRAINT workspace_events_event_type_check;
ALTER TABLE workspace_events ADD CONSTRAINT workspace_events_event_type_check
    CHECK(event_type IN ('pool.changed','evaluation.recorded','subscription.test','incident.opened','incident.resolved'));
ALTER TABLE workspace_events DROP CONSTRAINT workspace_events_resource_kind_check;
ALTER TABLE workspace_events ADD CONSTRAINT workspace_events_resource_kind_check
    CHECK(resource_kind IN ('pool','evaluation','subscription','incident'));
ALTER TABLE workspace_events ADD CONSTRAINT workspace_events_incident_shape CHECK (
    (event_type IN ('incident.opened','incident.resolved') AND resource_kind='incident'
      AND resource_slug ~ '^incident-[0-9a-f]{32}$'
      AND ((event_type='incident.opened' AND resource_revision=1)
           OR (event_type='incident.resolved' AND resource_revision=2)))
    OR (event_type NOT IN ('incident.opened','incident.resolved') AND resource_kind<>'incident')
);
