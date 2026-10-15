//! Scoped local material resolution. Saving material grants neither inspection
//! approval nor permission to dispatch. Admission placeholders never leave this
//! preparation step; dispatch must use fresh inspection and atomic live bindings.
use crate::{error::ApiError, state::AppState};
use base64::{Engine, engine::general_purpose::STANDARD};
use niu_storage::{AssetLibraryKind, Principal, workspace_asset_content_aad};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReferenceInput {
    asset_id: Uuid,
    consent_to_process: bool,
}
struct PreparedReference {
    position: usize,
    asset_id: Uuid,
    role: Option<String>,
}
/// Private one-pixel schema stand-in, never uploaded, persisted or dispatched.
/// Use the retained material MIME; an unrelated allowed MIME cannot authorize it.
pub(super) fn schema_placeholder(content_type: &str) -> Result<&'static str, ApiError> {
    match content_type {
        "image/png" => Ok(
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC",
        ),
        "image/jpeg" => Ok(
            "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAA//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AN//Z",
        ),
        "image/webp" => {
            Ok("data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA4AAAAvAAAAAAcQEf0PRET/Aw==")
        }
        _ => Err(ApiError::unsupported_message(
            "Workspace image materials require PNG, JPEG or WebP",
        )),
    }
}

/// Holds the original request independently from preliminary schema input.
pub(super) struct PreparedWorkspaceAssets {
    original: Value,
    admission: Value,
    references: Vec<PreparedReference>,
}
impl PreparedWorkspaceAssets {
    /// Scoped metadata only; this never reads material bytes or grants readiness.
    pub(super) async fn admission_body(
        &self,
        state: &AppState,
        principal: &Principal,
    ) -> Result<Value, ApiError> {
        let mut body = self.admission.clone();
        if self.references.is_empty() {
            return Ok(body);
        }
        let ids: Vec<Uuid> = self.references.iter().map(|r| r.asset_id).collect();
        let assets = state
            .store
            .workspace_assets_by_ids(principal.scope(), &ids)
            .await
            .map_err(ApiError::from_store)?;
        for reference in &self.references {
            let asset = assets
                .get(&reference.asset_id)
                .ok_or_else(ApiError::not_found)?;
            if asset.media_kind != AssetLibraryKind::Image {
                return Err(ApiError::unsupported_message(
                    "Only saved image materials are supported for video input",
                ));
            }
            body["content"][reference.position]["image_url"]["url"] =
                json!(schema_placeholder(&asset.content_type)?);
        }
        Ok(body)
    }
    pub(super) fn has_references(&self) -> bool {
        !self.references.is_empty()
    }
}
/// These identities must be checked atomically with dispatch. They are not an
/// approval receipt, an upstream URI or a trusted substitute for fresh inspection.
pub(super) struct WorkspaceAssetReference {
    pub(super) position: usize,
    pub(super) asset_id: Uuid,
    pub(super) content_sha256: String,
    pub(super) revision: i64,
}
pub(super) struct ResolvedWorkspaceAssets {
    pub(super) body: Value,
    pub(super) references: Vec<WorkspaceAssetReference>,
}
impl ResolvedWorkspaceAssets {
    pub(super) fn body(&self) -> &Value {
        &self.body
    }
}
fn invalid() -> ApiError {
    ApiError::invalid_request("Invalid workspace material reference")
}

