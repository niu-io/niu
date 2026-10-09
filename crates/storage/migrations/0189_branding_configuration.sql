-- Public deployment branding; secrets and arbitrary CSS do not belong here.
CREATE TABLE branding_configuration (
    singleton BOOLEAN PRIMARY KEY CHECK (singleton),
    revision BIGINT NOT NULL CHECK (revision>0),
    settings JSONB NOT NULL CHECK (jsonb_typeof(settings)='object'),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE branding_configuration_events (
    revision BIGINT PRIMARY KEY CHECK (revision>0),
    settings JSONB NOT NULL CHECK (jsonb_typeof(settings)='object'),
    actor_operator_id UUID REFERENCES admin_operators(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER immutable_branding_configuration_event
    BEFORE UPDATE OR DELETE ON branding_configuration_events
    FOR EACH ROW EXECUTE FUNCTION preserve_asset_operation_authorization();
