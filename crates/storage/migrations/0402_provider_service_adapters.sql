-- Explicit Provider service identity; no endpoint inference, repricing or ownership changes.
ALTER TABLE provider_integration_settings DROP CONSTRAINT provider_integration_settings_integration_type_check;
ALTER TABLE provider_integration_settings ADD CONSTRAINT provider_integration_settings_integration_type_check
    CHECK (integration_type IN ('openrouter','newapi','litellm','custom','fastrouter','babelark','qiniu','deepseek'));
ALTER TABLE vendor_integration_settings DROP CONSTRAINT vendor_integration_settings_integration_type_check;
ALTER TABLE vendor_integration_settings ADD CONSTRAINT vendor_integration_settings_integration_type_check
    CHECK (integration_type IN ('openrouter','newapi','litellm','custom','fastrouter','babelark','qiniu','deepseek'));
