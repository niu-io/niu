//! Atomic durable-image identity checks and immutable video dispatch bindings.
use crate::{GuardrailSnapshot, ImageRequestApproval, Principal, Store, StoreError};
use base64::{Engine, engine::general_purpose::STANDARD};
use niu_media::ValidatedVideoRequest;
use sha2::{Digest, Sha256};
use sqlx::Row;
use std::collections::{BTreeSet, HashMap};
use std::sync::{Arc, LazyLock};
use tokio::sync::Semaphore;
use uuid::Uuid;

static ASSET_HASH_WORKERS: LazyLock<Arc<Semaphore>> = LazyLock::new(|| Arc::new(Semaphore::new(4)));

fn decode_and_hash_base64_bounded(
    encoded: &str,
    max_decoded_bytes: usize,
) -> Result<(String, i64), StoreError> {
    let raw = encoded.as_bytes();
    if raw.is_empty() || !raw.len().is_multiple_of(4) {
        return Err(StoreError::InvalidObservation);
    }
    let mut hasher = Sha256::new();
    let mut total_decoded = 0usize;
    let mut buf = [0u8; 49_152];
    let mut offset = 0usize;
    while offset < raw.len() {
        let end = (offset + 65_536).min(raw.len());
        let chunk = &raw[offset..end];
        if end < raw.len() && chunk.ends_with(b"=") {
            return Err(StoreError::InvalidObservation);
        }
        let n = STANDARD
            .decode_slice(chunk, &mut buf)
            .map_err(|_| StoreError::InvalidObservation)?;
        total_decoded = total_decoded
            .checked_add(n)
            .ok_or(StoreError::InvalidObservation)?;
        if total_decoded > max_decoded_bytes {
            return Err(StoreError::InvalidObservation);
        }
        hasher.update(&buf[..n]);
        offset = end;
    }
    if total_decoded == 0 {
        return Err(StoreError::InvalidObservation);
    }
    Ok((format!("{:x}", hasher.finalize()), total_decoded as i64))
}

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
        let mut positions = BTreeSet::new();
        let mut pending_assets = Vec::with_capacity(dispatch.assets.len());
        let mut total_encoded_bytes = 0usize;
        for (idx, asset) in dispatch.assets.iter().enumerate() {
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
            total_encoded_bytes = total_encoded_bytes.saturating_add(encoded.len());
            pending_assets.push((idx, mime, encoded));
        }

        let sizes: Vec<i64> = if total_encoded_bytes >= 64 * 1024 {
            let owned_inputs: Vec<(String, String)> = pending_assets
                .iter()
                .map(|&(idx, _, encoded)| {
                    (
                        encoded.to_owned(),
                        dispatch.assets[idx].content_sha256.clone(),
                    )
                })
                .collect();
            let permit = ASSET_HASH_WORKERS
                .clone()
                .acquire_owned()
                .await
                .map_err(|_| StoreError::Conflict)?;
            tokio::task::spawn_blocking(move || {
                let _permit = permit;
                let mut lengths = Vec::with_capacity(owned_inputs.len());
                for (encoded, expected_sha256) in &owned_inputs {
                    let (sha256, byte_len) = decode_and_hash_base64_bounded(encoded, 8_388_608)?;
                    if sha256 != *expected_sha256 {
                        return Err(StoreError::InvalidObservation);
                    }
                    lengths.push(byte_len);
                }
                Ok(lengths)
            })
            .await
            .map_err(|_| StoreError::Conflict)??
        } else {
            let mut lengths = Vec::with_capacity(pending_assets.len());
            for &(idx, _, encoded) in &pending_assets {
                let (sha256, byte_len) = decode_and_hash_base64_bounded(encoded, 8_388_608)?;
                if sha256 != dispatch.assets[idx].content_sha256 {
                    return Err(StoreError::InvalidObservation);
                }
                lengths.push(byte_len);
            }
            lengths
        };

        let mut decoded: Vec<(&WorkspaceAssetVideoReference, &str, i64)> = pending_assets
            .into_iter()
            .zip(sizes)
            .map(|((idx, mime, _), byte_len)| (&dispatch.assets[idx], mime, byte_len))
            .collect();

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
                .bind(body_sha256).bind(dispatch.request.schema_revision()).bind(image_positions)
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
        let mut distinct_asset_ids: Vec<Uuid> =
            decoded.iter().map(|(asset, _, _)| asset.asset_id).collect();
        distinct_asset_ids.dedup();
        let rows = sqlx::query(
            "SELECT a.id,a.content_sha256,a.byte_length,a.content_type,a.revision \
             FROM workspace_asset_library a \
             JOIN workspace_asset_library_content c ON c.asset_id=a.id \
             WHERE a.organization_id=$1 AND a.project_id=$2 AND a.id=ANY($3::uuid[]) \
               AND a.deleted_at IS NULL AND a.media_kind='image' \
             ORDER BY a.id FOR SHARE OF a,c",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(&distinct_asset_ids)
        .fetch_all(&mut *tx)
        .await?;
        if rows.len() != distinct_asset_ids.len() {
            return Err(StoreError::Conflict);
        }
        let mut locked_assets = HashMap::with_capacity(rows.len());
        for row in rows {
            locked_assets.insert(
                row.get::<Uuid, _>("id"),
                (
                    row.get::<String, _>("content_sha256"),
                    row.get::<i64, _>("byte_length"),
                    row.get::<String, _>("content_type"),
                    row.get::<i64, _>("revision"),
                ),
            );
        }
        let mut bind_positions = Vec::with_capacity(decoded.len());
        let mut bind_asset_ids = Vec::with_capacity(decoded.len());
        let mut bind_hashes = Vec::with_capacity(decoded.len());
        let mut bind_revisions = Vec::with_capacity(decoded.len());
        for (asset, mime, byte_length) in decoded {
            let Some((sha256, db_len, content_type, revision)) = locked_assets.get(&asset.asset_id)
            else {
                return Err(StoreError::Conflict);
            };
            if *sha256 != asset.content_sha256
                || *db_len != byte_length
                || content_type != mime
                || *revision < asset.observed_revision
            {
                return Err(StoreError::Conflict);
            }
            bind_positions.push(asset.position as i32);
            bind_asset_ids.push(asset.asset_id);
            bind_hashes.push(asset.content_sha256.clone());
            bind_revisions.push(asset.observed_revision);
        }
        sqlx::query(
            "INSERT INTO workspace_asset_video_request_bindings \
             (organization_id,project_id,key_id,attempt_id,content_position,asset_id,content_sha256,observed_revision,body_sha256,schema_revision) \
             SELECT $1,$2,$3,$4,u.pos,u.asset_id,u.sha256,u.rev,$5,$6 \
             FROM UNNEST($7::int4[],$8::uuid[],$9::text[],$10::int8[]) AS u(pos,asset_id,sha256,rev)",
        )
        .bind(scope.organization_id)
        .bind(scope.project_id)
        .bind(principal.key_id())
        .bind(attempt)
        .bind(body_sha256)
        .bind(dispatch.request.schema_revision())
        .bind(&bind_positions)
        .bind(&bind_asset_ids)
        .bind(&bind_hashes)
        .bind(&bind_revisions)
        .execute(&mut *tx)
        .await?;
        if !Self::mark_dispatched_using(&mut tx, principal, attempt).await? {
            return Err(StoreError::Conflict);
        }
        tx.commit().await?;
        Ok(())
    }
}
