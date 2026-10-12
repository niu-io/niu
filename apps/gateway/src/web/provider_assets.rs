//! Workspace-owned Provider assets. No global upstream listing, inference,
//! processing qualification, mutation replay or public Provider identity.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    body::Bytes,
    extract::{
        Path, Query, State,
        rejection::{JsonRejection, QueryRejection},
    },
    http::{HeaderMap, StatusCode},
};
use niu_media::fastrouter_actions::{
    FastRouterAction, FastRouterActionClient, FastRouterActionError, FastRouterActionLimits,
};
use niu_media::fastrouter_domain::{FastRouterAssetKind, decode_created_reference};
use niu_storage::{
    Principal, WorkspaceProviderAssetMutation, WorkspaceProviderAssetOutcome,
    WorkspaceProviderAssetRoute,
};
use serde::Deserialize;
use serde_json::{Value, json};
use std::time::Duration;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ModelQuery {
    model: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CreateGroup {
    model: String,
    name: String,
    description: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct UpdateGroup {
    model: String,
    name: Option<String>,
    description: Option<String>,
    expected_revision: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct DeleteQuery {
    model: String,
    expected_revision: Option<String>,
}
#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
enum AssetKind {
    Image,
    Audio,
    Video,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct CreateAsset {
    model: String,
    group_id: Uuid,
    url: String,
    name: Option<String>,
    kind: AssetKind,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct RenameAsset {
    model: String,
    name: String,
    expected_revision: Option<String>,
}
fn body<T>(result: Result<Json<T>, JsonRejection>) -> Result<T, ApiError> {
    result.map(|Json(value)| value).map_err(|error| {
        if error.status() == StatusCode::PAYLOAD_TOO_LARGE {
            ApiError::request_too_large()
        } else {
            ApiError::invalid_request("Invalid Provider asset request")
        }
    })
}
fn query<T>(result: Result<Query<T>, QueryRejection>) -> Result<T, ApiError> {
    result
        .map(|Query(value)| value)
        .map_err(|_| ApiError::invalid_request("Invalid Provider asset query"))
}
fn revision(value: Option<String>) -> Result<Option<i64>, ApiError> {
    value
        .map(|value| {
            value
                .parse::<i64>()
                .ok()
                .filter(|revision| *revision > 0 && revision.to_string() == value)
                .ok_or_else(|| ApiError::invalid_request("Invalid expected asset revision"))
        })
        .transpose()
}
pub(super) fn idempotency(headers: &HeaderMap) -> Result<Uuid, ApiError> {
    if headers.get_all("idempotency-key").iter().count() > 1 {
        return Err(ApiError::invalid_request(
            "Provide exactly one Idempotency-Key",
        ));
    }
    match headers.get("idempotency-key") {
        None => Ok(Uuid::new_v4()),
        Some(value) => value
            .to_str()
            .ok()
            .and_then(|value| {
                Uuid::parse_str(value)
                    .ok()
                    .filter(|id| !id.is_nil() && id.to_string() == value)
            })
            .ok_or_else(|| {
                ApiError::invalid_request("Idempotency-Key must be a canonical nonnil UUID")
            }),
    }
}

pub(super) async fn admit(
    state: &AppState,
    principal: &Principal,
    model: &str,
) -> Result<WorkspaceProviderAssetRoute, ApiError> {
    if model.is_empty()
        || model.len() > 256
        || model.trim() != model
        || model.chars().any(char::is_control)
    {
        return Err(ApiError::invalid_request("Invalid model"));
    }
    let scope = principal.scope();
    let published = crate::vendors::publication::snapshot(state).await?;
    let route = if let Some(published) = published {
        if published.registry.pools.contains_key(model) {
            return Err(ApiError::not_found());
        }
        let configured = published
            .registry
            .routes
            .get(model)
            .ok_or_else(ApiError::not_found)?;
        let metadata = &configured.metadata;
        if !metadata.vendor.enabled
            || !metadata.model.enabled
            || metadata
                .personal_organization_id
                .is_some_and(|owner| owner != scope.organization_id)
        {
            return Err(ApiError::not_found());
        }
        let live = state
            .store
            .shared_vendor_route(model)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(|| ApiError::from_store(niu_storage::StoreError::ManagedRouteChanged))?;
        if live.route.vendor.id != metadata.vendor.id
            || live.route.vendor.revision != metadata.vendor.revision
            || live.route.model.revision != metadata.model.revision
            || live.route.personal_organization_id != metadata.personal_organization_id
        {
            return Err(ApiError::from_store(
                niu_storage::StoreError::ManagedRouteChanged,
            ));
        }
        if metadata.personal_organization_id.is_none() && !live.supplier_available {
            return Err(ApiError::unavailable());
        }
        live.route
    } else if let Some(route) = state
        .store
        .personal_vendor_route(scope.organization_id, model)
        .await
        .map_err(ApiError::from_store)?
    {
        route
    } else {
        let route = state
            .store
            .vendor_route(model)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(ApiError::not_found)?;
        if state
            .store
            .personal_vendor_organization(route.vendor.id)
            .await
            .map_err(ApiError::from_store)?
            .is_some()
        {
            return Err(ApiError::not_found());
        }
        if !state
            .store
            .supplier_model_available(model)
            .await
            .map_err(ApiError::from_store)?
        {
            return Err(ApiError::unavailable());
        }
        route
    };
    if !route.vendor.enabled || !route.model.enabled {
        return Err(ApiError::not_found());
    }
    if route
        .model
        .capabilities
        .pointer("/provider_assets/channel")
        .and_then(Value::as_str)
        != Some("fastrouter-actions-v1")
    {
        return Err(ApiError::unsupported_message(
            "This model does not configure Provider asset management",
        ));
    }
    crate::vendors::require_selectable_credential(state, route.vendor.id).await?;
    let snapshot = state
        .store
        .guardrail_snapshot(scope, principal.key_id())
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::forbidden)?;
    state
        .store
        .authorize_media_processing(principal, &snapshot)
        .await
        .map_err(ApiError::from_store)?;
    let current = state
        .store
        .dashboard_key(scope, principal.key_id())
        .await
        .map_err(ApiError::from_store)?;
    let current = state.authorize_key_source(current).await?;
    if !current.allows_model(model) {
        return Err(ApiError::not_found());
    }
    for policy in [&snapshot.workspace_policy, &snapshot.key_policy]
        .into_iter()
        .flatten()
    {
        let draft: crate::guardrails::PolicyDraft =
            serde_json::from_value(policy.clone()).map_err(|_| ApiError::forbidden())?;
        draft.validate_shape().map_err(|_| ApiError::forbidden())?;
        if !crate::guardrails::EffectiveAccess::compose([draft.models]).permits(model)
            || !crate::guardrails::EffectiveAccess::compose([draft.providers])
                .permits(&route.vendor.adapter)
        {
            return Err(ApiError::forbidden());
        }
    }
    let binding = state
        .store
        .workspace_provider_asset_route(principal, model)
        .await
        .map_err(ApiError::from_store)?;
    if binding.vendor_id() != route.vendor.id
        || binding.vendor_revision() != route.vendor.revision
        || binding.model_revision() != route.model.revision
        || binding.upstream_model() != route.model.upstream_model
        || binding.adapter() != route.vendor.adapter
        || binding.api_base() != route.vendor.api_base
        || binding.credential_ciphertext() != route.credential_ciphertext
    {
        return Err(ApiError::from_store(
            niu_storage::StoreError::ManagedRouteChanged,
        ));
    }
    Ok(binding)
}
pub(super) fn client(
    state: &AppState,
    route: &WorkspaceProviderAssetRoute,
) -> Result<FastRouterActionClient, ApiError> {
    let mut endpoint = url::Url::parse(route.api_base()).map_err(|_| ApiError::unsupported())?;
    if endpoint.path().trim_end_matches('/') != "/doubao/api/v3"
        || endpoint.query().is_some()
        || endpoint.fragment().is_some()
    {
        return Err(ApiError::unsupported_message(
            "Provider asset actions require a configured FastRouter video endpoint",
        ));
    }
    endpoint.set_path("/doubao");
    let key = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?
        .open(route.vendor_id(), route.credential_ciphertext())
        .map_err(|_| ApiError::unavailable())?;
    FastRouterActionClient::new(endpoint.as_str(), &key, route.upstream_model())
        .map_err(|_| ApiError::unavailable())
}
pub(super) fn limits(state: &AppState) -> FastRouterActionLimits {
    let seconds = state.config.server.request_timeout_seconds.min(60);
    FastRouterActionLimits {
        http_timeout: Duration::from_secs(seconds),
        connect_timeout: Duration::from_secs(
            state
                .config
                .server
                .provider_connect_timeout_seconds
                .min(seconds),
        ),
        dns_timeout: Duration::from_secs(
            state
                .config
                .server
                .provider_dns_timeout_seconds
                .min(seconds),
        ),
        maximum_request_bytes: 16384,
        maximum_response_bytes: 65536,
    }
}

async fn mutate(
    state: &AppState,
    headers: &HeaderMap,
    model: &str,
    mutation: WorkspaceProviderAssetMutation,
    action: FastRouterAction,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let principal = state.authorize_api_headers(headers).await?;
    let route = admit(state, &principal, model).await?;
    let client = client(state, &route)?;
    let prepared = state
        .store
        .prepare_workspace_provider_asset_operation(
            &principal,
            &route,
            mutation,
            idempotency(headers)?,
        )
        .await
        .map_err(ApiError::from_store)?;
    let operation_id = prepared.operation().id;
    let dispatch = admit(state, &principal, model).await?;
    if dispatch.vendor_id() != route.vendor_id()
        || dispatch.vendor_revision() != route.vendor_revision()
        || dispatch.model_revision() != route.model_revision()
        || dispatch.credential_ciphertext() != route.credential_ciphertext()
    {
        return Err(ApiError::from_store(
            niu_storage::StoreError::ManagedRouteChanged,
        ));
    }
    if state
        .store
        .claim_workspace_provider_asset_operation(&principal, operation_id, &dispatch)
        .await
        .map_err(ApiError::from_store)?
    {
        let outcome = match client
            .execute(action, prepared.request_body(), limits(state))
            .await
        {
            Ok(response) => {
                if matches!(
                    action,
                    FastRouterAction::CreateAssetGroup | FastRouterAction::CreateAsset
                ) {
                    match decode_created_reference(&response) {
                        Ok(reference) => WorkspaceProviderAssetOutcome::Acknowledged {
                            provider_reference: Some(reference),
                        },
                        Err(_) => WorkspaceProviderAssetOutcome::Unknown {
                            http_status: None,
                            request_id: response.request_id().map(str::to_owned),
                        },
                    }
                } else if response
                    .result()
                    .as_object()
                    .is_some_and(|result| result.is_empty())
                {
                    WorkspaceProviderAssetOutcome::Acknowledged {
                        provider_reference: None,
                    }
                } else {
                    WorkspaceProviderAssetOutcome::Unknown {
                        http_status: None,
                        request_id: response.request_id().map(str::to_owned),
                    }
                }
            }
            Err(
                FastRouterActionError::InvalidConfiguration
                | FastRouterActionError::InvalidRequest
                | FastRouterActionError::EndpointUnavailable,
            ) => WorkspaceProviderAssetOutcome::NotDispatched,
            Err(
                FastRouterActionError::Transport(failure)
                | FastRouterActionError::ResponseTooLarge(failure)
                | FastRouterActionError::InvalidResponse(failure)
                | FastRouterActionError::UpstreamRejected(failure),
            ) => WorkspaceProviderAssetOutcome::Unknown {
                http_status: failure.http_status,
                request_id: failure.request_id,
            },
        };
        state
            .store
            .record_workspace_provider_asset_outcome(principal.scope(), operation_id, outcome)
            .await
            .map_err(ApiError::from_store)?;
    }
    let operation = state
        .store
        .workspace_provider_asset_operation(&principal, operation_id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let group = state
        .store
        .workspace_provider_asset_group(&principal, operation.group_id)
        .await
        .map_err(ApiError::from_store)?;
    let asset = if let Some(id) = operation.asset_id {
        state
            .store
            .workspace_provider_asset(&principal, id)
            .await
            .map_err(ApiError::from_store)?
    } else {
        None
    };
    Ok((
        StatusCode::ACCEPTED,
        Json(json!({"data":operation,"group":group,"asset":asset})),
    ))
}

/// ```openapi
/// {
///   "path": "/v1/media/asset-groups",
///   "method": "post",
///   "operation": {
///     "operationId": "create_groupProviderAsset",
///     "summary": "Create a Provider asset group",
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Claims one durable operation before one upstream mutation. After-send errors retain unknown and never authorize automatic replay; accepted operation does not imply Provider processing readiness.",
///     "tags": [
///       "Media"
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "Idempotency-Key",
///         "in": "header",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Canonical nonnil UUID. Same key and unchanged input returns the saved operation without replaying its mutation."
///       }
///     ],
///     "responses": {
///       "202": {
///         "description": "Saved operation accepted",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/MediaAssetMutation"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed or unsupported request fields"
///       },
///       "401": {
///         "description": "Missing, expired or revoked API key"
///       },
///       "403": {
///         "description": "Workspace or key policy refuses access"
///       },
///       "404": {
///         "description": "Owned object or model unavailable"
///       },
///       "409": {
///         "description": "Changed input, stale revision, unresolved identity or route conflict"
///       },
///       "413": {
///         "description": "Request exceeds its bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not support asset management"
///       },
///       "502": {
///         "description": "Provider read failed safely"
///       },
///       "503": {
///         "description": "Credential, capacity or bounded storage unavailable"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "model",
///               "name"
///             ],
///             "properties": {
///               "model": {
///                 "type": "string"
///               },
///               "name": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 64
///               },
///               "description": {
///                 "type": "string",
///                 "maxLength": 300
///               }
///             }
///           }
///         }
///       }
///     },
///     "x-niu-implementation": "implemented"
///   },
///   "schemas": {
///     "MediaAssetGroup": {
///       "type": "object",
///       "required": [
///         "id",
///         "model",
///         "name",
///         "kind",
///         "status",
///         "revision",
///         "created_at_ms",
///         "updated_at_ms"
///       ],
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "model": {
///           "type": "string"
///         },
///         "name": {
///           "type": "string"
///         },
///         "description": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "kind": {
///           "type": "string",
///           "enum": [
///             "generated",
///             "person"
///           ]
///         },
///         "status": {
///           "type": "string"
///         },
///         "revision": {
///           "type": "string",
///           "pattern": "^[1-9][0-9]*$"
///         },
///         "created_at_ms": {
///           "type": "integer",
///           "format": "int64"
///         },
///         "updated_at_ms": {
///           "type": "integer",
///           "format": "int64"
///         }
///       }
///     },
///     "MediaAsset": {
///       "type": "object",
///       "required": [
///         "id",
///         "group_id",
///         "model",
///         "kind",
///         "status",
///         "revision",
///         "created_at_ms",
///         "updated_at_ms"
///       ],
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "group_id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "model": {
///           "type": "string"
///         },
///         "name": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "kind": {
///           "type": "string",
///           "enum": [
///             "image",
///             "audio",
///             "video"
///           ]
///         },
///         "status": {
///           "type": "string"
///         },
///         "revision": {
///           "type": "string",
///           "pattern": "^[1-9][0-9]*$"
///         },
///         "created_at_ms": {
///           "type": "integer",
///           "format": "int64"
///         },
///         "updated_at_ms": {
///           "type": "integer",
///           "format": "int64"
///         }
///       }
///     },
///     "MediaAssetOperation": {
///       "type": "object",
///       "required": [
///         "id",
///         "group_id",
///         "model",
///         "action",
///         "status",
///         "created_at_ms",
///         "updated_at_ms"
///       ],
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "group_id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "asset_id": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "uuid"
///         },
///         "model": {
///           "type": "string"
///         },
///         "action": {
///           "type": "string",
///           "enum": [
///             "create_group",
///             "update_group",
///             "delete_group",
///             "create_asset",
///             "rename_asset",
///             "delete_asset"
///           ]
///         },
///         "status": {
///           "type": "string",
///           "enum": [
///             "prepared",
///             "unknown",
///             "acknowledged",
///             "not_sent"
///           ]
///         },
///         "http_status": {
///           "type": [
///             "integer",
///             "null"
///           ]
///         },
///         "request_id": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "created_at_ms": {
///           "type": "integer",
///           "format": "int64"
///         },
///         "updated_at_ms": {
///           "type": "integer",
///           "format": "int64"
///         }
///       }
///     },
///     "MediaAssetMutation": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "data",
///         "group",
///         "asset"
///       ],
///       "properties": {
///         "data": {
///           "$ref": "#/components/schemas/MediaAssetOperation"
///         },
///         "group": {
///           "anyOf": [
///             {
///               "$ref": "#/components/schemas/MediaAssetGroup"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         },
///         "asset": {
///           "anyOf": [
///             {
///               "$ref": "#/components/schemas/MediaAsset"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         }
///       }
///     },
///     "MediaAssetGroupPage": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "data",
///         "next_cursor"
///       ],
///       "properties": {
///         "data": {
///           "type": "array",
///           "items": {
///             "$ref": "#/components/schemas/MediaAssetGroup"
///           }
///         },
///         "next_cursor": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "uuid"
///         }
///       }
///     },
///     "MediaAssetPage": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "data",
///         "next_cursor"
///       ],
///       "properties": {
///         "data": {
///           "type": "array",
///           "items": {
///             "$ref": "#/components/schemas/MediaAsset"
///           }
///         },
///         "next_cursor": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "uuid"
///         }
///       }
///     }
///   }
/// }
/// ```
pub(super) async fn create_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Json<CreateGroup>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let input = body(input)?;
    mutate(
        &state,
        &headers,
        &input.model,
        WorkspaceProviderAssetMutation::CreateGroup {
            name: input.name,
            description: input.description,
        },
        FastRouterAction::CreateAssetGroup,
    )
    .await
}
/// ```openapi
/// {
///   "path": "/v1/media/asset-groups/{id}",
///   "method": "patch",
///   "operation": {
///     "operationId": "update_groupProviderAsset",
///     "summary": "Update Provider group metadata",
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Claims one durable operation before one upstream mutation. After-send errors retain unknown and never authorize automatic replay; accepted operation does not imply Provider processing readiness.",
///     "tags": [
///       "Media"
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "id",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "Idempotency-Key",
///         "in": "header",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Canonical nonnil UUID. Same key and unchanged input returns the saved operation without replaying its mutation."
///       }
///     ],
///     "responses": {
///       "202": {
///         "description": "Saved operation accepted",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/MediaAssetMutation"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed or unsupported request fields"
///       },
///       "401": {
///         "description": "Missing, expired or revoked API key"
///       },
///       "403": {
///         "description": "Workspace or key policy refuses access"
///       },
///       "404": {
///         "description": "Owned object or model unavailable"
///       },
///       "409": {
///         "description": "Changed input, stale revision, unresolved identity or route conflict"
///       },
///       "413": {
///         "description": "Request exceeds its bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not support asset management"
///       },
///       "502": {
///         "description": "Provider read failed safely"
///       },
///       "503": {
///         "description": "Credential, capacity or bounded storage unavailable"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "model"
///             ],
///             "properties": {
///               "model": {
///                 "type": "string"
///               },
///               "name": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 64
///               },
///               "description": {
///                 "type": "string",
///                 "maxLength": 300
///               },
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]*$"
///               }
///             }
///           }
///         }
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(super) async fn update_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    input: Result<Json<UpdateGroup>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let input = body(input)?;
    mutate(
        &state,
        &headers,
        &input.model,
        WorkspaceProviderAssetMutation::UpdateGroup {
            group_id: id,
            name: input.name,
            description: input.description,
            expected_revision: revision(input.expected_revision)?,
        },
        FastRouterAction::UpdateAssetGroup,
    )
    .await
}
/// ```openapi
/// {
///   "path": "/v1/media/asset-groups/{id}",
///   "method": "delete",
///   "operation": {
///     "operationId": "delete_groupProviderAsset",
///     "summary": "Delete a Provider asset group",
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Claims one durable operation before one upstream mutation. After-send errors retain unknown and never authorize automatic replay; accepted operation does not imply Provider processing readiness. Group deletion is destructive and includes its Provider assets.",
///     "tags": [
///       "Media"
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "id",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       },
///       {
///         "name": "Idempotency-Key",
///         "in": "header",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Canonical nonnil UUID. Same key and unchanged input returns the saved operation without replaying its mutation."
///       },
///       {
///         "name": "expected_revision",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "pattern": "^[1-9][0-9]*$"
///         }
///       }
///     ],
///     "responses": {
///       "202": {
///         "description": "Saved operation accepted",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/MediaAssetMutation"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed or unsupported request fields"
///       },
///       "401": {
///         "description": "Missing, expired or revoked API key"
///       },
///       "403": {
///         "description": "Workspace or key policy refuses access"
///       },
///       "404": {
///         "description": "Owned object or model unavailable"
///       },
///       "409": {
///         "description": "Changed input, stale revision, unresolved identity or route conflict"
///       },
///       "413": {
///         "description": "Request exceeds its bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not support asset management"
///       },
///       "502": {
///         "description": "Provider read failed safely"
///       },
///       "503": {
///         "description": "Credential, capacity or bounded storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(super) async fn delete_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    input: Result<Query<DeleteQuery>, QueryRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let input = query(input)?;
    mutate(
        &state,
        &headers,
        &input.model,
        WorkspaceProviderAssetMutation::DeleteGroup {
            group_id: id,
            expected_revision: revision(input.expected_revision)?,
        },
        FastRouterAction::DeleteAssetGroup,
    )
    .await
}
/// ```openapi
/// {
///   "path": "/v1/media/assets",
///   "method": "post",
///   "operation": {
///     "operationId": "create_assetProviderAsset",
///     "summary": "Create a Provider asset from a URL",
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Claims one durable operation before one upstream mutation. After-send errors retain unknown and never authorize automatic replay; accepted operation does not imply Provider processing readiness.",
///     "tags": [
///       "Media"
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "Idempotency-Key",
///         "in": "header",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Canonical nonnil UUID. Same key and unchanged input returns the saved operation without replaying its mutation."
///       }
///     ],
///     "responses": {
///       "202": {
///         "description": "Saved operation accepted",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/MediaAssetMutation"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed or unsupported request fields"
///       },
///       "401": {
///         "description": "Missing, expired or revoked API key"
///       },
///       "403": {
///         "description": "Workspace or key policy refuses access"
///       },
///       "404": {
///         "description": "Owned object or model unavailable"
///       },
///       "409": {
///         "description": "Changed input, stale revision, unresolved identity or route conflict"
///       },
///       "413": {
///         "description": "Request exceeds its bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not support asset management"
///       },
///       "502": {
///         "description": "Provider read failed safely"
///       },
///       "503": {
///         "description": "Credential, capacity or bounded storage unavailable"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "model",
///               "group_id",
///               "url",
///               "kind"
///             ],
///             "properties": {
///               "model": {
///                 "type": "string"
///               },
///               "group_id": {
///                 "type": "string",
///                 "format": "uuid"
///               },
///               "url": {
///                 "type": "string",
///                 "maxLength": 8192,
///                 "format": "uri"
///               },
///               "name": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 64
///               },
///               "kind": {
///                 "type": "string",
///                 "enum": [
///                   "image",
///                   "audio",
///                   "video"
///                 ]
///               }
///             }
///           }
///         }
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(super) async fn create_asset(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Json<CreateAsset>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let input = body(input)?;
    let kind = match input.kind {
        AssetKind::Image => FastRouterAssetKind::Image,
        AssetKind::Audio => FastRouterAssetKind::Audio,
        AssetKind::Video => FastRouterAssetKind::Video,
    };
    mutate(
        &state,
        &headers,
        &input.model,
        WorkspaceProviderAssetMutation::CreateAsset {
            group_id: input.group_id,
            url: input.url,
            name: input.name,
            kind,
        },
        FastRouterAction::CreateAsset,
    )
    .await
}
/// ```openapi
/// {
///   "path": "/v1/media/assets/{id}",
///   "method": "patch",
///   "operation": {
///     "operationId": "rename_assetProviderAsset",
///     "summary": "Rename a Provider asset",
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Claims one durable operation before one upstream mutation. After-send errors retain unknown and never authorize automatic replay; accepted operation does not imply Provider processing readiness.",
///     "tags": [
///       "Media"
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "id",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "Idempotency-Key",
///         "in": "header",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Canonical nonnil UUID. Same key and unchanged input returns the saved operation without replaying its mutation."
///       }
///     ],
///     "responses": {
///       "202": {
///         "description": "Saved operation accepted",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/MediaAssetMutation"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed or unsupported request fields"
///       },
///       "401": {
///         "description": "Missing, expired or revoked API key"
///       },
///       "403": {
///         "description": "Workspace or key policy refuses access"
///       },
///       "404": {
///         "description": "Owned object or model unavailable"
///       },
///       "409": {
///         "description": "Changed input, stale revision, unresolved identity or route conflict"
///       },
///       "413": {
///         "description": "Request exceeds its bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not support asset management"
///       },
///       "502": {
///         "description": "Provider read failed safely"
///       },
///       "503": {
///         "description": "Credential, capacity or bounded storage unavailable"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "model",
///               "name"
///             ],
///             "properties": {
///               "model": {
///                 "type": "string"
///               },
///               "name": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 64
///               },
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^[1-9][0-9]*$"
///               }
///             }
///           }
///         }
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(super) async fn rename_asset(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    input: Result<Json<RenameAsset>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let input = body(input)?;
    mutate(
        &state,
        &headers,
        &input.model,
        WorkspaceProviderAssetMutation::RenameAsset {
            asset_id: id,
            name: input.name,
            expected_revision: revision(input.expected_revision)?,
        },
        FastRouterAction::UpdateAsset,
    )
    .await
}
/// ```openapi
/// {
///   "path": "/v1/media/assets/{id}",
///   "method": "delete",
///   "operation": {
///     "operationId": "delete_assetProviderAsset",
///     "summary": "Delete a Provider asset",
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Claims one durable operation before one upstream mutation. After-send errors retain unknown and never authorize automatic replay; accepted operation does not imply Provider processing readiness.",
///     "tags": [
///       "Media"
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "id",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       },
///       {
///         "name": "Idempotency-Key",
///         "in": "header",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Canonical nonnil UUID. Same key and unchanged input returns the saved operation without replaying its mutation."
///       },
///       {
///         "name": "expected_revision",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "pattern": "^[1-9][0-9]*$"
///         }
///       }
///     ],
///     "responses": {
///       "202": {
///         "description": "Saved operation accepted",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/MediaAssetMutation"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed or unsupported request fields"
///       },
///       "401": {
///         "description": "Missing, expired or revoked API key"
///       },
///       "403": {
///         "description": "Workspace or key policy refuses access"
///       },
///       "404": {
///         "description": "Owned object or model unavailable"
///       },
///       "409": {
///         "description": "Changed input, stale revision, unresolved identity or route conflict"
///       },
///       "413": {
///         "description": "Request exceeds its bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not support asset management"
///       },
///       "502": {
///         "description": "Provider read failed safely"
///       },
///       "503": {
///         "description": "Credential, capacity or bounded storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(super) async fn delete_asset(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    input: Result<Query<DeleteQuery>, QueryRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let input = query(input)?;
    mutate(
        &state,
        &headers,
        &input.model,
        WorkspaceProviderAssetMutation::DeleteAsset {
            asset_id: id,
            expected_revision: revision(input.expected_revision)?,
        },
        FastRouterAction::DeleteAsset,
    )
    .await
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct ListQuery {
    model: String,
    after: Option<Uuid>,
    limit: Option<u32>,
    group_id: Option<Uuid>,
}
fn page_limit(value: Option<u32>) -> Result<i64, ApiError> {
    let value = value.unwrap_or(50);
    if !(1..=100).contains(&value) {
        return Err(ApiError::invalid_request("limit must be between 1 and 100"));
    }
    Ok(i64::from(value))
}
/// ```openapi
/// {
///   "path": "/v1/media/asset-groups",
///   "method": "get",
///   "operation": {
///     "operationId": "list_groupsProviderAsset",
///     "summary": "List saved workspace Provider groups",
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Lists only locally saved owned rows; it never performs a global Provider list request.",
///     "tags": [
///       "Media"
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       },
///       {
///         "name": "after",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "limit",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 100,
///           "default": 50
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Owned metadata",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/MediaAssetGroupPage"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed or unsupported request fields"
///       },
///       "401": {
///         "description": "Missing, expired or revoked API key"
///       },
///       "403": {
///         "description": "Workspace or key policy refuses access"
///       },
///       "404": {
///         "description": "Owned object or model unavailable"
///       },
///       "409": {
///         "description": "Changed input, stale revision, unresolved identity or route conflict"
///       },
///       "413": {
///         "description": "Request exceeds its bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not support asset management"
///       },
///       "502": {
///         "description": "Provider read failed safely"
///       },
///       "503": {
///         "description": "Credential, capacity or bounded storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(super) async fn list_groups(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Query<ListQuery>, QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let input = query(input)?;
    if input.group_id.is_some() {
        return Err(ApiError::invalid_request(
            "group_id is only an asset filter",
        ));
    }
    let principal = state.authorize_api_headers(&headers).await?;
    admit(&state, &principal, &input.model).await?;
    let data = state
        .store
        .workspace_provider_asset_groups(
            &principal,
            &input.model,
            input.after,
            page_limit(input.limit)?,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":data.data,"next_cursor":data.next_cursor}),
    ))
}
/// ```openapi
/// {
///   "path": "/v1/media/assets",
///   "method": "get",
///   "operation": {
///     "operationId": "list_assetsProviderAsset",
///     "summary": "List saved workspace Provider assets",
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Lists only locally saved owned rows; it never performs a global Provider list request.",
///     "tags": [
///       "Media"
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       },
///       {
///         "name": "after",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "limit",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 100,
///           "default": 50
///         }
///       },
///       {
///         "name": "group_id",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Owned metadata",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/MediaAssetPage"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed or unsupported request fields"
///       },
///       "401": {
///         "description": "Missing, expired or revoked API key"
///       },
///       "403": {
///         "description": "Workspace or key policy refuses access"
///       },
///       "404": {
///         "description": "Owned object or model unavailable"
///       },
///       "409": {
///         "description": "Changed input, stale revision, unresolved identity or route conflict"
///       },
///       "413": {
///         "description": "Request exceeds its bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not support asset management"
///       },
///       "502": {
///         "description": "Provider read failed safely"
///       },
///       "503": {
///         "description": "Credential, capacity or bounded storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(super) async fn list_assets(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Query<ListQuery>, QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let input = query(input)?;
    let principal = state.authorize_api_headers(&headers).await?;
    admit(&state, &principal, &input.model).await?;
    let data = state
        .store
        .workspace_provider_assets(
            &principal,
            &input.model,
            input.group_id,
            input.after,
            page_limit(input.limit)?,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":data.data,"next_cursor":data.next_cursor}),
    ))
}
/// ```openapi
/// {
///   "path": "/v1/media/asset-groups/{id}",
///   "method": "get",
///   "operation": {
///     "operationId": "get_groupProviderAsset",
///     "summary": "Read a saved Provider group",
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Reads locally saved metadata only; unknown operation states require explicit reconciliation.",
///     "tags": [
///       "Media"
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "id",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Owned metadata",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/MediaAssetGroup"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed or unsupported request fields"
///       },
///       "401": {
///         "description": "Missing, expired or revoked API key"
///       },
///       "403": {
///         "description": "Workspace or key policy refuses access"
///       },
///       "404": {
///         "description": "Owned object or model unavailable"
///       },
///       "409": {
///         "description": "Changed input, stale revision, unresolved identity or route conflict"
///       },
///       "413": {
///         "description": "Request exceeds its bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not support asset management"
///       },
///       "502": {
///         "description": "Provider read failed safely"
///       },
///       "503": {
///         "description": "Credential, capacity or bounded storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(super) async fn get_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    input: Result<Query<ModelQuery>, QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let input = query(input)?;
    let principal = state.authorize_api_headers(&headers).await?;
    let route = admit(&state, &principal, &input.model).await?;
    let data = state
        .store
        .workspace_provider_asset_group(&principal, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    if data.model != input.model
        || data.vendor_id() != route.vendor_id()
        || data.vendor_revision() != route.vendor_revision()
        || data.private_upstream_model() != route.upstream_model()
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({"data":data})))
}
/// ```openapi
/// {
///   "path": "/v1/media/assets/{id}",
///   "method": "get",
///   "operation": {
///     "operationId": "get_assetProviderAsset",
///     "summary": "Read a saved Provider asset",
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Reads locally saved metadata only; unknown operation states require explicit reconciliation.",
///     "tags": [
///       "Media"
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "id",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Owned metadata",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/MediaAsset"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed or unsupported request fields"
///       },
///       "401": {
///         "description": "Missing, expired or revoked API key"
///       },
///       "403": {
///         "description": "Workspace or key policy refuses access"
///       },
///       "404": {
///         "description": "Owned object or model unavailable"
///       },
///       "409": {
///         "description": "Changed input, stale revision, unresolved identity or route conflict"
///       },
///       "413": {
///         "description": "Request exceeds its bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not support asset management"
///       },
///       "502": {
///         "description": "Provider read failed safely"
///       },
///       "503": {
///         "description": "Credential, capacity or bounded storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(super) async fn get_asset(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    input: Result<Query<ModelQuery>, QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let input = query(input)?;
    let principal = state.authorize_api_headers(&headers).await?;
    let route = admit(&state, &principal, &input.model).await?;
    let data = state
        .store
        .workspace_provider_asset(&principal, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    if data.model != input.model
        || data.vendor_id() != route.vendor_id()
        || data.vendor_revision() != route.vendor_revision()
        || data.private_upstream_model() != route.upstream_model()
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({"data":data})))
}
/// ```openapi
/// {
///   "path": "/v1/media/asset-operations/{id}",
///   "method": "get",
///   "operation": {
///     "operationId": "get_operationProviderAsset",
///     "summary": "Read a saved Provider mutation operation",
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Reads locally saved metadata only; unknown operation states require explicit reconciliation.",
///     "tags": [
///       "Media"
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "id",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Owned metadata",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/MediaAssetOperation"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed or unsupported request fields"
///       },
///       "401": {
///         "description": "Missing, expired or revoked API key"
///       },
///       "403": {
///         "description": "Workspace or key policy refuses access"
///       },
///       "404": {
///         "description": "Owned object or model unavailable"
///       },
///       "409": {
///         "description": "Changed input, stale revision, unresolved identity or route conflict"
///       },
///       "413": {
///         "description": "Request exceeds its bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not support asset management"
///       },
///       "502": {
///         "description": "Provider read failed safely"
///       },
///       "503": {
///         "description": "Credential, capacity or bounded storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(super) async fn get_operation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    input: Result<Query<ModelQuery>, QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let input = query(input)?;
    let principal = state.authorize_api_headers(&headers).await?;
    let route = admit(&state, &principal, &input.model).await?;
    let data = state
        .store
        .workspace_provider_asset_operation(&principal, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    if data.model != input.model
        || data.vendor_id() != route.vendor_id()
        || data.vendor_revision() != route.vendor_revision()
        || data.private_upstream_model() != route.upstream_model()
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({"data":data})))
}
/// ```openapi
/// {
///   "path": "/v1/media/asset-groups/{id}/refresh",
///   "method": "post",
///   "operation": {
///     "operationId": "refresh_groupProviderAsset",
///     "summary": "Refresh one owned Provider group",
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Performs one explicit read of the original owned Provider reference and saves validated metadata. This is not a generation or mutation retry.",
///     "tags": [
///       "Media"
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "id",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Owned metadata",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/MediaAssetGroup"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed or unsupported request fields"
///       },
///       "401": {
///         "description": "Missing, expired or revoked API key"
///       },
///       "403": {
///         "description": "Workspace or key policy refuses access"
///       },
///       "404": {
///         "description": "Owned object or model unavailable"
///       },
///       "409": {
///         "description": "Changed input, stale revision, unresolved identity or route conflict"
///       },
///       "413": {
///         "description": "Request exceeds its bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not support asset management"
///       },
///       "502": {
///         "description": "Provider read failed safely"
///       },
///       "503": {
///         "description": "Credential, capacity or bounded storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(super) async fn refresh_group(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    input: Result<Query<ModelQuery>, QueryRejection>,
    payload: Bytes,
) -> Result<Json<Value>, ApiError> {
    if !payload.is_empty() {
        return Err(ApiError::invalid_request(
            "Refresh accepts an empty body only",
        ));
    }
    let input = query(input)?;
    let principal = state.authorize_api_headers(&headers).await?;
    let route = admit(&state, &principal, &input.model).await?;
    let saved = state
        .store
        .workspace_provider_asset_group(&principal, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    if saved.model != input.model
        || saved.vendor_id() != route.vendor_id()
        || saved.vendor_revision() != route.vendor_revision()
        || saved.private_upstream_model() != route.upstream_model()
    {
        return Err(ApiError::not_found());
    }
    let reference = niu_media::fastrouter_domain::FastRouterProviderReference::parse(
        saved
            .private_reference()
            .ok_or_else(ApiError::unavailable)?,
    )
    .map_err(|_| ApiError::unavailable())?;
    let response = client(&state, &route)?
        .execute(
            FastRouterAction::GetAssetGroup,
            &niu_media::fastrouter_domain::reference_body(&reference),
            limits(&state),
        )
        .await
        .map_err(|_| ApiError::upstream())?;
    let observed =
        niu_media::fastrouter_domain::decode_group(&response).map_err(|_| ApiError::upstream())?;
    if observed.private_reference().private_ref() != reference.private_ref() {
        return Err(ApiError::upstream());
    }
    let data = state
        .store
        .observe_workspace_provider_asset_group(&principal, id, &route, &observed)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data})))
}
/// ```openapi
/// {
///   "path": "/v1/media/assets/{id}/refresh",
///   "method": "post",
///   "operation": {
///     "operationId": "refresh_assetProviderAsset",
///     "summary": "Refresh one owned Provider asset",
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Supplier or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Performs one explicit read of the original owned Provider reference and saves validated metadata. This is not a generation or mutation retry.",
///     "tags": [
///       "Media"
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "id",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Owned metadata",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/MediaAsset"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed or unsupported request fields"
///       },
///       "401": {
///         "description": "Missing, expired or revoked API key"
///       },
///       "403": {
///         "description": "Workspace or key policy refuses access"
///       },
///       "404": {
///         "description": "Owned object or model unavailable"
///       },
///       "409": {
///         "description": "Changed input, stale revision, unresolved identity or route conflict"
///       },
///       "413": {
///         "description": "Request exceeds its bounded size"
///       },
///       "501": {
///         "description": "Selected channel does not support asset management"
///       },
///       "502": {
///         "description": "Provider read failed safely"
///       },
///       "503": {
///         "description": "Credential, capacity or bounded storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(super) async fn refresh_asset(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    input: Result<Query<ModelQuery>, QueryRejection>,
    payload: Bytes,
) -> Result<Json<Value>, ApiError> {
    if !payload.is_empty() {
        return Err(ApiError::invalid_request(
            "Refresh accepts an empty body only",
        ));
    }
    let input = query(input)?;
    let principal = state.authorize_api_headers(&headers).await?;
    let route = admit(&state, &principal, &input.model).await?;
    let saved = state
        .store
        .workspace_provider_asset(&principal, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    if saved.model != input.model
        || saved.vendor_id() != route.vendor_id()
        || saved.vendor_revision() != route.vendor_revision()
        || saved.private_upstream_model() != route.upstream_model()
    {
        return Err(ApiError::not_found());
    }
    if !saved.has_acknowledged_creation() {
        return Err(ApiError::unavailable());
    }
    let parent = niu_media::fastrouter_domain::FastRouterProviderReference::parse(
        saved
            .private_group_reference()
            .ok_or_else(ApiError::unavailable)?,
    )
    .map_err(|_| ApiError::unavailable())?;
    let reference = niu_media::fastrouter_domain::FastRouterProviderReference::parse(
        saved
            .private_reference()
            .ok_or_else(ApiError::unavailable)?,
    )
    .map_err(|_| ApiError::unavailable())?;
    let response = client(&state, &route)?
        .execute(
            FastRouterAction::GetAsset,
            &niu_media::fastrouter_domain::reference_body(&reference),
            limits(&state),
        )
        .await
        .map_err(|_| ApiError::upstream())?;
    let observed =
        niu_media::fastrouter_domain::decode_owned_asset_read(&response, &reference, &parent)
            .map_err(|_| ApiError::upstream())?;
    if observed.private_reference().private_ref() != reference.private_ref() {
        return Err(ApiError::upstream());
    }
    let data = state
        .store
        .observe_workspace_provider_asset(&principal, id, &route, &observed)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data})))
}
