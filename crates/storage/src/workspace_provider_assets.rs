//! Scoped Provider objects and one-shot mutations, not a local inspection system.
//! Gateway must independently admit the selected published route and Supplier
//! policy. Saved route identity/enablement alone does not grant dispatch rights.
use crate::{Principal, Store, StoreError, TenantScope};
use niu_media::fastrouter_domain::{
    FastRouterAsset, FastRouterAssetKind, FastRouterGroup, FastRouterProviderReference,
};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

const MAX_GROUPS: i64 = 256;
const MAX_ASSETS: i64 = 1024;
const MAX_REQUEST_BYTES: usize = 16 * 1024;
#[derive(Serialize, sqlx::FromRow)]
pub struct WorkspaceProviderAssetGroup {
    pub id: Uuid,
    pub model: String,
    pub name: String,
    pub description: Option<String>,
    pub kind: String,
    pub status: String,
    pub revision: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    #[serde(skip)]
    provider_ref: Option<String>,
    #[serde(skip)]
    vendor_id: Uuid,
    #[serde(skip)]
    vendor_revision: i64,
    #[serde(skip)]
    model_revision: i64,
}
impl WorkspaceProviderAssetGroup {
    pub fn private_reference(&self) -> Option<&str> {
        self.provider_ref.as_deref()
    }
    pub fn vendor_id(&self) -> Uuid {
        self.vendor_id
    }
    pub fn vendor_revision(&self) -> i64 {
        self.vendor_revision
    }
    pub fn model_revision(&self) -> i64 {
        self.model_revision
    }
}
#[derive(Serialize, sqlx::FromRow)]
pub struct WorkspaceProviderAsset {
    pub id: Uuid,
    pub group_id: Uuid,
    pub model: String,
    pub name: Option<String>,
    pub kind: String,
    pub status: String,
    pub revision: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    #[serde(skip)]
    provider_ref: Option<String>,
    #[serde(skip)]
    group_provider_ref: Option<String>,
    #[serde(skip)]
    create_acknowledged: bool,
    #[serde(skip)]
    vendor_id: Uuid,
    #[serde(skip)]
    vendor_revision: i64,
    #[serde(skip)]
    model_revision: i64,
}
impl WorkspaceProviderAsset {
    pub fn has_acknowledged_creation(&self) -> bool {
        self.create_acknowledged
    }
    pub fn private_reference(&self) -> Option<&str> {
        self.provider_ref.as_deref()
    }
    pub fn private_group_reference(&self) -> Option<&str> {
        self.group_provider_ref.as_deref()
    }
    pub fn vendor_id(&self) -> Uuid {
        self.vendor_id
    }
    pub fn vendor_revision(&self) -> i64 {
        self.vendor_revision
    }
    pub fn model_revision(&self) -> i64 {
        self.model_revision
    }
}
#[derive(Serialize, sqlx::FromRow)]
pub struct WorkspaceProviderAssetOperation {
    pub id: Uuid,
    pub group_id: Uuid,
    pub asset_id: Option<Uuid>,
    pub model: String,
    pub action: String,
    pub status: String,
    pub http_status: Option<i32>,
    pub request_id: Option<String>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    #[serde(skip)]
    vendor_id: Uuid,
    #[serde(skip)]
    vendor_revision: i64,
    #[serde(skip)]
    model_revision: i64,
}
impl WorkspaceProviderAssetOperation {
    pub fn vendor_id(&self) -> Uuid {
        self.vendor_id
    }
    pub fn vendor_revision(&self) -> i64 {
        self.vendor_revision
    }
    pub fn model_revision(&self) -> i64 {
        self.model_revision
    }
}
/// Actual current encrypted credential and immutable operation destination.
/// No Debug/Serialize; callers must never expose this through the NIU API.
pub struct WorkspaceProviderAssetRoute {
    vendor_id: Uuid,
    vendor_revision: i64,
    model_revision: i64,
    model_alias: String,
    upstream_model: String,
    adapter: String,
    api_base: String,
    credential_ciphertext: Vec<u8>,
    capabilities: Value,
    snapshot: crate::GuardrailSnapshot,
    generation: Option<i64>,
}
impl WorkspaceProviderAssetRoute {
    pub fn vendor_id(&self) -> Uuid {
        self.vendor_id
    }
    pub fn vendor_revision(&self) -> i64 {
        self.vendor_revision
    }
    pub fn model_revision(&self) -> i64 {
        self.model_revision
    }
    pub fn model_alias(&self) -> &str {
        &self.model_alias
    }
    pub fn upstream_model(&self) -> &str {
        &self.upstream_model
    }
    pub fn adapter(&self) -> &str {
        &self.adapter
    }
    pub fn api_base(&self) -> &str {
        &self.api_base
    }
    pub fn credential_ciphertext(&self) -> &[u8] {
        &self.credential_ciphertext
    }
    pub fn model_capabilities(&self) -> &Value {
        &self.capabilities
    }
    pub fn registry_generation(&self) -> Option<i64> {
        self.generation
    }
}
pub enum WorkspaceProviderAssetMutation {
    CreateGroup {
        name: String,
        description: Option<String>,
    },
    UpdateGroup {
        group_id: Uuid,
        name: Option<String>,
        description: Option<String>,
        expected_revision: Option<i64>,
    },
    DeleteGroup {
        group_id: Uuid,
        expected_revision: Option<i64>,
    },
    CreateAsset {
        group_id: Uuid,
        url: String,
        name: Option<String>,
        kind: FastRouterAssetKind,
    },
    RenameAsset {
        asset_id: Uuid,
        name: String,
        expected_revision: Option<i64>,
    },
    DeleteAsset {
        asset_id: Uuid,
        expected_revision: Option<i64>,
    },
}
pub struct WorkspaceProviderAssetPrepared {
    operation: WorkspaceProviderAssetOperation,
    group: Option<WorkspaceProviderAssetGroup>,
    asset: Option<WorkspaceProviderAsset>,
    body: Value,
}
impl WorkspaceProviderAssetPrepared {
    pub fn operation(&self) -> &WorkspaceProviderAssetOperation {
        &self.operation
    }
    pub fn group(&self) -> Option<&WorkspaceProviderAssetGroup> {
        self.group.as_ref()
    }
    pub fn asset(&self) -> Option<&WorkspaceProviderAsset> {
        self.asset.as_ref()
    }
    pub fn request_body(&self) -> &Value {
        &self.body
    }
}
pub enum WorkspaceProviderAssetOutcome {
    Acknowledged {
        provider_reference: Option<FastRouterProviderReference>,
    },
    Unknown {
        http_status: Option<u16>,
        request_id: Option<String>,
    },
    /// Only a proven failure before HTTP dispatch; no HTTP refusal implies this.
    NotDispatched,
}
const GROUP_COLUMNS: &str = "g.id,g.model_alias AS model,g.name,g.description,g.kind,g.status,g.revision::text AS revision,floor(extract(epoch FROM g.created_at)*1000)::bigint AS created_at_ms,floor(extract(epoch FROM g.updated_at)*1000)::bigint AS updated_at_ms,g.provider_ref,g.vendor_id,g.vendor_revision,g.model_revision";
const ASSET_COLUMNS: &str = "a.id,a.group_id,g.model_alias AS model,a.name,a.kind,CASE WHEN g.status='unknown' THEN 'unknown' ELSE a.status END AS status,a.revision::text AS revision,floor(extract(epoch FROM a.created_at)*1000)::bigint AS created_at_ms,floor(extract(epoch FROM a.updated_at)*1000)::bigint AS updated_at_ms,a.provider_ref,g.provider_ref AS group_provider_ref,g.vendor_id,g.vendor_revision,g.model_revision,EXISTS(SELECT 1 FROM workspace_provider_asset_operations created WHERE created.organization_id=a.organization_id AND created.project_id=a.project_id AND created.group_id=a.group_id AND created.asset_id=a.id AND created.action='create_asset' AND created.status='acknowledged') AS create_acknowledged";
const OP_COLUMNS: &str = "o.id,o.group_id,o.asset_id,g.model_alias AS model,o.action,o.status,o.http_status,o.request_id,floor(extract(epoch FROM o.created_at)*1000)::bigint AS created_at_ms,floor(extract(epoch FROM o.updated_at)*1000)::bigint AS updated_at_ms,g.vendor_id,g.vendor_revision,g.model_revision";
#[derive(Serialize)]
pub struct WorkspaceProviderAssetPage<T: Serialize> {
    pub data: Vec<T>,
    pub next_cursor: Option<Uuid>,
}
impl Store {
    pub(crate) async fn provider_asset_key_using(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        p: &Principal,
        model: &str,
        lock: bool,
    ) -> Result<(), StoreError> {
        let scope = p.scope();
        let sql = format!(
            "SELECT id FROM api_keys WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND revoked_at IS NULL AND expires_at>clock_timestamp() AND ('*'=ANY(allowed_models) OR $4=ANY(allowed_models)){}",
            if lock { " FOR SHARE" } else { "" }
        );
        let found: Option<Uuid> = sqlx::query_scalar(&sql)
            .bind(p.key_id())
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(model)
            .fetch_optional(&mut **tx)
            .await?;
        found.ok_or(StoreError::Unauthorized)?;
        Ok(())
    }
    async fn provider_asset_route_using(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        p: &Principal,
        model: &str,
    ) -> Result<WorkspaceProviderAssetRoute, StoreError> {
        // Shared access to the existing publication writer lock; no network work
        // holds it. Configuration/qualification cannot change during admission.
        sqlx::query("SELECT pg_advisory_xact_lock_shared(716554)")
            .execute(&mut **tx)
            .await?;
        let scope = p.scope();
        let snapshot = Self::guardrail_snapshot_using(&mut **tx, scope, p.key_id())
            .await?
            .ok_or(StoreError::Unauthorized)?;
        Self::authorize_media_processing_using(tx, p, &snapshot).await?;
        Self::provider_asset_key_using(tx, p, model, true).await?;
        let row=sqlx::query("SELECT v.id,v.revision AS vendor_revision,v.adapter,v.api_base,v.credential_ciphertext,m.revision AS model_revision,m.alias,m.upstream_model,m.capabilities FROM vendor_models m JOIN vendors v ON v.id=m.vendor_id WHERE m.alias=$1 AND m.enabled AND v.enabled AND v.credential_ciphertext IS NOT NULL AND m.capabilities#>>'{provider_assets,channel}'='fastrouter-actions-v1' AND (EXISTS(SELECT 1 FROM personal_vendor_ownership own WHERE own.vendor_id=v.id AND own.organization_id=$2) OR (NOT EXISTS(SELECT 1 FROM personal_vendor_ownership own WHERE own.vendor_id=v.id) AND niu_supplier_model_route_available(m.alias))) FOR SHARE OF v,m")
            .bind(model).bind(scope.organization_id).fetch_optional(&mut **tx).await?.ok_or(StoreError::Conflict)?;
        let generation =
            sqlx::query_scalar("SELECT generation FROM routing_registry_active WHERE singleton")
                .fetch_optional(&mut **tx)
                .await?;
        Ok(WorkspaceProviderAssetRoute {
            vendor_id: row.get("id"),
            vendor_revision: row.get("vendor_revision"),
            model_revision: row.get("model_revision"),
            model_alias: row.get("alias"),
            upstream_model: row.get("upstream_model"),
            adapter: row.get("adapter"),
            api_base: row.get("api_base"),
            credential_ciphertext: row.get("credential_ciphertext"),
            capabilities: row.get("capabilities"),
            snapshot,
            generation,
        })
    }
    pub async fn workspace_provider_asset_route(
        &self,
        p: &Principal,
        model: &str,
    ) -> Result<WorkspaceProviderAssetRoute, StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        let route = Self::provider_asset_route_using(&mut tx, p, model).await?;
        tx.commit().await?;
        Ok(route)
    }
    pub(crate) async fn provider_asset_route_check_using(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        p: &Principal,
        expected: &WorkspaceProviderAssetRoute,
    ) -> Result<(), StoreError> {
        let live = Self::provider_asset_route_using(tx, p, &expected.model_alias).await?;
        if live.vendor_id != expected.vendor_id
            || live.vendor_revision != expected.vendor_revision
            || live.model_revision != expected.model_revision
            || live.upstream_model != expected.upstream_model
            || live.adapter != expected.adapter
            || live.api_base != expected.api_base
            || live.credential_ciphertext != expected.credential_ciphertext
            || live.capabilities != expected.capabilities
            || live.generation != expected.generation
        {
            return Err(StoreError::Conflict);
        }
        Self::authorize_media_processing_using(tx, p, &expected.snapshot).await
    }
    async fn provider_group_using(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scope: TenantScope,
        id: Uuid,
        lock: bool,
    ) -> Result<Option<WorkspaceProviderAssetGroup>, StoreError> {
        let sql = format!(
            "SELECT {GROUP_COLUMNS} FROM workspace_provider_asset_groups g WHERE g.organization_id=$1 AND g.project_id=$2 AND g.id=$3{}",
            if lock { " FOR UPDATE OF g" } else { "" }
        );
        Ok(sqlx::query_as(&sql)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(id)
            .fetch_optional(&mut **tx)
            .await?)
    }
    async fn provider_asset_using(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scope: TenantScope,
        id: Uuid,
        lock: bool,
    ) -> Result<Option<WorkspaceProviderAsset>, StoreError> {
        let sql = format!(
            "SELECT {ASSET_COLUMNS} FROM workspace_provider_assets a JOIN workspace_provider_asset_groups g ON g.id=a.group_id WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=$3{}",
            if lock { " FOR UPDATE OF g,a" } else { "" }
        );
        Ok(sqlx::query_as(&sql)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(id)
            .fetch_optional(&mut **tx)
            .await?)
    }
    async fn provider_operation_using(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<Option<WorkspaceProviderAssetOperation>, StoreError> {
        let sql = format!(
            "SELECT {OP_COLUMNS} FROM workspace_provider_asset_operations o JOIN workspace_provider_asset_groups g ON g.id=o.group_id WHERE o.organization_id=$1 AND o.project_id=$2 AND o.id=$3"
        );
        Ok(sqlx::query_as(&sql)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(id)
            .fetch_optional(&mut **tx)
            .await?)
    }
    pub async fn workspace_provider_asset_group(
        &self,
        p: &Principal,
        id: Uuid,
    ) -> Result<Option<WorkspaceProviderAssetGroup>, StoreError> {
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let v = Self::provider_group_using(&mut tx, p.scope(), id, false).await?;
        if let Some(v) = &v {
            Self::provider_asset_key_using(&mut tx, p, &v.model, false).await?;
        }
        tx.commit().await?;
        Ok(v.filter(|v| v.status != "deleted"))
    }
    pub async fn workspace_provider_asset(
        &self,
        p: &Principal,
        id: Uuid,
    ) -> Result<Option<WorkspaceProviderAsset>, StoreError> {
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let v = Self::provider_asset_using(&mut tx, p.scope(), id, false).await?;
        if let Some(v) = &v {
            Self::provider_asset_key_using(&mut tx, p, &v.model, false).await?;
        }
        tx.commit().await?;
        Ok(v.filter(|v| v.status != "deleted"))
    }
    pub async fn workspace_provider_asset_operation(
        &self,
        p: &Principal,
        id: Uuid,
    ) -> Result<Option<WorkspaceProviderAssetOperation>, StoreError> {
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let v = Self::provider_operation_using(&mut tx, p.scope(), id).await?;
        if let Some(v) = &v {
            Self::provider_asset_key_using(&mut tx, p, &v.model, false).await?;
        }
        tx.commit().await?;
        Ok(v)
    }
    pub async fn workspace_provider_asset_groups(
        &self,
        p: &Principal,
        model: &str,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<WorkspaceProviderAssetPage<WorkspaceProviderAssetGroup>, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.begin_bounded_read_snapshot().await?;
        Self::provider_asset_key_using(&mut tx, p, model, false).await?;
        let scope = p.scope();
        if let Some(id) = after {
            let cursor = Self::provider_group_using(&mut tx, scope, id, false)
                .await?
                .ok_or(StoreError::Conflict)?;
            if cursor.model != model || cursor.status == "deleted" {
                return Err(StoreError::Conflict);
            }
        }
        let sql = format!(
            "SELECT {GROUP_COLUMNS} FROM workspace_provider_asset_groups g WHERE g.organization_id=$1 AND g.project_id=$2 AND g.model_alias=$3 AND g.status<>'deleted' AND ($4::uuid IS NULL OR g.id>$4) ORDER BY g.id LIMIT $5"
        );
        let mut data: Vec<WorkspaceProviderAssetGroup> = sqlx::query_as(&sql)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(model)
            .bind(after)
            .bind(limit + 1)
            .fetch_all(&mut *tx)
            .await?;
        let next_cursor = if data.len() > limit as usize {
            data.truncate(limit as usize);
            data.last().map(|v| v.id)
        } else {
            None
        };
        tx.commit().await?;
        Ok(WorkspaceProviderAssetPage { data, next_cursor })
    }
    pub async fn workspace_provider_assets(
        &self,
        p: &Principal,
        model: &str,
        group: Option<Uuid>,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<WorkspaceProviderAssetPage<WorkspaceProviderAsset>, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.begin_bounded_read_snapshot().await?;
        Self::provider_asset_key_using(&mut tx, p, model, false).await?;
        let scope = p.scope();
        if let Some(id) = group {
            let g = Self::provider_group_using(&mut tx, scope, id, false)
                .await?
                .ok_or(StoreError::Conflict)?;
            if g.model != model || g.status == "deleted" {
                return Err(StoreError::Conflict);
            }
        }
        if let Some(id) = after {
            let a = Self::provider_asset_using(&mut tx, scope, id, false)
                .await?
                .ok_or(StoreError::Conflict)?;
            if a.model != model || a.status == "deleted" || group.is_some_and(|g| g != a.group_id) {
                return Err(StoreError::Conflict);
            }
        }
        let sql = format!(
            "SELECT {ASSET_COLUMNS} FROM workspace_provider_assets a JOIN workspace_provider_asset_groups g ON g.id=a.group_id WHERE a.organization_id=$1 AND a.project_id=$2 AND g.model_alias=$3 AND a.status<>'deleted' AND g.status<>'deleted' AND ($4::uuid IS NULL OR a.group_id=$4) AND ($5::uuid IS NULL OR a.id>$5) ORDER BY a.id LIMIT $6"
        );
        let mut data: Vec<WorkspaceProviderAsset> = sqlx::query_as(&sql)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(model)
            .bind(group)
            .bind(after)
            .bind(limit + 1)
            .fetch_all(&mut *tx)
            .await?;
        let next_cursor = if data.len() > limit as usize {
            data.truncate(limit as usize);
            data.last().map(|v| v.id)
        } else {
            None
        };
        tx.commit().await?;
        Ok(WorkspaceProviderAssetPage { data, next_cursor })
    }
}

