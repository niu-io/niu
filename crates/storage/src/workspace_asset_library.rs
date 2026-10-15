//! Durable workspace-owned media bytes, separate from inspection and upstream grants.
//! Lists contain metadata only. Deletion erases bytes and prevents new references;
//! it does not cancel already dispatched work or erase its financial liability.
use crate::{Store, StoreError, TenantScope};
use serde::Serialize;
use sha2::{Digest, Sha256};
use sqlx::{PgConnection, Row};
use uuid::Uuid;

const MAX_ASSET_BYTES: u64 = 8 * 1024 * 1024;
const MAX_WORKSPACE_BYTES: u64 = 256 * 1024 * 1024;
const MAX_WORKSPACE_ASSETS: u32 = 256;
const COLUMNS: &str = "id,name,media_kind AS kind,content_type,content_sha256,byte_length,revision,floor(extract(epoch FROM created_at)*1000)::bigint AS created_at_ms,floor(extract(epoch FROM updated_at)*1000)::bigint AS updated_at_ms";

#[derive(Clone, Copy, serde::Deserialize, Serialize, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AssetLibraryKind {
    Image,
    Video,
    Audio,
}
impl AssetLibraryKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Image => "image",
            Self::Video => "video",
            Self::Audio => "audio",
        }
    }
    pub fn for_content_type(content_type: &str) -> Option<Self> {
        match content_type {
            "image/png" | "image/jpeg" | "image/webp" => Some(Self::Image),
            "video/mp4" | "video/webm" => Some(Self::Video),
            "audio/wav" | "audio/mpeg" | "audio/ogg" => Some(Self::Audio),
            _ => None,
        }
    }
}
#[derive(Clone, Copy)]
pub struct AssetLibraryLimits {
    pub max_asset_bytes: u64,
    pub max_workspace_bytes: u64,
    pub max_workspace_assets: u32,
}
impl Default for AssetLibraryLimits {
    fn default() -> Self {
        Self {
            max_asset_bytes: MAX_ASSET_BYTES,
            max_workspace_bytes: MAX_WORKSPACE_BYTES,
            max_workspace_assets: MAX_WORKSPACE_ASSETS,
        }
    }
}
pub struct AssetLibraryCreate<'a> {
    pub id: Uuid,
    pub name: &'a str,
    pub kind: AssetLibraryKind,
    pub content_type: &'a str,
    pub bytes: &'a [u8],
    /// Derived by authenticated Gateway authorization, never an upload field.
    pub actor: &'a str,
}
#[derive(Serialize)]
pub struct AssetLibraryAsset {
    pub id: Uuid,
    pub name: String,
    pub media_kind: AssetLibraryKind,
    pub content_type: String,
    pub content_sha256: String,
    pub byte_length: i64,
    pub revision: String,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
}
#[derive(Serialize)]
pub struct AssetLibraryPage {
    pub data: Vec<AssetLibraryAsset>,
    pub next_cursor: Option<Uuid>,
}
/// Private material only. No Debug/Serialize, and no credentials or Provider URI.
pub struct AssetLibraryContent {
    pub asset: AssetLibraryAsset,
    pub ciphertext: Vec<u8>,
    pub aad: Vec<u8>,
}
/// Identity-based associated data is reused verbatim by startup audit and rotation.
pub fn workspace_asset_content_aad(scope: TenantScope, id: Uuid) -> Vec<u8> {
    format!(
        "niu:workspace-asset-library:v1\0{}\0{}\0{}",
        scope.organization_id, scope.project_id, id
    )
    .into_bytes()
}
pub(crate) struct PreparedWorkspaceAssetCreate {
    name: String,
    digest: String,
    ciphertext: Vec<u8>,
}
#[derive(sqlx::FromRow)]
struct AssetRow {
    id: Uuid,
    name: String,
    kind: String,
    content_type: String,
    content_sha256: String,
    byte_length: i64,
    revision: i64,
    created_at_ms: i64,
    updated_at_ms: i64,
}
impl AssetRow {
    fn into_asset(self) -> Result<AssetLibraryAsset, StoreError> {
        let media_kind = AssetLibraryKind::for_content_type(&self.content_type)
            .filter(|kind| kind.as_str() == self.kind)
            .ok_or(StoreError::InvalidObservation)?;
        Ok(AssetLibraryAsset {
            id: self.id,
            name: self.name,
            media_kind,
            content_type: self.content_type,
            content_sha256: self.content_sha256,
            byte_length: self.byte_length,
            revision: self.revision.to_string(),
            created_at_ms: self.created_at_ms,
            updated_at_ms: self.updated_at_ms,
        })
    }
}
fn checked_name(name: &str) -> Result<&str, StoreError> {
    let name = name.trim();
    if name.is_empty() || name.len() > 200 || name.chars().any(char::is_control) {
        return Err(StoreError::InvalidObservation);
    }
    Ok(name)
}
fn checked_actor(actor: &str) -> Result<(), StoreError> {
    if actor.is_empty() || actor.len() > 200 || actor.chars().any(char::is_control) {
        return Err(StoreError::InvalidObservation);
    }
    Ok(())
}
impl Store {
    /// The Gateway authorizes member Read/Write before calling scoped methods.
    /// Bytes are immutable, quota is serialized, and metadata/content/audit commit
    /// together. Local storage is not a detector verdict or Provider entitlement.
    pub async fn create_workspace_asset<F>(
        &self,
        scope: TenantScope,
        input: AssetLibraryCreate<'_>,
        limits: AssetLibraryLimits,
        seal: F,
    ) -> Result<AssetLibraryAsset, StoreError>
    where
        F: FnOnce(&[u8], &[u8]) -> Result<Vec<u8>, StoreError>,
    {
        let prepared = tokio::task::block_in_place(|| {
            Self::prepare_workspace_asset_create(scope, &input, limits, seal)
        })?;
        let mut tx = self.begin_bounded_recording().await?;
        let asset =
            Self::insert_prepared_workspace_asset_in_tx(&mut tx, scope, &input, limits, prepared)
                .await?;
        tx.commit().await?;
        Ok(asset)
    }

