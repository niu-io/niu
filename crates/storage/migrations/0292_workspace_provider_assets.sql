-- NIU workspace-owned Provider identities. Never account-wide object discovery,
-- raw requests, Source URLs, Bearer credentials or biometric session tokens.
CREATE TABLE workspace_provider_asset_groups (
 id UUID PRIMARY KEY,organization_id UUID NOT NULL,project_id UUID NOT NULL,
 vendor_id UUID NOT NULL REFERENCES vendors(id),vendor_revision BIGINT NOT NULL CHECK(vendor_revision>0),
 model_alias TEXT NOT NULL REFERENCES vendor_models(alias),model_revision BIGINT NOT NULL CHECK(model_revision>0),
 upstream_model TEXT NOT NULL,provider_ref TEXT CHECK(length(provider_ref) BETWEEN 1 AND 256),
 name TEXT NOT NULL CHECK(char_length(name) BETWEEN 1 AND 64),description TEXT CHECK(char_length(description)<=300),
 kind TEXT NOT NULL CHECK(kind IN ('generated','person')),
 status TEXT NOT NULL CHECK(status IN ('pending','ready','unknown','failed','deleted')),
 revision BIGINT NOT NULL DEFAULT 1 CHECK(revision>0),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id) REFERENCES projects(organization_id,id)
);
CREATE TABLE workspace_provider_assets (
 id UUID PRIMARY KEY,organization_id UUID NOT NULL,project_id UUID NOT NULL,group_id UUID NOT NULL,
 provider_ref TEXT CHECK(length(provider_ref) BETWEEN 1 AND 256),name TEXT CHECK(char_length(name)<=64),
 kind TEXT NOT NULL CHECK(kind IN ('image','video','audio')),
 status TEXT NOT NULL CHECK(status IN ('pending','processing','active','failed','unknown','deleted')),
 revision BIGINT NOT NULL DEFAULT 1 CHECK(revision>0),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(organization_id,project_id,id),UNIQUE(organization_id,project_id,group_id,id),FOREIGN KEY(organization_id,project_id,group_id) REFERENCES workspace_provider_asset_groups(organization_id,project_id,id)
);
CREATE TABLE workspace_provider_asset_operations (
 id UUID PRIMARY KEY,organization_id UUID NOT NULL,project_id UUID NOT NULL,key_id UUID NOT NULL,
 group_id UUID NOT NULL,asset_id UUID, idempotency_key UUID NOT NULL,request_sha256 BYTEA NOT NULL CHECK(octet_length(request_sha256)=32),
 action TEXT NOT NULL CHECK(action IN ('create_group','update_group','delete_group','create_asset','rename_asset','delete_asset')),
 status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','unknown','acknowledged','not_sent')),
 prior_status TEXT NOT NULL,requested_name TEXT CHECK(char_length(requested_name)<=64),requested_description TEXT CHECK(char_length(requested_description)<=300),
 http_status INTEGER CHECK(http_status BETWEEN 100 AND 599),request_id TEXT CHECK(length(request_id)<=256),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(organization_id,project_id,idempotency_key),
 CHECK ((action IN ('create_group','update_group','delete_group') AND asset_id IS NULL)
     OR (action IN ('create_asset','rename_asset','delete_asset') AND asset_id IS NOT NULL)),
 FOREIGN KEY(organization_id,project_id,key_id) REFERENCES api_keys(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,group_id) REFERENCES workspace_provider_asset_groups(organization_id,project_id,id),
 FOREIGN KEY(organization_id,project_id,group_id,asset_id) REFERENCES workspace_provider_assets(organization_id,project_id,group_id,id)
);
CREATE UNIQUE INDEX workspace_provider_group_mutation ON workspace_provider_asset_operations(group_id)
 WHERE asset_id IS NULL AND status IN ('prepared','unknown');
CREATE UNIQUE INDEX workspace_provider_asset_mutation ON workspace_provider_asset_operations(asset_id)
 WHERE asset_id IS NOT NULL AND status IN ('prepared','unknown');
CREATE INDEX workspace_provider_group_scope ON workspace_provider_asset_groups(organization_id,project_id,model_alias,id);
CREATE INDEX workspace_provider_asset_scope ON workspace_provider_assets(organization_id,project_id,group_id,id);
CREATE FUNCTION preserve_workspace_provider_asset_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Provider object history is durable' USING ERRCODE='23514'; END IF;
 IF NEW.id<>OLD.id OR NEW.organization_id<>OLD.organization_id OR NEW.project_id<>OLD.project_id
    OR NEW.created_at<>OLD.created_at OR (OLD.status='deleted' AND NEW.status<>'deleted') THEN
   RAISE EXCEPTION 'Provider object identity is immutable' USING ERRCODE='23514'; END IF;
 IF TG_TABLE_NAME='workspace_provider_asset_groups' THEN
   IF NEW.vendor_id<>OLD.vendor_id OR NEW.vendor_revision<>OLD.vendor_revision
      OR NEW.model_alias<>OLD.model_alias OR NEW.model_revision<>OLD.model_revision
      OR NEW.upstream_model<>OLD.upstream_model OR NEW.kind<>OLD.kind THEN
     RAISE EXCEPTION 'Provider group route is immutable' USING ERRCODE='23514'; END IF;
 ELSE
   IF NEW.group_id<>OLD.group_id OR NEW.kind<>OLD.kind THEN
     RAISE EXCEPTION 'Provider asset parent is immutable' USING ERRCODE='23514'; END IF;
 END IF;
 IF OLD.provider_ref IS NOT NULL AND NEW.provider_ref IS DISTINCT FROM OLD.provider_ref THEN
   RAISE EXCEPTION 'Provider reference cannot be replaced' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER preserve_workspace_provider_group BEFORE UPDATE OR DELETE ON workspace_provider_asset_groups
 FOR EACH ROW EXECUTE FUNCTION preserve_workspace_provider_asset_identity();
CREATE TRIGGER preserve_workspace_provider_asset BEFORE UPDATE OR DELETE ON workspace_provider_assets
 FOR EACH ROW EXECUTE FUNCTION preserve_workspace_provider_asset_identity();
CREATE FUNCTION preserve_workspace_provider_operation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status'-'http_status'-'request_id'-'updated_at')
    IS DISTINCT FROM (to_jsonb(OLD)-'status'-'http_status'-'request_id'-'updated_at') THEN
    RAISE EXCEPTION 'Provider mutation identity is immutable' USING ERRCODE='23514'; END IF;
 IF NOT ((OLD.status='prepared' AND NEW.status='unknown') OR
         (OLD.status='unknown' AND NEW.status IN ('unknown','acknowledged','not_sent')) OR
         (NEW.status=OLD.status AND NEW.http_status IS NOT DISTINCT FROM OLD.http_status AND NEW.request_id IS NOT DISTINCT FROM OLD.request_id)) THEN
    RAISE EXCEPTION 'Provider mutation outcome cannot be replayed' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER preserve_workspace_provider_operation BEFORE UPDATE OR DELETE ON workspace_provider_asset_operations
 FOR EACH ROW EXECUTE FUNCTION preserve_workspace_provider_operation();
