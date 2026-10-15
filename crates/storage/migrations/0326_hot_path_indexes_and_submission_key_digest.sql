-- Add missing high-traffic indexes on customer_balance_entries, provider_offers,
-- request_payloads, and video_submission_intents submission_key digest joins.

CREATE INDEX IF NOT EXISTS customer_balance_entries_workspace_charges_idx
    ON customer_balance_entries (account_id, organization_id, project_id)
    INCLUDE (amount_nanos)
    WHERE kind = 'charge';

CREATE INDEX IF NOT EXISTS provider_offers_model_alias_idx
    ON provider_offers (model_alias);

CREATE INDEX IF NOT EXISTS request_payloads_expiry_order_idx
    ON request_payloads (expires_at, attempt_id);

CREATE OR REPLACE FUNCTION niu_submission_key_digest(p_key UUID)
RETURNS BYTEA LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
    SELECT sha256(convert_to(p_key::text, 'UTF8'))
$$;

CREATE INDEX IF NOT EXISTS video_submission_intents_key_digest_idx
    ON video_submission_intents (
        organization_id,
        project_id,
        niu_submission_key_digest(submission_key)
    )
    INCLUDE (owner, id);
