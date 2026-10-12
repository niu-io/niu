//! Normalized owned Provider references, not upload, inspection or qualification.
//! Keep the original Niu IDs for idempotency and request capture. Private asset
//! URIs are transport-only and must be revalidated with the dispatch transaction.
use crate::{error::ApiError, state::AppState};
use niu_storage::{
    GuardrailSnapshot, Principal, VendorRoute, WorkspaceProviderAssetReference,
    WorkspaceProviderAssetVideoReference,
};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReferenceInput {
    id: Uuid,
}
struct Input {
    position: usize,
    id: Uuid,
    role: Option<String>,
}
/// Syntax-only preparation. Kind comes from authorized backend metadata, never
/// from a client declaration or an ID prefix. No placeholder is sent upstream.
pub(super) struct PreparedProviderAssets {
    original: Value,
    inputs: Vec<Input>,
}
impl PreparedProviderAssets {
    pub(super) fn has_references(&self) -> bool {
        !self.inputs.is_empty()
    }
    pub(super) fn original_body(&self) -> &Value {
        &self.original
    }
}
/// Only storage constructs these references after current scoped authorization.
/// No Debug/Serialize; customer request capture must use original_body instead.
pub(super) struct ResolvedProviderAsset {
    pub(super) position: usize,
    pub(super) reference: WorkspaceProviderAssetReference,
}
pub(super) struct ResolvedProviderAssets {
    body: Value,
    pub(super) assets: Vec<ResolvedProviderAsset>,
}
impl ResolvedProviderAssets {
    pub(super) fn body(&self) -> &Value {
        &self.body
    }
    pub(super) fn has_images(&self) -> bool {
        self.assets
            .iter()
            .any(|asset| asset.reference.kind() == "image")
    }
    pub(super) fn has_video(&self) -> bool {
        self.assets
            .iter()
            .any(|asset| asset.reference.kind() == "video")
    }
    pub(super) fn trusted_references(&self) -> Vec<(usize, &str, &str)> {
        self.assets
            .iter()
            .map(|asset| {
                (
                    asset.position,
                    wire_kind(asset.reference.kind()).unwrap_or_default(),
                    asset.reference.private_uri(),
                )
            })
            .collect()
    }
    pub(super) fn dispatch_references(&self) -> Vec<WorkspaceProviderAssetVideoReference<'_>> {
        self.assets
            .iter()
            .map(|asset| WorkspaceProviderAssetVideoReference {
                position: asset.position,
                reference: &asset.reference,
            })
            .collect()
    }
}
fn wire_kind(kind: &str) -> Option<&'static str> {
    match kind {
        "image" => Some("image_url"),
        "audio" => Some("audio_url"),
        "video" => Some("video_url"),
        _ => None,
    }
}
fn invalid() -> ApiError {
    ApiError::invalid_request("Invalid owned Provider asset reference")
}

/// Strict Niu reference grammar. Ordinary public URL/text inputs remain ordinary
/// schema inputs. Managed-reference/inline-image combinations are explicitly
/// unsupported until their distinct dispatch checks can compose atomically.
pub(super) fn prepare(body: &Value) -> Result<PreparedProviderAssets, ApiError> {
    let items = body
        .get("content")
        .and_then(Value::as_array)
        .ok_or_else(invalid)?;
    if items.len() > 32 {
        return Err(invalid());
    }
    let mut inputs = Vec::new();
    for (position, item) in items.iter().enumerate() {
        if item.get("type").and_then(Value::as_str) != Some("provider_asset") {
            continue;
        }
        let fields = item.as_object().ok_or_else(invalid)?;
        if fields
            .keys()
            .any(|key| !matches!(key.as_str(), "type" | "provider_asset" | "role"))
        {
            return Err(invalid());
        }
        let raw = fields.get("provider_asset").ok_or_else(invalid)?;
        let input: ReferenceInput = serde_json::from_value(raw.clone()).map_err(|_| invalid())?;
        if input.id.is_nil()
            || raw.get("id").and_then(Value::as_str) != Some(input.id.to_string().as_str())
        {
            return Err(invalid());
        }
        let role = match fields.get("role") {
            None => None,
            Some(Value::String(role))
                if !role.is_empty()
                    && role.len() <= 256
                    && role.trim() == role
                    && !role.chars().any(char::is_control) =>
            {
                Some(role.clone())
            }
            _ => return Err(invalid()),
        };
        inputs.push(Input {
            position,
            id: input.id,
            role,
        });
    }
    if !inputs.is_empty()
        && items.iter().any(|item| {
            matches!(
                item.get("type").and_then(Value::as_str),
                Some("workspace_asset" | "ingested_image")
            ) || item.get("type").and_then(Value::as_str) == Some("image_url")
                && item["image_url"]["url"]
                    .as_str()
                    .is_some_and(|url| url.starts_with("data:"))
        })
    {
        return Err(ApiError::unsupported_message(
            "Combining Provider assets with local or ingested image references is not supported",
        ));
    }
    Ok(PreparedProviderAssets {
        original: body.clone(),
        inputs,
    })
}

/// Call only after selecting the current eligible route. The exact schema still
/// validates roles, per-kind counts, sizes and controls after these substitutions.
/// No external request, new approval or inferred readiness is created here.
pub(super) async fn resolve(
    state: &AppState,
    principal: &Principal,
    snapshot: &GuardrailSnapshot,
    route: &VendorRoute,
    schema: &niu_media::VideoSchema,
    prepared: &PreparedProviderAssets,
) -> Result<ResolvedProviderAssets, ApiError> {
    if prepared.has_references() && schema.channel != "ark-direct-v1" {
        return Err(ApiError::unsupported_message(
            "This video channel does not support owned Provider references",
        ));
    }
    if schema.model_alias != route.model.alias
        || schema.upstream_model != route.model.upstream_model
        || prepared.original["model"].as_str() != Some(route.model.alias.as_str())
    {
        return Err(invalid());
    }
    if prepared.has_references() && super::video_images::inspection_required(snapshot)? {
        return Err(ApiError::unsupported_message(
            "Required image inspection cannot inspect remote Provider assets",
        ));
    }
    if !super::video::policy_permits_video(snapshot, &route.model.alias, &route.vendor.adapter) {
        return Err(ApiError::forbidden());
    }
    let current = state
        .store
        .dashboard_key(principal.scope(), principal.key_id())
        .await
        .map_err(ApiError::from_store)?;
    let current = state.authorize_key_source(current).await?;
    if !current.allows_model(&route.model.alias) {
        return Err(ApiError::not_found());
    }
    crate::vendors::require_selectable_credential(state, route.vendor.id).await?;
    let mut body = prepared.original.clone();
    let mut assets = Vec::with_capacity(prepared.inputs.len());
    for input in &prepared.inputs {
        let reference = state
            .store
            .resolve_workspace_provider_asset_reference(principal, route, snapshot, input.id)
            .await
            .map_err(ApiError::from_store)?;
        let kind = wire_kind(reference.kind()).ok_or_else(ApiError::unavailable)?;
        let mut item = json!({"type":kind});
        item[kind] = json!({"url":reference.private_uri()});
        if let Some(role) = &input.role {
            item["role"] = json!(role)
        }
        body["content"][input.position] = item;
        assets.push(ResolvedProviderAsset {
            position: input.position,
            reference,
        });
    }
    Ok(ResolvedProviderAssets { body, assets })
}
