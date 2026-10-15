//! Save only original Niu references and validated controls. Runtime resolution,
//! byte inspection, upload, Provider readiness and dispatch remain submit work.
use crate::{error::ApiError, state::AppState};
use niu_storage::{AssetLibraryKind, Principal};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ProviderReference {
    id: Uuid,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WorkspaceReference {
    asset_id: Uuid,
    consent_to_process: bool,
}
#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
enum Content {
    Text {
        text: String,
    },
    ProviderAsset {
        provider_asset: ProviderReference,
        role: Option<String>,
    },
    WorkspaceAsset {
        workspace_asset: WorkspaceReference,
        role: Option<String>,
    },
}
fn invalid() -> ApiError {
    ApiError::invalid_request("Invalid saved Niu material reference")
}
fn canonical_id(value: &Value, id: Uuid) -> Result<(), ApiError> {
    if id.is_nil() || value.as_str() != Some(id.to_string().as_str()) {
        return Err(invalid());
    }
    Ok(())
}
fn role(value: &Value, role: &Option<String>) -> Result<(), ApiError> {
    if value.get("role").is_some_and(Value::is_null)
        || role.as_ref().is_some_and(|r| {
            r.is_empty() || r.len() > 256 || r.trim() != r || r.chars().any(char::is_control)
        })
    {
        return Err(invalid());
    }
    Ok(())
}

pub(super) struct SavedDraft {
    pub(super) canonical: Value,
    pub(super) owner_funded: bool,
}

pub(super) async fn validate(
    state: &AppState,
    principal: &Principal,
    original: &Value,
    model: &str,
) -> Result<SavedDraft, ApiError> {
    let content = original
        .get("content")
        .and_then(Value::as_array)
        .ok_or_else(invalid)?;
    if content.is_empty() || content.len() > 32 {
        return Err(invalid());
    }
    // Parse the exact existing runtime grammars before any metadata lookup. Never
    // accept client-supplied asset URIs or a mixed Provider/local reference family.
    super::video_provider_assets::prepare(original)?;
    super::video_workspace_assets::prepare(original)?;
    if content
        .iter()
        .all(|item| item.get("type").and_then(Value::as_str) == Some("text"))
    {
        let admitted = super::video::validate_admission(state, principal, original, model).await?;
        let mut canonical = admitted.request.body().clone();
        canonical["model"] = json!(model);
        return Ok(SavedDraft {
            canonical,
            owner_funded: admitted.owner_funded,
        });
    }
    let parsed:Vec<Content>=content.iter().map(|item| {
        match item.get("type").and_then(Value::as_str) {
            Some("text"|"provider_asset"|"workspace_asset") => serde_json::from_value(item.clone()).map_err(|_|invalid()),
            _ => Err(ApiError::unsupported_message("Saved video intents support text and Niu workspace or Provider material references only")),
        }
    }).collect::<Result<_,_>>()?;
    let (route, owner_funded, _, schema) =
        super::video::draft_route(state, principal, model).await?;
    if schema.channel != "ark-direct-v1" || original.get("callback_url").is_some() {
        return Err(ApiError::unsupported_message(
            "Saved Niu material references require the supported Ark video channel without callbacks",
        ));
    }
    let mut validation = original.clone();
    let mut provider_positions = Vec::new();
    let mut provider_references = false;
    let mut reference_video = false;
    let mut images = false;
    let mut provider_asset_cache = std::collections::BTreeMap::new();
    let mut workspace_asset_cache = std::collections::BTreeMap::new();
    for (position, item) in parsed.iter().enumerate() {
        let (wire, uri, input_role) = match item {
            Content::Text { text } => {
                let _ = text;
                continue;
            }
            Content::ProviderAsset {
                provider_asset: reference,
                role: input_role,
            } => {
                canonical_id(&content[position]["provider_asset"]["id"], reference.id)?;
                role(&content[position], input_role)?;
                if route
                    .model
                    .capabilities
                    .pointer("/provider_assets/channel")
                    .and_then(Value::as_str)
                    != Some("fastrouter-actions-v1")
                {
                    return Err(ApiError::unsupported_message(
                        "This model does not configure Provider material management",
                    ));
                }
                let asset = if let Some(cached) = provider_asset_cache.get(&reference.id) {
                    cached
                } else {
                    let loaded = state
                        .store
                        .workspace_provider_asset(principal, reference.id)
                        .await
                        .map_err(ApiError::from_store)?
                        .ok_or_else(ApiError::not_found)?;
                    provider_asset_cache.entry(reference.id).or_insert(loaded)
                };
                if asset.model != model {
                    return Err(ApiError::not_found());
                }
                let wire = match asset.kind.as_str() {
                    "image" => "image_url",
                    "audio" => "audio_url",
                    "video" => "video_url",
                    _ => return Err(invalid()),
                };
                provider_positions.push(position);
                provider_references = true;
                (wire, format!("asset://niu-draft-{position}"), input_role)
            }
            Content::WorkspaceAsset {
                workspace_asset: reference,
                role: input_role,
            } => {
                canonical_id(
                    &content[position]["workspace_asset"]["asset_id"],
                    reference.asset_id,
                )?;
                role(&content[position], input_role)?;
                if !reference.consent_to_process {
                    return Err(invalid());
                }
                let asset = if let Some(cached) = workspace_asset_cache.get(&reference.asset_id) {
                    cached
                } else {
                    let loaded = state
                        .store
                        .workspace_asset(principal.scope(), reference.asset_id)
                        .await
                        .map_err(ApiError::from_store)?
                        .ok_or_else(ApiError::not_found)?;
                    workspace_asset_cache
                        .entry(reference.asset_id)
                        .or_insert(loaded)
                };
                if asset.media_kind != AssetLibraryKind::Image {
                    return Err(ApiError::unsupported_message(
                        "Saved workspace material references support images only",
                    ));
                }
                (
                    "image_url",
                    super::video_workspace_assets::schema_placeholder(&asset.content_type)?
                        .to_owned(),
                    input_role,
                )
            }
        };
        images |= wire == "image_url";
        reference_video |= wire == "video_url";
        let mut replacement = json!({"type":wire});
        replacement[wire] = json!({"url":uri});
        if let Some(input_role) = input_role {
            replacement["role"] = json!(input_role);
        }
        validation["content"][position] = replacement;
    }
    let trusted: Vec<(usize, &str, &str)> = provider_positions
        .iter()
        .map(|&position| {
            let item = &validation["content"][position];
            let wire = item["type"].as_str().unwrap();
            (position, wire, item[wire]["url"].as_str().unwrap())
        })
        .collect();
    let bytes = serde_json::to_vec(&validation).map_err(|_| invalid())?;
    let request = schema
        .validate_request_with_provider_assets(&bytes, &trusted)
        .map_err(|_| {
            ApiError::invalid_request("The saved request does not match this model's video schema")
        })?;
    if request
        .effective_output()
        .is_some_and(|output| output.estimator.meter() != "video_tokens")
    {
        return Err(ApiError::unsupported_message(
            "This video adapter does not qualify the configured media meter",
        ));
    }
    super::video::draft_terms(
        state,
        principal,
        &route,
        owner_funded,
        &schema,
        &request,
        super::video::DraftReferenceFacts {
            reference_video,
            images,
            provider_references,
        },
    )
    .await?;
    // All placeholders are discarded here, before hashing, storage, logging or
    // submission. Only runtime submission resolves these original Niu identities.
    let mut canonical = request.body().clone();
    canonical["model"] = json!(model);
    canonical["content"] = json!(content);
    Ok(SavedDraft {
        canonical,
        owner_funded,
    })
}