    pub(crate) fn prepare_workspace_asset_create<F>(
        scope: TenantScope,
        input: &AssetLibraryCreate<'_>,
        limits: AssetLibraryLimits,
        seal: F,
    ) -> Result<PreparedWorkspaceAssetCreate, StoreError>
    where
        F: FnOnce(&[u8], &[u8]) -> Result<Vec<u8>, StoreError>,
    {
        let name = checked_name(input.name)?.to_owned();
        checked_actor(input.actor)?;
        if limits.max_asset_bytes == 0
            || limits.max_asset_bytes > MAX_ASSET_BYTES
            || limits.max_workspace_bytes < limits.max_asset_bytes
            || limits.max_workspace_bytes > MAX_WORKSPACE_BYTES
            || limits.max_workspace_assets == 0
            || limits.max_workspace_assets > MAX_WORKSPACE_ASSETS
            || input.bytes.is_empty()
            || input.bytes.len() as u64 > limits.max_asset_bytes
            || AssetLibraryKind::for_content_type(input.content_type) != Some(input.kind)
        {
            return Err(StoreError::InvalidObservation);
        }
        let digest = format!("{:x}", Sha256::digest(input.bytes));
        let aad = workspace_asset_content_aad(scope, input.id);
        let ciphertext = seal(&aad, input.bytes)?;
        if ciphertext.len() < input.bytes.len() + 28 || ciphertext.len() > input.bytes.len() + 128 {
            return Err(StoreError::InvalidObservation);
        }
        Ok(PreparedWorkspaceAssetCreate {
            name,
            digest,
            ciphertext,
        })
    }

