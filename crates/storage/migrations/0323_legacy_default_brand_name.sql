-- Adopt the current Niu default for deployments that persisted a retired default.
-- Preserve customized names, uploaded assets, theme overrides and immutable history.
WITH updated AS (
    UPDATE branding_configuration
    SET settings = jsonb_set(settings, '{display_name}', '"Niu"'::jsonb),
        revision = revision + 1,
        updated_at = clock_timestamp()
    WHERE singleton AND settings->>'display_name' IN ('NIU.IO', 'niu.io')
    RETURNING revision, settings
)
INSERT INTO branding_configuration_events (revision, settings, actor_kind)
SELECT revision, settings, 'unknown' FROM updated;
