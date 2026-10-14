//! Read-only, authorized discovery of model-specific native management modules.
//! Never probes upstream inventories or selects a replacement account/model.
use super::{media_authorization::MediaPrincipal, provider_assets};
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Query, State, rejection::QueryRejection},
    http::header,
    response::{IntoResponse, Response},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CapabilityQuery {
    model: Option<String>,
}

#[derive(Serialize)]
struct NativeCapabilities {
    complete: bool,
    selected_model: Option<String>,
    modules: Vec<NativeModule>,
}

#[derive(Serialize)]
struct NativeModule {
    module: &'static str,
    model_alias: String,
    display_name: Option<String>,
    adapter: String,
    video_channel: String,
    management_channel: &'static str,
    context_label: String,
    materials: Materials,
    human_verification: bool,
    reference_inputs: Vec<ReferenceInput>,
}

#[derive(Serialize)]
struct Materials {
    groups: bool,
    assets: bool,
    kinds: Vec<&'static str>,
    reference_requires_active: bool,
    reference_requires_same_context: bool,
    reference_requires_dispatch_authorization: bool,
}

#[derive(Serialize)]
struct ReferenceInput {
    kind: &'static str,
    roles: Vec<String>,
    maximum_items: usize,
}

/// Discover configured native modules without contacting upstream services.
///
/// ```openapi
/// {
///   "path": "/v1/media/capabilities",
///   "method": "get",
///   "operation": {
///     "operationId": "discoverNativeProviderCapabilities",
///     "summary": "Discover authorized model-specific native Provider tools",
///     "description": "Requires a current workspace API key or a workspace session with X-Niu-Key-Id. Reuses current video discovery and native module admission: current key/model grants, composed workspace/key model and Provider policy, eligible exact route, ownership, selectable credential and current configuration identity. Optional model is an exact alias, never a Provider inference hint. With no model, returns all eligible admitted contexts without picking the first. With an authorized video model that has no supported native module (including OpenRouter), returns complete:true and modules:[]. Unknown or unauthorized model returns 404. Admission, storage or configuration failures are errors, never successful empty discovery. No upstream request, inventory probe, material mutation, verification creation or generation is issued. Volcengine requires explicitly configured fastrouter-actions-v1 management plus a validated matching ark-direct-v1 video schema and valid management endpoint. Materials support is independent of generation reference support; reference_inputs describes configured schema only, and use still requires acknowledged Active materials, exact account/model/channel binding, current policy and dispatch authorization. Mutation endpoints additionally require Write permission. Human verification support is not a verification outcome. Contains no credentials, API base, upstream model, Provider resource references or internal account identifiers. Successful responses carry Cache-Control:no-store.",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "parameters": [
///       {
///         "name": "model",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
///         },
///         "description": "Optional exact authorized video model alias."
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Complete authorized native-module contexts; an empty modules array means no eligible native tools for the selection.",
///         "headers": {
///           "Cache-Control": {
///             "schema": {
///               "type": "string",
///               "const": "no-store"
///             }
///           }
///         },
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/NativeProviderCapabilities"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid path or model query, or an unknown query field."
///       },
///       "401": {
///         "description": "Authentication or selected workspace key is invalid or revoked."
///       },
///       "403": {
///         "description": "Workspace membership, Read permission or current policy denies access."
///       },
///       "404": {
///         "description": "Selected model or eligible route is absent or unauthorized."
///       },
///       "409": {
///         "description": "Selected route configuration changed during admission."
///       },
///       "501": {
///         "description": "Configured native management transport is unsupported."
///       },
///       "503": {
///         "description": "Storage, selectable credential, Provider qualification or native configuration unavailable."
///       }
///     }
///   },
///   "schemas": {
///     "NativeProviderCapabilities": {
///       "type": "object",
///       "required": [
///         "complete",
///         "selected_model",
///         "modules"
///       ],
///       "properties": {
///         "complete": {
///           "type": "boolean",
///           "const": true
///         },
///         "selected_model": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "modules": {
///           "type": "array",
///           "items": {
///             "$ref": "#/components/schemas/NativeProviderModule"
///           }
///         }
///       }
///     },
///     "NativeProviderModule": {
///       "type": "object",
///       "required": [
///         "module",
///         "model_alias",
///         "display_name",
///         "adapter",
///         "video_channel",
///         "management_channel",
///         "context_label",
///         "materials",
///         "human_verification",
///         "reference_inputs"
///       ],
///       "properties": {
///         "module": {
///           "type": "string",
///           "const": "volcengine"
///         },
///         "model_alias": {
///           "type": "string"
///         },
///         "display_name": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "adapter": {
///           "type": "string"
///         },
///         "video_channel": {
///           "type": "string",
///           "const": "ark-direct-v1"
///         },
///         "management_channel": {
///           "type": "string",
///           "const": "fastrouter-actions-v1"
///         },
///         "context_label": {
///           "type": "string",
///           "description": "Meaningful current model/adapter/channel label. Contains no account identifiers."
///         },
///         "materials": {
///           "$ref": "#/components/schemas/NativeProviderMaterials"
///         },
///         "human_verification": {
///           "type": "boolean",
///           "description": "Supports explicit private H5 verification operations, not proof of human completion or permission to mutate."
///         },
///         "reference_inputs": {
///           "type": "array",
///           "items": {
///             "$ref": "#/components/schemas/NativeProviderReferenceInput"
///           }
///         }
///       }
///     },
///     "NativeProviderMaterials": {
///       "type": "object",
///       "required": [
///         "groups",
///         "assets",
///         "reference_requires_active",
///         "reference_requires_same_context",
///         "reference_requires_dispatch_authorization",
///         "kinds"
///       ],
///       "properties": {
///         "groups": {
///           "type": "boolean",
///           "const": true
///         },
///         "assets": {
///           "type": "boolean",
///           "const": true
///         },
///         "reference_requires_active": {
///           "type": "boolean",
///           "const": true
///         },
///         "reference_requires_same_context": {
///           "type": "boolean",
///           "const": true
///         },
///         "reference_requires_dispatch_authorization": {
///           "type": "boolean",
///           "const": true
///         },
///         "kinds": {
///           "type": "array",
///           "items": {
///             "type": "string",
///             "enum": [
///               "image",
///               "audio",
///               "video"
///             ]
///           }
///         }
///       }
///     },
///     "NativeProviderReferenceInput": {
///       "type": "object",
///       "required": [
///         "kind",
///         "roles",
///         "maximum_items"
///       ],
///       "properties": {
///         "kind": {
///           "type": "string",
///           "enum": [
///             "image",
///             "audio",
///             "video"
///           ]
///         },
///         "roles": {
///           "type": "array",
///           "items": {
///             "type": "string"
///           }
///         },
///         "maximum_items": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 32
///         }
///       }
///     }
///   }
/// }
/// ```
pub(super) async fn discover(
    State(state): State<AppState>,
    MediaPrincipal(principal): MediaPrincipal,
    query: Result<Query<CapabilityQuery>, QueryRejection>,
) -> Result<Response, ApiError> {
    let Query(query) =
        query.map_err(|_| ApiError::invalid_request("Invalid native module capability query"))?;
    if query.model.as_ref().is_some_and(|model| {
        model.is_empty()
            || model.len() > 256
            || model.trim() != model
            || model.chars().any(char::is_control)
    }) {
        return Err(ApiError::invalid_request("Invalid model"));
    }
    let scope = principal.scope();
    let Json(discovery) = super::inference::video_models::models_as(&state, &principal).await?;
    let models = discovery
        .get("data")
        .and_then(Value::as_array)
        .ok_or_else(ApiError::unavailable)?;
    let aliases: std::collections::BTreeSet<&str> = models
        .iter()
        .filter_map(|model| model.get("id").and_then(Value::as_str))
        .collect();
    if query
        .model
        .as_ref()
        .is_some_and(|model| !aliases.contains(model.as_str()))
    {
        return Err(ApiError::not_found());
    }
    let mut modules = Vec::new();
    for configured in crate::vendors::scoped_managed_catalog(&state, scope.organization_id).await? {
        let alias = &configured.model.alias;
        if !aliases.contains(alias.as_str())
            || query
                .model
                .as_ref()
                .is_some_and(|selected| selected != alias)
        {
            continue;
        }
        if configured
            .model
            .capabilities
            .pointer("/provider_assets/channel")
            .and_then(Value::as_str)
            != Some("fastrouter-actions-v1")
        {
            continue;
        }
        let route = provider_assets::admit(&state, &principal, alias).await?;
        let schema: niu_media::VideoSchema = serde_json::from_value(
            route
                .model_capabilities()
                .get("video_schema")
                .cloned()
                .ok_or_else(ApiError::unavailable)?,
        )
        .map_err(|_| ApiError::unavailable())?;
        schema.validate().map_err(|_| ApiError::unavailable())?;
        if schema.model_alias != route.model_alias()
            || schema.upstream_model != route.upstream_model()
        {
            return Err(ApiError::unavailable());
        }
        if schema.channel != "ark-direct-v1" {
            continue;
        }
        // Validate the actual management endpoint configuration locally without
        // issuing any request. All mutations will re-admit this exact alias.
        let _ = provider_assets::client(&state, &route)?;
        let display_name = route
            .model_capabilities()
            .pointer("/catalog/name")
            .and_then(Value::as_str)
            .filter(|name| {
                !name.is_empty()
                    && name.len() <= 256
                    && name.trim() == *name
                    && !name.chars().any(char::is_control)
            })
            .map(str::to_owned);
        let label = display_name.as_deref().unwrap_or(alias);
        let context_label = format!("{label} · {} · fastrouter-actions-v1", route.adapter());
        let reference_inputs = [
            ("image_url", "image"),
            ("audio_url", "audio"),
            ("video_url", "video"),
        ]
        .into_iter()
        .filter_map(|(input, kind)| {
            schema.inputs.get(input).map(|rule| ReferenceInput {
                kind,
                roles: rule.roles.clone(),
                maximum_items: rule.maximum_items,
            })
        })
        .collect();
        modules.push(NativeModule {
            module: "volcengine",
            model_alias: alias.clone(),
            display_name,
            adapter: route.adapter().to_owned(),
            video_channel: schema.channel,
            management_channel: "fastrouter-actions-v1",
            context_label,
            materials: Materials {
                groups: true,
                assets: true,
                kinds: vec!["image", "audio", "video"],
                reference_requires_active: true,
                reference_requires_same_context: true,
                reference_requires_dispatch_authorization: true,
            },
            human_verification: true,
            reference_inputs,
        });
    }
    modules.sort_by(|left, right| left.model_alias.cmp(&right.model_alias));
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(NativeCapabilities {
            complete: true,
            selected_model: query.model,
            modules,
        }),
    )
        .into_response())
}