    pub(crate) async fn insert_prepared_workspace_asset_in_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        scope: TenantScope,
        input: &AssetLibraryCreate<'_>,
        limits: AssetLibraryLimits,
        prepared: PreparedWorkspaceAssetCreate,
    ) -> Result<AssetLibraryAsset, StoreError> {
        sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended('niu:workspace-asset-library:'||$1::text||':'||$2::text,0))")
            .bind(scope.organization_id).bind(scope.project_id).execute(&mut **tx).await?;
        let present: Option<Uuid> = sqlx::query_scalar(
            "SELECT id FROM projects WHERE organization_id=$1 AND id=$2 FOR SHARE",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .fetch_optional(&mut **tx)
        .await?;
        if present.is_none() {
            return Err(StoreError::Conflict);
        }
        let (count,bytes):(i64,i64)=sqlx::query_as("SELECT count(*),COALESCE(sum(byte_length),0)::bigint FROM workspace_asset_library WHERE organization_id=$1 AND project_id=$2 AND deleted_at IS NULL")
            .bind(scope.organization_id).bind(scope.project_id).fetch_one(&mut **tx).await?;
        if count >= i64::from(limits.max_workspace_assets)
            || bytes as u64 > limits.max_workspace_bytes - input.bytes.len() as u64
        {
            return Err(StoreError::AssetLibraryCapacityExceeded);
        }
        let insert_sql = format!(
            "INSERT INTO workspace_asset_library(id,organization_id,project_id,name,media_kind,content_type,content_sha256,byte_length) \
             VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(id) DO NOTHING RETURNING {COLUMNS}"
        );
        let row = sqlx::query_as::<_, AssetRow>(&insert_sql)
            .bind(input.id)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(&prepared.name)
            .bind(input.kind.as_str())
            .bind(input.content_type)
            .bind(&prepared.digest)
            .bind(input.bytes.len() as i64)
            .fetch_optional(&mut **tx)
            .await?
            .ok_or(StoreError::Conflict)?;
        sqlx::query(
            "INSERT INTO workspace_asset_library_content(asset_id,ciphertext) VALUES($1,$2)",
        )
        .bind(input.id)
        .bind(prepared.ciphertext)
        .execute(&mut **tx)
        .await?;
        sqlx::query("INSERT INTO workspace_asset_library_events(asset_id,revision,actor,operation,name) VALUES($1,1,$2,'created',$3)")
            .bind(input.id).bind(input.actor).bind(&prepared.name).execute(&mut **tx).await?;
        row.into_asset()
    }

    /// Cursor lookup is scoped and kind-filtered before use. Rename cannot move
    /// stable creation order; deleted/foreign cursors fail instead of leaking it.
    pub async fn list_workspace_assets(
        &self,
        scope: TenantScope,
        kind: Option<AssetLibraryKind>,
        after: Option<Uuid>,
        limit: i64,
    ) -> Result<AssetLibraryPage, StoreError> {
        if !(1..=100).contains(&limit) {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let cursor: Option<(String, Uuid)> = if let Some(id) = after {
            Some(sqlx::query_as("SELECT created_at::text,id FROM workspace_asset_library WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND deleted_at IS NULL AND ($4::text IS NULL OR media_kind=$4)")
                .bind(scope.organization_id).bind(scope.project_id).bind(id).bind(kind.map(AssetLibraryKind::as_str)).fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?)
        } else {
            None
        };
        let sql = format!(
            "SELECT {COLUMNS} FROM workspace_asset_library WHERE organization_id=$1 AND project_id=$2 AND deleted_at IS NULL AND ($3::text IS NULL OR media_kind=$3) AND ($4::timestamptz IS NULL OR (created_at,id)>($4::timestamptz,$5::uuid)) ORDER BY created_at,id LIMIT $6"
        );
        let mut rows = sqlx::query_as::<_, AssetRow>(&sql)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(kind.map(AssetLibraryKind::as_str))
            .bind(cursor.as_ref().map(|c| &c.0))
            .bind(cursor.as_ref().map(|c| c.1))
            .bind(limit + 1)
            .fetch_all(&mut *tx)
            .await?;
        let next_cursor = if rows.len() > limit as usize {
            rows.truncate(limit as usize);
            rows.last().map(|row| row.id)
        } else {
            None
        };
        let data = rows
            .into_iter()
            .map(AssetRow::into_asset)
            .collect::<Result<_, _>>()?;
        tx.commit().await?;
        Ok(AssetLibraryPage { data, next_cursor })
    }

    pub async fn workspace_asset(
        &self,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<Option<AssetLibraryAsset>, StoreError> {
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let asset = Self::workspace_asset_using(&mut tx, scope, id).await?;
        tx.commit().await?;
        Ok(asset)
    }

    pub async fn workspace_assets_by_ids(
        &self,
        scope: TenantScope,
        ids: &[Uuid],
    ) -> Result<std::collections::HashMap<Uuid, AssetLibraryAsset>, StoreError> {
        if ids.is_empty() {
            return Ok(std::collections::HashMap::new());
        }
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let sql = format!(
            "SELECT {COLUMNS} FROM workspace_asset_library WHERE organization_id=$1 AND project_id=$2 AND id=ANY($3) AND deleted_at IS NULL"
        );
        let rows = sqlx::query_as::<_, AssetRow>(&sql)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(ids)
            .fetch_all(&mut *tx)
            .await?;
        tx.commit().await?;
        let mut map = std::collections::HashMap::with_capacity(rows.len());
        for row in rows {
            let asset = row.into_asset()?;
            map.insert(asset.id, asset);
        }
        Ok(map)
    }
    async fn workspace_asset_using(
        connection: &mut PgConnection,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<Option<AssetLibraryAsset>, StoreError> {
        let sql = format!(
            "SELECT {COLUMNS} FROM workspace_asset_library WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND deleted_at IS NULL"
        );
        sqlx::query_as::<_, AssetRow>(&sql)
            .bind(scope.organization_id)
            .bind(scope.project_id)
            .bind(id)
            .fetch_optional(connection)
            .await?
            .map(AssetRow::into_asset)
            .transpose()
    }

    /// Metadata and ciphertext are read from one snapshot. Caller must decrypt
    /// with this AAD and independently check the stored length/hash before HTTP.
    pub async fn workspace_asset_content(
        &self,
        scope: TenantScope,
        id: Uuid,
    ) -> Result<Option<AssetLibraryContent>, StoreError> {
        let mut tx = self.begin_bounded_read_snapshot().await?;
        let Some(asset) = Self::workspace_asset_using(&mut tx, scope, id).await? else {
            tx.commit().await?;
            return Ok(None);
        };
        let ciphertext: Option<Vec<u8>> = sqlx::query_scalar(
            "SELECT ciphertext FROM workspace_asset_library_content WHERE asset_id=$1",
        )
        .bind(id)
        .fetch_optional(&mut *tx)
        .await?;
        tx.commit().await?;
        Ok(ciphertext.map(|ciphertext| AssetLibraryContent {
            asset,
            ciphertext,
            aad: workspace_asset_content_aad(scope, id),
        }))
    }

    pub async fn rename_workspace_asset(
        &self,
        scope: TenantScope,
        id: Uuid,
        name: &str,
        expected_revision: i64,
        actor: &str,
    ) -> Result<Option<AssetLibraryAsset>, StoreError> {
        let name = checked_name(name)?;
        checked_actor(actor)?;
        if expected_revision < 1 {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.begin_bounded_recording().await?;
        let row:Option<(i64,String)>=sqlx::query_as("SELECT revision,name FROM workspace_asset_library WHERE organization_id=$1 AND project_id=$2 AND id=$3 AND deleted_at IS NULL FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&mut *tx).await?;
        let Some((revision, old_name)) = row else {
            return Ok(None);
        };
        if revision != expected_revision {
            return Err(StoreError::Conflict);
        }
        if old_name != name {
            sqlx::query("UPDATE workspace_asset_library SET name=$4,revision=revision+1,updated_at=clock_timestamp() WHERE organization_id=$1 AND project_id=$2 AND id=$3")
                .bind(scope.organization_id).bind(scope.project_id).bind(id).bind(name).execute(&mut *tx).await?;
            sqlx::query("INSERT INTO workspace_asset_library_events(asset_id,revision,actor,operation,name) VALUES($1,$2,$3,'renamed',$4)")
                .bind(id).bind(revision+1).bind(actor).bind(name).execute(&mut *tx).await?;
        }
        let asset = Self::workspace_asset_using(&mut tx, scope, id)
            .await?
            .ok_or(StoreError::Conflict)?;
        tx.commit().await?;
        Ok(Some(asset))
    }

    /// Mark deleted before erasing encrypted content in the same transaction.
    /// Repeated deletion is successful without another revision/audit event.
    pub async fn delete_workspace_asset(
        &self,
        scope: TenantScope,
        id: Uuid,
        expected_revision: Option<i64>,
        actor: &str,
    ) -> Result<bool, StoreError> {
        checked_actor(actor)?;
        if expected_revision.is_some_and(|r| r < 1) {
            return Err(StoreError::InvalidObservation);
        }
        let mut tx = self.begin_bounded_recording().await?;
        let row=sqlx::query("SELECT revision,name,deleted_at IS NOT NULL AS deleted FROM workspace_asset_library WHERE organization_id=$1 AND project_id=$2 AND id=$3 FOR UPDATE")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).fetch_optional(&mut *tx).await?;
        let Some(row) = row else { return Ok(false) };
        if row.get::<bool, _>("deleted") {
            tx.commit().await?;
            return Ok(true);
        }
        let revision: i64 = row.get("revision");
        if expected_revision.is_some_and(|r| r != revision) {
            return Err(StoreError::Conflict);
        }
        sqlx::query("UPDATE workspace_asset_library SET deleted_at=clock_timestamp(),updated_at=clock_timestamp(),revision=revision+1 WHERE organization_id=$1 AND project_id=$2 AND id=$3")
            .bind(scope.organization_id).bind(scope.project_id).bind(id).execute(&mut *tx).await?;
        sqlx::query("DELETE FROM workspace_asset_library_content WHERE asset_id=$1")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        sqlx::query("INSERT INTO workspace_asset_library_events(asset_id,revision,actor,operation,name) VALUES($1,$2,$3,'deleted',$4)")
            .bind(id).bind(revision+1).bind(actor).bind(row.get::<String,_>("name")).execute(&mut *tx).await?;
        tx.commit().await?;
        Ok(true)
    }
}
