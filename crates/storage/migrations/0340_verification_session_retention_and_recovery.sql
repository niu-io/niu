-- Allow purging verification session ciphertexts once terminal or expired,
-- recover stale 'resolving' query claims, and index active verification
-- ciphertexts (#27 #134).

CREATE OR REPLACE FUNCTION preserve_workspace_provider_verification() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='INSERT' THEN
   IF NEW.status<>'prepared' OR NEW.ciphertext IS NOT NULL OR NEW.group_id IS NOT NULL OR NEW.expires_at IS NOT NULL THEN
     RAISE EXCEPTION 'Verification starts as an unsubmitted intent' USING ERRCODE='23514'; END IF;
   RETURN NEW;
 END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Verification history is durable' USING ERRCODE='23514'; END IF;
 IF niu_authorized_encryption_rewrap(TG_TABLE_NAME,'ciphertext',to_jsonb(OLD),to_jsonb(NEW)) THEN RETURN NEW; END IF;
 IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.project_id<>OLD.project_id
    OR NEW.key_id<>OLD.key_id OR NEW.vendor_id<>OLD.vendor_id OR NEW.vendor_revision<>OLD.vendor_revision
    OR NEW.model_alias<>OLD.model_alias OR NEW.model_revision<>OLD.model_revision OR NEW.upstream_model<>OLD.upstream_model
    OR NEW.idempotency_key<>OLD.idempotency_key OR NEW.request_sha256<>OLD.request_sha256
    OR NEW.subject_name IS DISTINCT FROM OLD.subject_name OR NEW.created_at<>OLD.created_at
    OR NEW.updated_at<OLD.updated_at THEN RAISE EXCEPTION 'Verification identity is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.ciphertext IS NOT NULL AND NEW.ciphertext IS DISTINCT FROM OLD.ciphertext THEN
   IF NOT (NEW.ciphertext IS NULL AND (
       NEW.status IN ('verified','failed','expired','not_sent')
       OR (OLD.expires_at IS NOT NULL AND OLD.expires_at <= clock_timestamp())
   )) THEN
     RAISE EXCEPTION 'Verification envelope permits authorized rotation only' USING ERRCODE='23514';
   END IF;
 END IF;
 IF OLD.expires_at IS NOT NULL AND NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
   RAISE EXCEPTION 'Verification expiry is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.group_id IS NOT NULL AND NEW.group_id IS DISTINCT FROM OLD.group_id THEN
   RAISE EXCEPTION 'Verified group binding is immutable' USING ERRCODE='23514'; END IF;
 IF OLD.status IN ('verified','failed','expired','not_sent') AND NEW.status<>OLD.status THEN
   RAISE EXCEPTION 'Terminal verification cannot be revived' USING ERRCODE='23514'; END IF;
 IF OLD.status='prepared' AND NEW.status NOT IN ('prepared','unknown') THEN
   RAISE EXCEPTION 'Verification must claim before dispatch' USING ERRCODE='23514'; END IF;
 IF NEW.status='verified' AND NOT EXISTS(SELECT 1 FROM workspace_provider_asset_groups g
    WHERE g.id=NEW.group_id AND g.organization_id=NEW.organization_id AND g.project_id=NEW.project_id
      AND g.vendor_id=NEW.vendor_id AND g.vendor_revision=NEW.vendor_revision AND g.model_alias=NEW.model_alias
      AND g.model_revision=NEW.model_revision AND g.upstream_model=NEW.upstream_model AND g.kind='person' AND g.provider_ref IS NOT NULL) THEN
   RAISE EXCEPTION 'Verified group must retain original scope and account' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;

CREATE INDEX IF NOT EXISTS workspace_provider_verification_retention
    ON workspace_provider_verification_sessions(expires_at, id)
    WHERE ciphertext IS NOT NULL;

CREATE INDEX IF NOT EXISTS workspace_provider_verification_resolving
    ON workspace_provider_verification_sessions(updated_at, id)
    WHERE status = 'resolving';

CREATE OR REPLACE FUNCTION niu_purge_workspace_provider_verification_page() RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
    recovered BIGINT := 0;
    purged BIGINT := 0;
BEGIN
    WITH stale_resolving AS (
        SELECT id
        FROM workspace_provider_verification_sessions
        WHERE status = 'resolving'
          AND updated_at <= clock_timestamp() - interval '60 seconds'
        ORDER BY updated_at, id
        LIMIT 16
        FOR UPDATE SKIP LOCKED
    )
    UPDATE workspace_provider_verification_sessions s
    SET status = CASE
            WHEN s.expires_at IS NOT NULL AND s.expires_at <= clock_timestamp() THEN 'expired'
            ELSE s.query_previous_status
        END,
        ciphertext = CASE
            WHEN s.expires_at IS NOT NULL AND s.expires_at <= clock_timestamp() THEN NULL
            ELSE s.ciphertext
        END,
        query_previous_status = NULL,
        updated_at = GREATEST(s.updated_at, clock_timestamp())
    FROM stale_resolving
    WHERE s.id = stale_resolving.id;
    GET DIAGNOSTICS recovered = ROW_COUNT;

    WITH expired_or_terminal AS (
        SELECT id
        FROM workspace_provider_verification_sessions
        WHERE ciphertext IS NOT NULL
          AND (
              status IN ('verified', 'failed', 'expired', 'not_sent')
              OR (
                  expires_at IS NOT NULL
                  AND expires_at <= clock_timestamp()
                  AND status IN ('waiting_user', 'processing', 'unknown', 'resolving')
              )
          )
        ORDER BY expires_at NULLS FIRST, id
        LIMIT 16
        FOR UPDATE SKIP LOCKED
    )
    UPDATE workspace_provider_verification_sessions s
    SET status = CASE
            WHEN s.status IN ('waiting_user', 'processing', 'unknown', 'resolving')
                 AND s.expires_at IS NOT NULL
                 AND s.expires_at <= clock_timestamp() THEN 'expired'
            ELSE s.status
        END,
        query_previous_status = CASE
            WHEN s.status = 'resolving' THEN NULL
            ELSE s.query_previous_status
        END,
        ciphertext = NULL,
        updated_at = GREATEST(s.updated_at, clock_timestamp())
    FROM expired_or_terminal
    WHERE s.id = expired_or_terminal.id;
    GET DIAGNOSTICS purged = ROW_COUNT;

    RETURN recovered + purged;
END;
$$;
