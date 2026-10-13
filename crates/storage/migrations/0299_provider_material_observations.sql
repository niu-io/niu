-- Successful explicit Get metadata is distinct from uncertain write outcomes.
-- No operation is acknowledged or unblocked by these observations.
ALTER TABLE workspace_provider_asset_groups
 ADD COLUMN observed_name TEXT CHECK(char_length(observed_name)<=64),
 ADD COLUMN observed_description TEXT CHECK(char_length(observed_description)<=300),
 ADD COLUMN observed_at TIMESTAMPTZ,
 ADD CONSTRAINT provider_group_observation_complete CHECK(observed_at IS NOT NULL OR (observed_name IS NULL AND observed_description IS NULL));
ALTER TABLE workspace_provider_assets
 ADD COLUMN observed_name TEXT CHECK(char_length(observed_name)<=64),
 ADD COLUMN observed_status TEXT CHECK(observed_status IN ('processing','active','failed')),
 ADD COLUMN observed_at TIMESTAMPTZ,
 ADD CONSTRAINT provider_asset_observation_complete CHECK((observed_at IS NULL AND observed_name IS NULL AND observed_status IS NULL) OR (observed_at IS NOT NULL AND observed_status IS NOT NULL));
