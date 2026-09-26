CREATE TABLE vendors (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 1 AND 100),
    bootstrap_name TEXT UNIQUE CHECK (bootstrap_name IS NULL OR char_length(bootstrap_name) BETWEEN 1 AND 100),
    adapter TEXT NOT NULL CHECK (adapter IN ('openrouter', 'openai')),
    api_base TEXT NOT NULL CHECK (char_length(api_base) BETWEEN 1 AND 2048),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    credential_ciphertext BYTEA NOT NULL CHECK (octet_length(credential_ciphertext) BETWEEN 30 AND 16384),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE vendor_models (
    alias TEXT PRIMARY KEY CHECK (char_length(alias) BETWEEN 1 AND 200),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    upstream_model TEXT NOT NULL CHECK (char_length(upstream_model) BETWEEN 1 AND 200),
    public_catalog BOOLEAN NOT NULL DEFAULT FALSE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    capabilities JSONB NOT NULL CHECK (jsonb_typeof(capabilities) = 'object'),
    pricing JSONB CHECK (pricing IS NULL OR jsonb_typeof(pricing) = 'object'),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX vendor_models_by_vendor ON vendor_models(vendor_id, alias);

-- This table deliberately stores metadata only: no endpoint credentials,
-- request payloads, or customer data are accepted by its write paths.
CREATE TABLE vendor_audit_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    model_alias TEXT,
    action TEXT NOT NULL CHECK (action IN (
        'vendor_created', 'vendor_updated', 'vendor_seeded',
        'vendor_model_created', 'vendor_model_updated', 'vendor_model_seeded'
    )),
    revision BIGINT NOT NULL CHECK (revision > 0),
    actor_kind TEXT NOT NULL DEFAULT 'installation' CHECK (actor_kind = 'installation'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX vendor_audit_by_vendor ON vendor_audit_events(vendor_id, created_at DESC, id DESC);
