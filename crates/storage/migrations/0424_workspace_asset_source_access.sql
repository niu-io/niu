-- Short-lived public fetch capabilities for one exact workspace material.
-- Only the token hash is stored. Bytes stay in the encrypted workspace library;
-- expiry, the bound content hash and a small delivery budget bound the exposure.
CREATE TABLE workspace_asset_source_access (
    token_sha256 BYTEA PRIMARY KEY CHECK(octet_length(token_sha256)=32),
    organization_id UUID NOT NULL,
    project_id UUID NOT NULL,
    asset_id UUID NOT NULL,
    content_sha256 TEXT NOT NULL CHECK(content_sha256 ~ '^[a-f0-9]{64}$'),
    delivery_limit SMALLINT NOT NULL DEFAULT 4 CHECK(delivery_limit BETWEEN 1 AND 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT statement_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL,
    CHECK(expires_at>created_at AND expires_at<=created_at+interval '5 minutes'),
    FOREIGN KEY(organization_id,project_id,asset_id)
        REFERENCES workspace_asset_library(organization_id,project_id,id)
);
CREATE INDEX workspace_asset_source_access_expiry
    ON workspace_asset_source_access(expires_at);
-- At most delivery_limit successful capability fetches. Concurrent fetches
-- serialize on the access row before appending the ordinal.
CREATE TABLE workspace_asset_source_deliveries (
    token_sha256 BYTEA NOT NULL REFERENCES workspace_asset_source_access(token_sha256),
    ordinal SMALLINT NOT NULL CHECK(ordinal BETWEEN 1 AND 4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY(token_sha256,ordinal)
);