/// Parse only explicit local references. Ordinary inline inputs retain their
/// existing validation rules. The private placeholder is preliminary schema
/// input only; a caller's matching inline URI cannot create a local reference.
pub(super) fn prepare(body: &Value) -> Result<PreparedWorkspaceAssets, ApiError> {
    let items = body
        .get("content")
        .and_then(Value::as_array)
        .ok_or_else(invalid)?;
    let mut admission = body.clone();
    let mut references = Vec::new();
    for (position, item) in items.iter().enumerate() {
        if item.get("type").and_then(Value::as_str) != Some("workspace_asset") {
            continue;
        }
        let fields = item.as_object().ok_or_else(invalid)?;
        if fields
            .keys()
            .any(|key| !matches!(key.as_str(), "type" | "workspace_asset" | "role"))
        {
            return Err(invalid());
        }
        let role = match fields.get("role") {
            None => None,
            Some(Value::String(role)) if !role.is_empty() => Some(role.clone()),
            _ => return Err(invalid()),
        };
        let input: ReferenceInput =
            serde_json::from_value(fields.get("workspace_asset").ok_or_else(invalid)?.clone())
                .map_err(|_| invalid())?;
        if !input.consent_to_process {
            return Err(invalid());
        }
        let mut replacement =
            json!({"type":"image_url","image_url":{"url":schema_placeholder("image/png")?}});
        if let Some(role) = &role {
            replacement["role"] = json!(role);
        }
        admission["content"][position] = replacement;
        references.push(PreparedReference {
            position,
            asset_id: input.asset_id,
            role,
        });
    }
    if !references.is_empty() && items.iter().any(|item| item["type"] == "ingested_image") {
        return Err(ApiError::unsupported_message(
            "Combining workspace materials with ingested image references is not supported",
        ));
    }
    Ok(PreparedWorkspaceAssets {
        original: body.clone(),
        admission,
        references,
    })
}

/// Call only after current key, route and policy admission. Resolve current
/// scoped storage, authenticate its identity binding and verify original bytes.
/// The returned inline images still require ordinary schema validation and fresh
/// image inspection; the caller must recheck references atomically at dispatch.
pub(super) async fn resolve(
    state: &AppState,
    principal: &Principal,
    prepared: &PreparedWorkspaceAssets,
) -> Result<ResolvedWorkspaceAssets, ApiError> {
    let scope = principal.scope();
    let mut body = prepared.original.clone();
    let mut references = Vec::with_capacity(prepared.references.len());
    for input in &prepared.references {
        let retained = state
            .store
            .workspace_asset_content(scope, input.asset_id)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(ApiError::not_found)?;
        if retained.asset.media_kind != AssetLibraryKind::Image {
            return Err(ApiError::unsupported_message(
                "Only saved image materials are supported for video input",
            ));
        }
        if !matches!(
            retained.asset.content_type.as_str(),
            "image/png" | "image/jpeg" | "image/webp"
        ) {
            return Err(ApiError::unavailable());
        }
        let aad = workspace_asset_content_aad(scope, input.asset_id);
        if retained.asset.id != input.asset_id || retained.aad != aad {
            return Err(ApiError::unavailable());
        }
        let revision = retained
            .asset
            .revision
            .parse::<i64>()
            .map_err(|_| ApiError::unavailable())?;
        if revision <= 0 || revision.to_string() != retained.asset.revision {
            return Err(ApiError::unavailable());
        }
        let cipher = state
            .vendor_cipher
            .as_ref()
            .ok_or_else(ApiError::unavailable)?
            .clone();
        let ciphertext = retained.ciphertext;
        let expected_len = retained.asset.byte_length;
        let expected_sha256 = retained.asset.content_sha256.clone();
        let content_type = retained.asset.content_type;
        let url = tokio::task::spawn_blocking(move || -> Result<String, ApiError> {
            let bytes = cipher
                .open_bytes_with_aad(&aad, &ciphertext)
                .map_err(|_| ApiError::unavailable())?;
            if bytes.is_empty()
                || bytes.len() > niu_media::workspace_asset_validation::MAX_ASSET_BYTES
                || i64::try_from(bytes.len()).ok() != Some(expected_len)
                || format!("{:x}", Sha256::digest(&bytes)) != expected_sha256
            {
                return Err(ApiError::unavailable());
            }
            Ok(format!(
                "data:{content_type};base64,{}",
                STANDARD.encode(&bytes)
            ))
        })
        .await
        .map_err(|_| ApiError::unavailable())??;
        let mut replacement = json!({"type":"image_url","image_url":{"url":url}});
        if let Some(role) = &input.role {
            replacement["role"] = json!(role);
        }
        body["content"][input.position] = replacement;
        references.push(WorkspaceAssetReference {
            position: input.position,
            asset_id: input.asset_id,
            content_sha256: retained.asset.content_sha256,
            revision,
        });
    }
    Ok(ResolvedWorkspaceAssets { body, references })
}
