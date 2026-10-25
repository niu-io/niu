-- Integration identity is independent of inference adapters and monetary rates.
-- Existing records remain unspecified; no endpoint-based inference or repricing.
CREATE TABLE provider_integration_settings (
    provider_id UUID PRIMARY KEY REFERENCES provider_businesses(id) ON DELETE CASCADE,
    integration_type TEXT NOT NULL CHECK (integration_type IN ('openrouter', 'newapi', 'litellm', 'custom')),
    revision BIGINT NOT NULL CHECK (revision > 0)
);

CREATE TABLE vendor_integration_settings (
    vendor_id UUID PRIMARY KEY REFERENCES vendors(id) ON DELETE CASCADE,
    -- NULL explicitly restores inheritance while retaining the revision for CAS.
    integration_type TEXT CHECK (integration_type IN ('openrouter', 'newapi', 'litellm', 'custom')),
    revision BIGINT NOT NULL CHECK (revision > 0)
);
