//! Atomic durable-image identity checks and immutable video dispatch bindings.
use crate::{GuardrailSnapshot, ImageRequestApproval, Principal, Store, StoreError};
use base64::{Engine, engine::general_purpose::STANDARD};
use niu_media::ValidatedVideoRequest;
use sha2::{Digest, Sha256};
use sqlx::Row;
use uuid::Uuid;

/// Internal reference obtained from an authorized library read, never client proof.
pub struct WorkspaceAssetVideoReference {
    pub position: usize,
    pub asset_id: Uuid,
    pub content_sha256: String,
    pub observed_revision: i64,
}
/// Validated inline transport and fresh inspection approvals for saved images.
pub struct WorkspaceAssetVideoDispatch<'a> {
    pub snapshot: &'a GuardrailSnapshot,
    pub request: &'a ValidatedVideoRequest,
    pub approvals: &'a [ImageRequestApproval<'a>],
    pub assets: &'a [WorkspaceAssetVideoReference],
}
impl Store {
    /// Checks library deletion, image identity, inspection and dispatch in one
    /// bounded transaction. No network operation runs while locks are held.
    /// A failed or ambiguous commit must never be retried as a new submission.
    pub async fn mark_workspace_asset_video_dispatched(
        &self,
        principal: &Principal,
        attempt: Uuid,
        dispatch: WorkspaceAssetVideoDispatch<'_>,
    ) -> Result<(), StoreError> {
        let content = dispatch.request.body()["content"]
            .as_array()
            .ok_or(StoreError::InvalidObservation)?;
        if dispatch.assets.is_empty() || dispatch.assets.len() > 32 || content.len() > 32 {
            return Err(StoreError::InvalidObservation);
        }
        let mut positions = std::collections::BTreeSet::new();
        let mut decoded = Vec::with_capacity(dispatch.assets.len());
        for asset in dispatch.assets {
            if !positions.insert(asset.position) || asset.observed_revision < 1 {
                return Err(StoreError::InvalidObservation);
            }
            let item = content
                .get(asset.position)
                .ok_or(StoreError::InvalidObservation)?;
            if item["type"] != "image_url" {
                return Err(StoreError::InvalidObservation);
            }
            let url = item["image_url"]["url"]
                .as_str()
                .ok_or(StoreError::InvalidObservation)?;
            let (prefix, encoded) = url.split_once(',').ok_or(StoreError::InvalidObservation)?;
            let mime = prefix
                .strip_prefix("data:")
                .and_then(|v| v.strip_suffix(";base64"))
                .filter(|v| matches!(*v, "image/png" | "image/jpeg" | "image/webp"))
                .ok_or(StoreError::InvalidObservation)?;
            // Bound before allocation as well as after decoding.
            if encoded.len() > 11_184_812 {
                return Err(StoreError::InvalidObservation);
            }
            let bytes = STANDARD
                .decode(encoded)
                .map_err(|_| StoreError::InvalidObservation)?;
            if bytes.is_empty()
                || bytes.len() > 8_388_608
                || format!("{:x}", Sha256::digest(&bytes)) != asset.content_sha256
            {
                return Err(StoreError::InvalidObservation);
            }
            decoded.push((asset, mime, bytes.len() as i64));
        }
        let body_sha256 = dispatch.request.body_sha256();
        let scope = principal.scope();
        let mut tx = self.begin_bounded_recording().await?;
        // Match existing policy/key/attempt lock order before library locks.
        if dispatch.approvals.is_empty() {
            // Absence of receipts is valid only when the locked current policy
            // positively requires no image detectors. Never waive a requirement.
            if !Self::authorize_image_request_using(
                &mut tx,
                principal,
                attempt,
                dispatch.snapshot,
                dispatch.request,
            )
            .await?
            .is_empty()
            {
                return Err(StoreError::Conflict);
            }
            let mut image_positions = Vec::new();
            for (position, item) in content.iter().enumerate() {
                match item["type"].as_str() {
                    Some("text") => {}
                    Some("image_url")
                        if item["image_url"]["url"]
                            .as_str()
                            .is_some_and(|url| url.starts_with("data:image/")) =>
                    {
                        image_positions.push(position as i32);
                    }
                    _ => return Err(StoreError::InvalidObservation),
                }
            }
            // This is immutable exact-request metadata, not an inspection receipt.
            // The existing prepared-route trigger validates the same policy epoch.
            sqlx::query("INSERT INTO image_request_bindings(organization_id,project_id,key_id,attempt_id,body_sha256,schema_revision,image_positions,workspace_revision,key_policy_revision,key_assignment_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)")
                .bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).bind(attempt)
                .bind(&body_sha256).bind(dispatch.request.schema_revision()).bind(image_positions)
                .bind(dispatch.snapshot.workspace_revision).bind(dispatch.snapshot.key_policy_revision)
                .bind(dispatch.snapshot.key_assignment_revision).execute(&mut *tx).await?;
        } else {
            Self::bind_image_request_using(
                &mut tx,
                principal,
                attempt,
                dispatch.snapshot,
                dispatch.request,
                dispatch.approvals,
                false,
            )
            .await?;
        }
        decoded.sort_by_key(|(asset, _, _)| (asset.asset_id, asset.position));
        for (asset, mime, byte_length) in decoded {
            let row = sqlx::query("SELECT a.content_sha256,a.byte_length,a.content_type,a.revision FROM workspace_asset_library a JOIN workspace_asset_library_content c ON c.asset_id=a.id WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=$3 AND a.deleted_at IS NULL AND a.media_kind='image' FOR SHARE OF a,c")
                .bind(scope.organization_id).bind(scope.project_id).bind(asset.asset_id)
                .fetch_optional(&mut *tx).await?.ok_or(StoreError::Conflict)?;
            if row.get::<String, _>("content_sha256") != asset.content_sha256
                || row.get::<i64, _>("byte_length") != byte_length
                || row.get::<String, _>("content_type") != mime
                || row.get::<i64, _>("revision") < asset.observed_revision
            {
                return Err(StoreError::Conflict);
            }
            sqlx::query("INSERT INTO workspace_asset_video_request_bindings(organization_id,project_id,key_id,attempt_id,content_position,asset_id,content_sha256,observed_revision,body_sha256,schema_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)")
                .bind(scope.organization_id).bind(scope.project_id).bind(principal.key_id()).bind(attempt)
                .bind(asset.position as i32).bind(asset.asset_id).bind(&asset.content_sha256)
                .bind(asset.observed_revision).bind(&body_sha256).bind(dispatch.request.schema_revision())
                .execute(&mut *tx).await?;
        }
        if !Self::mark_dispatched_using(&mut tx, principal, attempt).await? {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }
}