fn provider_kind<T: Serialize>(v: &T) -> Result<String, StoreError> {
    serde_json::to_value(v)
        .map_err(|_| StoreError::InvalidObservation)?
        .as_str()
        .map(str::to_owned)
        .ok_or(StoreError::InvalidObservation)
}
fn provider_ref(v: Option<&str>) -> Result<FastRouterProviderReference, StoreError> {
    FastRouterProviderReference::parse(v.ok_or(StoreError::Conflict)?)
        .map_err(|_| StoreError::InvalidObservation)
}
fn provider_revision(actual: &str, expected: Option<i64>) -> Result<(), StoreError> {
    if expected.is_some_and(|v| actual.parse::<i64>().ok() != Some(v)) {
        Err(StoreError::Conflict)
    } else {
        Ok(())
    }
}
fn provider_group_binding(
    g: &WorkspaceProviderAssetGroup,
    r: &WorkspaceProviderAssetRoute,
) -> Result<(), StoreError> {
    if g.model != r.model_alias
        || g.vendor_id != r.vendor_id
        || g.vendor_revision != r.vendor_revision
        || g.model_revision != r.model_revision
    {
        Err(StoreError::Conflict)
    } else {
        Ok(())
    }
}
impl Store {
    pub async fn prepare_workspace_provider_asset_operation(
        &self,
        p: &Principal,
        route: &WorkspaceProviderAssetRoute,
        mutation: WorkspaceProviderAssetMutation,
        idempotency: Uuid,
    ) -> Result<WorkspaceProviderAssetPrepared, StoreError> {
        use niu_media::fastrouter_domain::{
            FastRouterAssetCreate, FastRouterAssetRename, FastRouterGroupCreate,
            FastRouterGroupUpdate, reference_body,
        };
        let mut tx = self.begin_bounded_recording().await?;
        Self::provider_asset_route_check_using(&mut tx, p, route).await?;
        let s = p.scope();
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))")
            .bind(format!(
                "niu-provider-assets:{}:{}",
                s.organization_id, s.project_id
            ))
            .execute(&mut *tx)
            .await?;
        let prior=sqlx::query("SELECT id,request_sha256 FROM workspace_provider_asset_operations WHERE organization_id=$1 AND project_id=$2 AND idempotency_key=$3").bind(s.organization_id).bind(s.project_id).bind(idempotency).fetch_optional(&mut *tx).await?;
        let replay_id = prior.as_ref().map(|v| v.get::<Uuid, _>("id"));
        let replay = if let Some(id) = replay_id {
            Self::provider_operation_using(&mut tx, s, id).await?
        } else {
            None
        };
        let expected_revision = match &mutation {
            WorkspaceProviderAssetMutation::UpdateGroup {
                expected_revision, ..
            }
            | WorkspaceProviderAssetMutation::DeleteGroup {
                expected_revision, ..
            }
            | WorkspaceProviderAssetMutation::RenameAsset {
                expected_revision, ..
            }
            | WorkspaceProviderAssetMutation::DeleteAsset {
                expected_revision, ..
            } => *expected_revision,
            _ => None,
        };
        let mut new_group = false;
        let mut new_asset = false;
        let (action, gid, aid, body, name, description, prior_status) = match mutation {
            WorkspaceProviderAssetMutation::CreateGroup { name, description } => {
                let body = FastRouterGroupCreate {
                    name: name.clone(),
                    description: description.clone(),
                }
                .body()
                .map_err(|_| StoreError::InvalidObservation)?;
                new_group = replay.is_none();
                (
                    "create_group",
                    replay.as_ref().map_or_else(Uuid::new_v4, |v| v.group_id),
                    None,
                    body,
                    Some(name),
                    description,
                    "pending".to_owned(),
                )
            }
            WorkspaceProviderAssetMutation::UpdateGroup {
                group_id,
                name,
                description,
                expected_revision,
            } => {
                let g = Self::provider_group_using(&mut tx, s, group_id, true)
                    .await?
                    .ok_or(StoreError::Conflict)?;
                provider_group_binding(&g, route)?;
                if replay.is_none() {
                    provider_revision(&g.revision, expected_revision)?;
                    if g.status != "ready" {
                        return Err(StoreError::Conflict);
                    }
                }
                let reference = provider_ref(g.private_reference())?;
                let body = FastRouterGroupUpdate {
                    reference: &reference,
                    name: name.clone(),
                    description: description.clone(),
                }
                .body()
                .map_err(|_| StoreError::InvalidObservation)?;
                (
                    "update_group",
                    group_id,
                    None,
                    body,
                    name,
                    description,
                    g.status,
                )
            }
            WorkspaceProviderAssetMutation::DeleteGroup {
                group_id,
                expected_revision,
            } => {
                let g = Self::provider_group_using(&mut tx, s, group_id, true)
                    .await?
                    .ok_or(StoreError::Conflict)?;
                provider_group_binding(&g, route)?;
                if replay.is_none() {
                    provider_revision(&g.revision, expected_revision)?;
                    if g.status != "ready" {
                        return Err(StoreError::Conflict);
                    }
                }
                let reference = provider_ref(g.private_reference())?;
                (
                    "delete_group",
                    group_id,
                    None,
                    reference_body(&reference),
                    None,
                    None,
                    g.status,
                )
            }
            WorkspaceProviderAssetMutation::CreateAsset {
                group_id,
                url,
                name,
                kind,
            } => {
                let g = Self::provider_group_using(&mut tx, s, group_id, true)
                    .await?
                    .ok_or(StoreError::Conflict)?;
                provider_group_binding(&g, route)?;
                if replay.is_none() && g.status != "ready" {
                    return Err(StoreError::Conflict);
                }
                let reference = provider_ref(g.private_reference())?;
                let mut body = FastRouterAssetCreate {
                    group_reference: &reference,
                    url,
                    name: name.clone(),
                    kind,
                }
                .body()
                .map_err(|_| StoreError::InvalidObservation)?;
                body["_niu_kind"] = json!(provider_kind(&kind)?);
                new_asset = replay.is_none();
                (
                    "create_asset",
                    group_id,
                    Some(
                        replay
                            .as_ref()
                            .and_then(|v| v.asset_id)
                            .unwrap_or_else(Uuid::new_v4),
                    ),
                    body,
                    name,
                    None,
                    "pending".to_owned(),
                )
            }
            WorkspaceProviderAssetMutation::RenameAsset {
                asset_id,
                name,
                expected_revision,
            } => {
                let a = Self::provider_asset_using(&mut tx, s, asset_id, true)
                    .await?
                    .ok_or(StoreError::Conflict)?;
                let g = Self::provider_group_using(&mut tx, s, a.group_id, false)
                    .await?
                    .ok_or(StoreError::Conflict)?;
                provider_group_binding(&g, route)?;
                if replay.is_none() {
                    provider_revision(&a.revision, expected_revision)?;
                    if !matches!(a.status.as_str(), "processing" | "active" | "failed")
                        || g.status != "ready"
                    {
                        return Err(StoreError::Conflict);
                    }
                }
                let reference = provider_ref(a.private_reference())?;
                let body = FastRouterAssetRename {
                    reference: &reference,
                    name: name.clone(),
                }
                .body()
                .map_err(|_| StoreError::InvalidObservation)?;
                (
                    "rename_asset",
                    a.group_id,
                    Some(asset_id),
                    body,
                    Some(name),
                    None,
                    a.status,
                )
            }
            WorkspaceProviderAssetMutation::DeleteAsset {
                asset_id,
                expected_revision,
            } => {
                let a = Self::provider_asset_using(&mut tx, s, asset_id, true)
                    .await?
                    .ok_or(StoreError::Conflict)?;
                let g = Self::provider_group_using(&mut tx, s, a.group_id, false)
                    .await?
                    .ok_or(StoreError::Conflict)?;
                provider_group_binding(&g, route)?;
                if replay.is_none() {
                    provider_revision(&a.revision, expected_revision)?;
                    if !matches!(a.status.as_str(), "processing" | "active" | "failed")
                        || g.status != "ready"
                    {
                        return Err(StoreError::Conflict);
                    }
                }
                let reference = provider_ref(a.private_reference())?;
                (
                    "delete_asset",
                    a.group_id,
                    Some(asset_id),
                    reference_body(&reference),
                    None,
                    None,
                    a.status,
                )
            }
        };
        let encoded=serde_json::to_vec(&json!({"action":action,"model":route.model_alias,"expected_revision":expected_revision,"group":if action=="create_group"{None}else{Some(gid)},"asset":if action=="create_asset"{None}else{aid},"body":body})).map_err(|_|StoreError::InvalidObservation)?;
        if encoded.len() > MAX_REQUEST_BYTES {
            return Err(StoreError::InvalidObservation);
        }
        let digest = Sha256::digest(encoded).to_vec();
        if let Some(prior) = prior {
            if prior.get::<Vec<u8>, _>("request_sha256") != digest {
                return Err(StoreError::Conflict);
            }
        } else {
            let busy:bool=sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM workspace_provider_asset_operations WHERE organization_id=$1 AND project_id=$2 AND group_id=$3 AND status IN ('prepared','unknown') AND ($4::uuid IS NULL OR asset_id IS NULL OR asset_id=$4))").bind(s.organization_id).bind(s.project_id).bind(gid).bind(aid).fetch_one(&mut *tx).await?;
            if busy {
                return Err(StoreError::Conflict);
            }
            if new_group {
                let n:i64=sqlx::query_scalar("SELECT count(*) FROM workspace_provider_asset_groups WHERE organization_id=$1 AND project_id=$2 AND status<>'deleted'").bind(s.organization_id).bind(s.project_id).fetch_one(&mut *tx).await?;
                if n >= MAX_GROUPS {
                    return Err(StoreError::Conflict);
                }
                sqlx::query("INSERT INTO workspace_provider_asset_groups(id,organization_id,project_id,vendor_id,vendor_revision,model_alias,model_revision,upstream_model,name,description,kind,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'generated','pending')").bind(gid).bind(s.organization_id).bind(s.project_id).bind(route.vendor_id).bind(route.vendor_revision).bind(&route.model_alias).bind(route.model_revision).bind(&route.upstream_model).bind(&name).bind(&description).execute(&mut *tx).await?;
            }
            if new_asset {
                let n:i64=sqlx::query_scalar("SELECT count(*) FROM workspace_provider_assets WHERE organization_id=$1 AND project_id=$2 AND status<>'deleted'").bind(s.organization_id).bind(s.project_id).fetch_one(&mut *tx).await?;
                if n >= MAX_ASSETS {
                    return Err(StoreError::Conflict);
                }
                sqlx::query("INSERT INTO workspace_provider_assets(id,organization_id,project_id,group_id,name,kind,status) VALUES($1,$2,$3,$4,$5,$6,'pending')").bind(aid).bind(s.organization_id).bind(s.project_id).bind(gid).bind(&name).bind(body["_niu_kind"].as_str().ok_or(StoreError::InvalidObservation)?).execute(&mut *tx).await?;
            }
            sqlx::query("INSERT INTO workspace_provider_asset_operations(id,organization_id,project_id,key_id,group_id,asset_id,idempotency_key,request_sha256,action,prior_status,requested_name,requested_description) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)").bind(Uuid::new_v4()).bind(s.organization_id).bind(s.project_id).bind(p.key_id()).bind(gid).bind(aid).bind(idempotency).bind(&digest).bind(action).bind(prior_status).bind(name).bind(description).execute(&mut *tx).await?;
        }
        let opid:Uuid=sqlx::query_scalar("SELECT id FROM workspace_provider_asset_operations WHERE organization_id=$1 AND project_id=$2 AND idempotency_key=$3").bind(s.organization_id).bind(s.project_id).bind(idempotency).fetch_one(&mut *tx).await?;
        let operation = Self::provider_operation_using(&mut tx, s, opid)
            .await?
            .ok_or(StoreError::Conflict)?;
        let group = Self::provider_group_using(&mut tx, s, gid, false).await?;
        let asset = if let Some(id) = aid {
            Self::provider_asset_using(&mut tx, s, id, false).await?
        } else {
            None
        };
        let mut body = body;
        if let Some(o) = body.as_object_mut() {
            o.remove("_niu_kind");
        }
        tx.commit().await?;
        Ok(WorkspaceProviderAssetPrepared {
            operation,
            group,
            asset,
            body,
        })
    }
    pub async fn claim_workspace_provider_asset_operation(
        &self,
        p: &Principal,
        id: Uuid,
        route: &WorkspaceProviderAssetRoute,
    ) -> Result<bool, StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        Self::provider_asset_route_check_using(&mut tx, p, route).await?;
        let s = p.scope();
        let op = Self::provider_operation_using(&mut tx, s, id)
            .await?
            .ok_or(StoreError::Conflict)?;
        let g = Self::provider_group_using(&mut tx, s, op.group_id, true)
            .await?
            .ok_or(StoreError::Conflict)?;
        provider_group_binding(&g, route)?;
        let claimed=sqlx::query("UPDATE workspace_provider_asset_operations SET status='unknown',updated_at=now() WHERE id=$1 AND organization_id=$2 AND project_id=$3 AND key_id=$4 AND status='prepared'").bind(id).bind(s.organization_id).bind(s.project_id).bind(p.key_id()).execute(&mut *tx).await?.rows_affected()==1;
        if claimed {
            if let Some(a) = op.asset_id {
                sqlx::query("UPDATE workspace_provider_assets SET status='unknown',updated_at=now() WHERE id=$1").bind(a).execute(&mut *tx).await?;
            } else {
                sqlx::query("UPDATE workspace_provider_asset_groups SET status='unknown',updated_at=now() WHERE id=$1").bind(op.group_id).execute(&mut *tx).await?;
            }
        }
        tx.commit().await?;
        Ok(claimed)
    }
}
impl Store {
    pub async fn record_workspace_provider_asset_outcome(
        &self,
        s: TenantScope,
        id: Uuid,
        outcome: WorkspaceProviderAssetOutcome,
    ) -> Result<(), StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        // All mutation completion uses the same group-first lock order as prepare.
        let op = Self::provider_operation_using(&mut tx, s, id)
            .await?
            .ok_or(StoreError::Conflict)?;
        Self::provider_group_using(&mut tx, s, op.group_id, true)
            .await?
            .ok_or(StoreError::Conflict)?;
        let row=sqlx::query("SELECT status,prior_status,requested_name,requested_description FROM workspace_provider_asset_operations WHERE id=$1 AND organization_id=$2 AND project_id=$3 FOR UPDATE").bind(id).bind(s.organization_id).bind(s.project_id).fetch_one(&mut *tx).await?;
        if row.get::<String, _>("status") != "unknown" {
            return Err(StoreError::Conflict);
        }
        let prior: String = row.get("prior_status");
        let name: Option<String> = row.get("requested_name");
        let description: Option<String> = row.get("requested_description");
        let (status, http, request) = match outcome {
            WorkspaceProviderAssetOutcome::Unknown {
                http_status,
                request_id,
            } => {
                // Request identifiers are diagnostics, never arbitrary upstream prose.
                let request = request_id.filter(|v| {
                    !v.is_empty()
                        && v.len() <= 256
                        && v.bytes()
                            .all(|b| b.is_ascii_alphanumeric() || b"-_.:".contains(&b))
                });
                (
                    "unknown",
                    http_status
                        .filter(|v| (100..=599).contains(v))
                        .map(i32::from),
                    request,
                )
            }
            WorkspaceProviderAssetOutcome::NotDispatched => {
                let restored = if op.action.starts_with("create_") {
                    "failed"
                } else {
                    prior.as_str()
                };
                if let Some(a) = op.asset_id {
                    sqlx::query("UPDATE workspace_provider_assets SET status=$2,revision=revision+1,updated_at=now() WHERE id=$1").bind(a).bind(restored).execute(&mut *tx).await?;
                } else {
                    sqlx::query("UPDATE workspace_provider_asset_groups SET status=$2,revision=revision+1,updated_at=now() WHERE id=$1").bind(op.group_id).bind(restored).execute(&mut *tx).await?;
                }
                ("not_sent", None, None)
            }
            WorkspaceProviderAssetOutcome::Acknowledged { provider_reference } => {
                let reference = provider_reference.as_ref().map(|v| v.private_ref());
                match op.action.as_str() {
                    "create_group" => {
                        let reference = reference.ok_or(StoreError::InvalidObservation)?;
                        sqlx::query("UPDATE workspace_provider_asset_groups SET provider_ref=$2,status='ready',revision=revision+1,updated_at=now() WHERE id=$1 AND provider_ref IS NULL").bind(op.group_id).bind(reference).execute(&mut *tx).await?;
                    }
                    "create_asset" => {
                        let reference = reference.ok_or(StoreError::InvalidObservation)?;
                        sqlx::query("UPDATE workspace_provider_assets SET provider_ref=$2,status='processing',revision=revision+1,updated_at=now() WHERE id=$1 AND provider_ref IS NULL").bind(op.asset_id).bind(reference).execute(&mut *tx).await?;
                    }
                    "update_group" => {
                        sqlx::query("UPDATE workspace_provider_asset_groups SET name=COALESCE($2,name),description=COALESCE($3,description),status='ready',revision=revision+1,updated_at=now() WHERE id=$1").bind(op.group_id).bind(name).bind(description).execute(&mut *tx).await?;
                    }
                    "delete_group" => {
                        sqlx::query("UPDATE workspace_provider_assets SET status='deleted',revision=revision+1,updated_at=now() WHERE group_id=$1 AND status<>'deleted'").bind(op.group_id).execute(&mut *tx).await?;
                        sqlx::query("UPDATE workspace_provider_asset_groups SET status='deleted',revision=revision+1,updated_at=now() WHERE id=$1").bind(op.group_id).execute(&mut *tx).await?;
                    }
                    "rename_asset" => {
                        sqlx::query("UPDATE workspace_provider_assets SET name=$2,status=$3,revision=revision+1,updated_at=now() WHERE id=$1").bind(op.asset_id).bind(name).bind(prior).execute(&mut *tx).await?;
                    }
                    "delete_asset" => {
                        sqlx::query("UPDATE workspace_provider_assets SET status='deleted',revision=revision+1,updated_at=now() WHERE id=$1").bind(op.asset_id).execute(&mut *tx).await?;
                    }
                    _ => return Err(StoreError::InvalidObservation),
                }
                ("acknowledged", None, None)
            }
        };
        sqlx::query("UPDATE workspace_provider_asset_operations SET status=$2,http_status=$3,request_id=$4,updated_at=now() WHERE id=$1").bind(id).bind(status).bind(http).bind(request).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(())
    }
    pub async fn observe_workspace_provider_asset_group(
        &self,
        p: &Principal,
        id: Uuid,
        route: &WorkspaceProviderAssetRoute,
        observed: &FastRouterGroup,
    ) -> Result<WorkspaceProviderAssetGroup, StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        Self::provider_asset_route_check_using(&mut tx, p, route).await?;
        let s = p.scope();
        let g = Self::provider_group_using(&mut tx, s, id, true)
            .await?
            .ok_or(StoreError::Conflict)?;
        provider_group_binding(&g, route)?;
        if g.status == "deleted"
            || g.private_reference() != Some(observed.private_reference().private_ref())
            || g.kind != provider_kind(&observed.kind)?
        {
            return Err(StoreError::Conflict);
        }
        // An observation is not proof that an uncertain write never executed. Keep
        // its unresolved operation and externally visible unknown state intact.
        if g.status != "unknown" {
            sqlx::query("UPDATE workspace_provider_asset_groups SET name=COALESCE($2,name),description=$3,status='ready',revision=revision+1,updated_at=now() WHERE id=$1").bind(id).bind(&observed.name).bind(&observed.description).execute(&mut *tx).await?;
        }
        let v = Self::provider_group_using(&mut tx, s, id, false)
            .await?
            .ok_or(StoreError::Conflict)?;
        tx.commit().await?;
        Ok(v)
    }
    pub async fn observe_workspace_provider_asset(
        &self,
        p: &Principal,
        id: Uuid,
        route: &WorkspaceProviderAssetRoute,
        observed: &FastRouterAsset,
    ) -> Result<WorkspaceProviderAsset, StoreError> {
        let mut tx = self.begin_bounded_recording().await?;
        Self::provider_asset_route_check_using(&mut tx, p, route).await?;
        let s = p.scope();
        let a = Self::provider_asset_using(&mut tx, s, id, true)
            .await?
            .ok_or(StoreError::Conflict)?;
        let g = Self::provider_group_using(&mut tx, s, a.group_id, false)
            .await?
            .ok_or(StoreError::Conflict)?;
        provider_group_binding(&g, route)?;
        if a.status == "deleted"
            || g.status == "deleted"
            || a.private_reference() != Some(observed.private_reference().private_ref())
            || g.private_reference() != Some(observed.private_group_reference().private_ref())
            || a.kind != provider_kind(&observed.kind)?
        {
            return Err(StoreError::Conflict);
        }
        if a.status != "unknown" {
            sqlx::query("UPDATE workspace_provider_assets SET name=COALESCE($2,name),status=$3,revision=revision+1,updated_at=now() WHERE id=$1").bind(id).bind(&observed.name).bind(provider_kind(&observed.status)?).execute(&mut *tx).await?;
        }
        let v = Self::provider_asset_using(&mut tx, s, id, false)
            .await?
            .ok_or(StoreError::Conflict)?;
        tx.commit().await?;
        Ok(v)
    }
}
