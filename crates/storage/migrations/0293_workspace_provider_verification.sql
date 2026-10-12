-- Scoped upstream H5 verification: no local biometric detector or approval.
CREATE TABLE workspace_provider_verification_sessions (
 id UUID PRIMARY KEY, organization_id UUID NOT NULL, project_id UUID NOT NULL,
 key_id UUID NOT NULL, vendor_id UUID NOT NULL REFERENCES vendors(id),
 vendor_revision BIGINT NOT NULL CHECK(vendor_revision>0),
 model_alias TEXT NOT NULL REFERENCES vendor_models(alias), model_revision BIGINT NOT NULL CHECK(model_revision>0),
 upstream_model TEXT NOT NULL, idempotency_key UUID NOT NULL,
 request_sha256 BYTEA NOT NULL CHECK(octet_length(request_sha256)=32),
 subject_name TEXT CHECK(char_length(subject_name) BETWEEN 1 AND 32),
 status TEXT NOT NULL CHECK(status IN ('prepared','unknown','not_sent','waiting_user','processing','resolving','verified','failed','expired')),
 ciphertext BYTEA CHECK(octet_length(ciphertext) BETWEEN 30 AND 32800),
 expires_at TIMESTAMPTZ, group_id UUID,
 query_previous_status TEXT CHECK(query_previous_status IN ('waiting_user','processing')),
 CHECK((status='resolving')=(query_previous_status IS NOT NULL)),
 http_status INTEGER CHECK(http_status BETWEEN 100 AND 599), request_id TEXT CHECK(length(request_id)<=256),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(organization_id,project_id,idempotency_key),
 FOREIGN KEY(organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,group_id) REFERENCES workspace_provider_asset_groups(organization_id,project_id,id),
 CHECK(status<>'verified' OR group_id IS NOT NULL),
 CHECK(status NOT IN ('waiting_user','processing','resolving') OR ciphertext IS NOT NULL)
);
CREATE INDEX workspace_provider_verification_scope ON workspace_provider_verification_sessions(organization_id,project_id,model_alias,id);
CREATE FUNCTION preserve_workspace_provider_verification() RETURNS trigger LANGUAGE plpgsql AS $$
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
   RAISE EXCEPTION 'Verification envelope permits authorized rotation only' USING ERRCODE='23514'; END IF;
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
CREATE TRIGGER preserve_workspace_provider_verification BEFORE INSERT OR UPDATE OR DELETE ON workspace_provider_verification_sessions
 FOR EACH ROW EXECUTE FUNCTION preserve_workspace_provider_verification();
-- Extend the existing closed offline-rotation target inventory.
ALTER TABLE encryption_rewrap_authorizations DROP CONSTRAINT encryption_rewrap_authorizations_table_name_check;
ALTER TABLE encryption_rewrap_authorizations ADD CONSTRAINT encryption_rewrap_authorizations_table_name_check CHECK (table_name IN (
 'vendors','vendor_asset_management_credentials','codex_connections','payment_gateway_configuration',
 'media_result_references','asset_listing_results','asset_lookup_results','asset_group_read_results',
 'asset_group_update_patches','inspected_image_source_content','workspace_asset_library_content',
 'workspace_provider_verification_sessions'
));
