-- Encrypt revealable workspace API key secrets at rest with application-layer
-- AEAD (CredentialCipher), drop any plaintext token_secret column, support
-- offline key rotation rewrapping, index expired secrets for background purge,
-- and audit secret reveal accesses.

ALTER TABLE api_keys
    DROP COLUMN IF EXISTS token_secret;

ALTER TABLE api_keys
    ADD COLUMN IF NOT EXISTS token_secret_ciphertext BYTEA
    CHECK (
        token_secret_ciphertext IS NULL
        OR (
            octet_length(token_secret_ciphertext) BETWEEN 30 AND 512
            AND get_byte(token_secret_ciphertext, 0) = 1
        )
    );

CREATE INDEX IF NOT EXISTS api_keys_secret_expiry_idx
    ON api_keys (expires_at)
    WHERE token_secret_ciphertext IS NOT NULL;

ALTER TABLE key_audit_events DROP CONSTRAINT key_audit_events_action_check;
ALTER TABLE key_audit_events ADD CONSTRAINT key_audit_events_action_check
    CHECK (action IN ('issued', 'revoked', 'rotated', 'updated', 'revealed'));

ALTER TABLE encryption_rewrap_authorizations DROP CONSTRAINT encryption_rewrap_authorizations_table_name_check;
ALTER TABLE encryption_rewrap_authorizations ADD CONSTRAINT encryption_rewrap_authorizations_table_name_check CHECK(table_name IN (
 'vendors','vendor_asset_management_credentials','codex_connections','payment_gateway_configuration',
 'media_result_references','asset_listing_results','asset_lookup_results','asset_group_read_results',
 'asset_group_update_patches','inspected_image_source_content','workspace_asset_library_content',
 'workspace_provider_verification_sessions','workspace_event_subscriptions','api_keys'
));
