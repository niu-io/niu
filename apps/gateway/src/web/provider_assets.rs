//! Workspace-owned Provider assets. No global upstream listing, inference,
//! processing qualification, mutation replay or public Provider identity.
use super::media_authorization::{MediaId, MediaPrincipal};
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    body::Bytes,
    extract::{
        Query, State,
        rejection::{JsonRejection, QueryRejection},
    },
    http::{HeaderMap, StatusCode},
};
use niu_media::fastrouter_actions::{
    FastRouterAction, FastRouterActionClient, FastRouterActionError, FastRouterActionLimits,
};
use niu_media::fastrouter_domain::{
    FastRouterAssetKind, decode_asset_delete_acknowledgement, decode_asset_update_acknowledgement,
    decode_created_reference, decode_group_update_acknowledgement,
};
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
pub(super) enum AssetKind {
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

#[derive(Default)]
pub(super) struct AdmissionContext {
    published: Option<Option<std::sync::Arc<crate::vendors::publication::Published>>>,
    principal_auth: Option<PrincipalAdmissionAuth>,
}

struct PrincipalAdmissionAuth {
    snapshot: niu_storage::GuardrailSnapshot,
    current_key: Principal,
    policies: Option<Vec<crate::guardrails::PolicyDraft>>,
}

pub(super) async fn admit(
    state: &AppState,
    principal: &Principal,
    model: &str,
) -> Result<WorkspaceProviderAssetRoute, ApiError> {
    let mut context = AdmissionContext::default();
    admit_with_context(state, principal, model, &mut context).await
}

pub(super) async fn admit_with_context(
    state: &AppState,
    principal: &Principal,
    model: &str,
    context: &mut AdmissionContext,
) -> Result<WorkspaceProviderAssetRoute, ApiError> {
    if model.is_empty()
        || model.len() > 256
        || model.trim() != model
        || model.chars().any(char::is_control)
    {
        return Err(ApiError::invalid_request("Invalid model"));
    }
    let scope = principal.scope();
    let published = match &context.published {
        Some(published) => published.clone(),
        None => {
            let snapshot = crate::vendors::publication::snapshot(state).await?;
            context.published = Some(snapshot.clone());
            snapshot
        }
    };
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
    let auth = match &mut context.principal_auth {
        Some(auth) => auth,
        None => {
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
            let current_key = state
                .store
                .dashboard_key_with_ip(
                    scope,
                    principal.key_id(),
                    crate::request_source::current_ip(),
                )
                .await
                .map_err(ApiError::from_store)?;
            context.principal_auth.insert(PrincipalAdmissionAuth {
                snapshot,
                current_key,
                policies: None,
            })
        }
    };
    if !auth.current_key.allows_model(model) {
        return Err(ApiError::not_found());
    }
    let policies = match &auth.policies {
        Some(policies) => policies,
        None => {
            let mut parsed = Vec::with_capacity(2);
            for policy in [&auth.snapshot.workspace_policy, &auth.snapshot.key_policy]
                .into_iter()
                .flatten()
            {
                let draft: crate::guardrails::PolicyDraft =
                    serde_json::from_value(policy.clone()).map_err(|_| ApiError::forbidden())?;
                draft.validate_shape().map_err(|_| ApiError::forbidden())?;
                parsed.push(draft);
            }
            auth.policies.insert(parsed)
        }
    };
    for draft in policies {
        if !crate::guardrails::EffectiveAccess::compose([draft.models.clone()]).permits(model)
            || !crate::guardrails::EffectiveAccess::compose([draft.providers.clone()])
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
#[derive(Clone, PartialEq, Eq, Hash)]
struct FastRouterClientCacheKey {
    vendor_id: Uuid,
    vendor_revision: i64,
    model_revision: i64,
    api_base: String,
    upstream_model: String,
    credential_ciphertext: Vec<u8>,
}

const FASTROUTER_CLIENT_CACHE_TTL: Duration = Duration::from_secs(300);
const FASTROUTER_CLIENT_CACHE_CAPACITY: usize = 256;

static FASTROUTER_ACTION_CLIENTS: std::sync::LazyLock<
    std::sync::Mutex<
        std::collections::HashMap<
            FastRouterClientCacheKey,
            (std::time::Instant, FastRouterActionClient),
        >,
    >,
> = std::sync::LazyLock::new(|| std::sync::Mutex::new(std::collections::HashMap::new()));

pub(super) fn client(
    state: &AppState,
    route: &WorkspaceProviderAssetRoute,
) -> Result<FastRouterActionClient, ApiError> {
    let cipher = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?;
    let cache_key = FastRouterClientCacheKey {
        vendor_id: route.vendor_id(),
        vendor_revision: route.vendor_revision(),
        model_revision: route.model_revision(),
        api_base: route.api_base().to_owned(),
        upstream_model: route.upstream_model().to_owned(),
        credential_ciphertext: route.credential_ciphertext().to_vec(),
    };
    let now = std::time::Instant::now();
    if let Ok(mut guard) = FASTROUTER_ACTION_CLIENTS.lock() {
        if let Some((cached_at, client)) = guard.get(&cache_key) {
            if now.duration_since(*cached_at) < FASTROUTER_CLIENT_CACHE_TTL {
                return Ok(client.clone());
            }
        }
        guard.remove(&cache_key);
    }
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
    let key = cipher
        .open(route.vendor_id(), route.credential_ciphertext())
        .map_err(|_| ApiError::unavailable())?;
    let action_client =
        FastRouterActionClient::new(endpoint.as_str(), &key, route.upstream_model())
            .map_err(|_| ApiError::unavailable())?;
    if let Ok(mut guard) = FASTROUTER_ACTION_CLIENTS.lock() {
        if guard.len() >= FASTROUTER_CLIENT_CACHE_CAPACITY {
            guard.retain(|_, (ts, _)| now.duration_since(*ts) < FASTROUTER_CLIENT_CACHE_TTL);
            if guard.len() >= FASTROUTER_CLIENT_CACHE_CAPACITY
                && let Some(oldest_key) = guard
                    .iter()
                    .min_by_key(|(_, (ts, _))| *ts)
                    .map(|(k, _)| k.clone())
            {
                guard.remove(&oldest_key);
            }
        }
        guard.insert(cache_key, (now, action_client.clone()));
    }
    Ok(action_client)
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
    principal: Principal,
    model: &str,
    mutation: WorkspaceProviderAssetMutation,
    action: FastRouterAction,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let route = admit(state, &principal, model).await?;
    mutate_with_route(state, headers, principal, route, mutation, action).await
}

async fn mutate_with_route(
    state: &AppState,
    headers: &HeaderMap,
    principal: Principal,
    route: WorkspaceProviderAssetRoute,
    mutation: WorkspaceProviderAssetMutation,
    action: FastRouterAction,
) -> Result<(StatusCode, Json<Value>), ApiError> {
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
    if state
        .store
        .claim_workspace_provider_asset_operation(&principal, operation_id, &route)
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
                            http_status: Some(response.http_status()),
                            request_id: response.request_id().map(str::to_owned),
                        },
                    }
                } else if response
                    .result()
                    .as_object()
                    .is_some_and(|result| result.is_empty())
                    || action == FastRouterAction::UpdateAssetGroup
                        && decode_group_update_acknowledgement(&response, prepared.request_body())
                            .is_ok()
                    || action == FastRouterAction::UpdateAsset
                        && decode_asset_update_acknowledgement(&response, prepared.request_body())
                            .is_ok()
                    || action == FastRouterAction::DeleteAsset
                        && decode_asset_delete_acknowledgement(&response, prepared.request_body())
                            .is_ok()
                {
                    WorkspaceProviderAssetOutcome::Acknowledged {
                        provider_reference: None,
                    }
                } else {
                    WorkspaceProviderAssetOutcome::Unknown {
                        http_status: Some(response.http_status()),
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
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Claims one durable operation before one upstream mutation. After-send errors retain unknown and never authorize automatic replay; accepted operation does not imply Provider processing readiness.",
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
///         "updated_at_ms",
///         "observation"
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
///         },
///         "observation": {
///           "oneOf": [
///             {
///               "$ref": "#/components/schemas/MediaAssetGroupObservation"
///             },
///             {
///               "type": "null"
///             }
///           ],
///           "description": "Last successful identity-validated Provider Get metadata, independent of mutation status. Null before any successful read. An observation never acknowledges or unblocks unknown writes, grants dispatch or proves an uncertain write completed."
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
///         "updated_at_ms",
///         "observation"
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
///         },
///         "observation": {
///           "oneOf": [
///             {
///               "$ref": "#/components/schemas/MediaAssetObservation"
///             },
///             {
///               "type": "null"
///             }
///           ],
///           "description": "Last successful identity-validated Provider Get metadata, independent of mutation status. Null before any successful read. An observation never acknowledges or unblocks unknown writes, grants dispatch or proves an uncertain write completed."
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
///     },
///     "MediaAssetGroupObservation": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "source",
///         "status",
///         "name",
///         "observed_at_ms",
///         "description"
///       ],
///       "properties": {
///         "source": {
///           "type": "string",
///           "const": "provider_get"
///         },
///         "status": {
///           "type": "string",
///           "const": "present"
///         },
///         "name": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "maxLength": 64
///         },
///         "observed_at_ms": {
///           "type": "integer",
///           "format": "int64",
///           "description": "Server time of the saved successful Provider read. Historical observation, not a current availability guarantee."
///         },
///         "description": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "maxLength": 300
///         }
///       }
///     },
///     "MediaAssetObservation": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "source",
///         "status",
///         "name",
///         "observed_at_ms"
///       ],
///       "properties": {
///         "source": {
///           "type": "string",
///           "const": "provider_get"
///         },
///         "status": {
///           "type": "string",
///           "enum": [
///             "processing",
///             "active",
///             "failed"
///           ]
///         },
///         "name": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "maxLength": 64
///         },
///         "observed_at_ms": {
///           "type": "integer",
///           "format": "int64",
///           "description": "Server time of the saved successful Provider read. Historical observation, not a current availability guarantee."
///         }
///       }
///     }
///   }
/// }
/// ```
pub(super) async fn create_group(
    State(state): State<AppState>,
    MediaPrincipal(principal): MediaPrincipal,
    headers: HeaderMap,
    input: Result<Json<CreateGroup>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let input = body(input)?;
    mutate(
        &state,
        &headers,
        principal,
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
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Claims one durable operation before one upstream mutation. After-send errors retain unknown and never authorize automatic replay; accepted operation does not imply Provider processing readiness.",
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
    MediaPrincipal(principal): MediaPrincipal,
    headers: HeaderMap,
    MediaId(id): MediaId,
    input: Result<Json<UpdateGroup>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let input = body(input)?;
    mutate(
        &state,
        &headers,
        principal,
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
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Claims one durable operation before one upstream mutation. After-send errors retain unknown and never authorize automatic replay; accepted operation does not imply Provider processing readiness. Group deletion is destructive and includes its Provider assets.",
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
    MediaPrincipal(principal): MediaPrincipal,
    headers: HeaderMap,
    MediaId(id): MediaId,
    input: Result<Query<DeleteQuery>, QueryRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let input = query(input)?;
    mutate(
        &state,
        &headers,
        principal,
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
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Claims one durable operation before one upstream mutation. After-send errors retain unknown and never authorize automatic replay; accepted operation does not imply Provider processing readiness.",
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
    MediaPrincipal(principal): MediaPrincipal,
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
        principal,
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
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Claims one durable operation before one upstream mutation. After-send errors retain unknown and never authorize automatic replay; accepted operation does not imply Provider processing readiness.",
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
    MediaPrincipal(principal): MediaPrincipal,
    headers: HeaderMap,
    MediaId(id): MediaId,
    input: Result<Json<RenameAsset>, JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let input = body(input)?;
    mutate(
        &state,
        &headers,
        principal,
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
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Claims one durable operation before one upstream mutation. After-send errors retain unknown and never authorize automatic replay; accepted operation does not imply Provider processing readiness.",
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
    MediaPrincipal(principal): MediaPrincipal,
    headers: HeaderMap,
    MediaId(id): MediaId,
    input: Result<Query<DeleteQuery>, QueryRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let input = query(input)?;
    mutate(
        &state,
        &headers,
        principal,
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
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Lists only locally saved owned rows; it never performs a global Provider list request.",
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
    MediaPrincipal(principal): MediaPrincipal,
    input: Result<Query<ListQuery>, QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let input = query(input)?;
    if input.group_id.is_some() {
        return Err(ApiError::invalid_request(
            "group_id is only an asset filter",
        ));
    }
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
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Lists only locally saved owned rows; it never performs a global Provider list request.",
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
    MediaPrincipal(principal): MediaPrincipal,
    input: Result<Query<ListQuery>, QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let input = query(input)?;
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
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Reads locally saved metadata only; unknown operation states require explicit reconciliation.",
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
    MediaPrincipal(principal): MediaPrincipal,
    MediaId(id): MediaId,
    input: Result<Query<ModelQuery>, QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let input = query(input)?;
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
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Reads locally saved metadata only; unknown operation states require explicit reconciliation.",
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
    MediaPrincipal(principal): MediaPrincipal,
    MediaId(id): MediaId,
    input: Result<Query<ModelQuery>, QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let input = query(input)?;
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
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Reads locally saved metadata only; unknown operation states require explicit reconciliation.",
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
    MediaPrincipal(principal): MediaPrincipal,
    MediaId(id): MediaId,
    input: Result<Query<ModelQuery>, QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let input = query(input)?;
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
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Performs one explicit read of the original owned Provider reference and saves validated metadata. This is not a generation or mutation retry. Successful identity-validated reads persist nullable observation metadata even while the resource status and original uncertain operation remain unknown. Unknown writes remain blocked; this read does not redispatch, infer write completion, acknowledge a delete from 404, discover an unknown creation ID or grant material reuse. Failed reads preserve the previous observation and its timestamp.",
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
    MediaPrincipal(principal): MediaPrincipal,
    MediaId(id): MediaId,
    input: Result<Query<ModelQuery>, QueryRejection>,
    payload: Bytes,
) -> Result<Json<Value>, ApiError> {
    if !payload.is_empty() {
        return Err(ApiError::invalid_request(
            "Refresh accepts an empty body only",
        ));
    }
    let input = query(input)?;
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
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Performs one explicit read of the original owned Provider reference and saves validated metadata. This is not a generation or mutation retry. Successful identity-validated reads persist nullable observation metadata even while the resource status and original uncertain operation remain unknown. Unknown writes remain blocked; this read does not redispatch, infer write completion, acknowledge a delete from 404, discover an unknown creation ID or grant material reuse. Failed reads preserve the previous observation and its timestamp.",
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
    MediaPrincipal(principal): MediaPrincipal,
    MediaId(id): MediaId,
    input: Result<Query<ModelQuery>, QueryRejection>,
    payload: Bytes,
) -> Result<Json<Value>, ApiError> {
    if !payload.is_empty() {
        return Err(ApiError::invalid_request(
            "Refresh accepts an empty body only",
        ));
    }
    let input = query(input)?;
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

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct OperationListQuery {
    model: String,
    after: Option<Uuid>,
    limit: Option<u32>,
}
/// ```openapi
/// {
///   "path": "/v1/media/asset-operations",
///   "method": "get",
///   "operation": {
///     "operationId": "list_operationsProviderAsset",
///     "summary": "List saved Provider mutation operations",
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Reads locally saved metadata only; unknown operation states require explicit reconciliation. This read never calls the Provider or retries a mutation. Records are workspace-shared under current selected-key authority and exact model/account binding. Unknown remains uncertain; prepared is a persisted state, not permission to retry. A missing record is not proof that the original request was never sent. Newest-first immutable creation time and UUID tie-breaker ordering. Resource deletion does not remove operation history. limit defaults to 50.",
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
///         },
///         "description": "Cursor from this exact authorized model/account; invalid or mismatched cursor is rejected."
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
///         "description": "Bounded saved operation page",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "next_cursor"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/MediaAssetOperation"
///                   }
///                 },
///                 "next_cursor": {
///                   "type": ["string", "null"],
///                   "format": "uuid"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid model, UUID, limit or cursor"
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
pub(super) async fn list_operations(
    State(state): State<AppState>,
    MediaPrincipal(principal): MediaPrincipal,
    input: Result<Query<OperationListQuery>, QueryRejection>,
) -> Result<(HeaderMap, Json<Value>), ApiError> {
    let input = query(input)?;
    let route = admit(&state, &principal, &input.model).await?;
    let data = state
        .store
        .workspace_provider_asset_operations(
            &principal,
            &route,
            input.after,
            page_limit(input.limit)?,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((operation_read_headers(), Json(json!(data))))
}
/// ```openapi
/// {
///   "path": "/v1/media/asset-operations/by-idempotency/{id}",
///   "method": "get",
///   "operation": {
///     "operationId": "get_operation_by_idempotencyProviderAsset",
///     "summary": "Read a saved Provider operation by request idempotency UUID",
///     "description": "Requires a workspace inference API key, current model permissions, composed workspace/key model and Provider grants, an enabled selectable credential and eligible Provider or matching personal owner. Only the explicitly configured fastrouter-actions-v1 model channel is supported. Opaque Provider references, credentials, private source URLs and upstream raw responses are never returned. Reads locally saved metadata only; unknown operation states require explicit reconciliation. This read never calls the Provider or retries a mutation. Records are workspace-shared under current selected-key authority and exact model/account binding. Unknown remains uncertain; prepared is a persisted state, not permission to retry. A missing record is not proof that the original request was never sent.",
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
///         },
///         "description": "Original canonical nonnil Idempotency-Key UUID, not the operation ID."
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
///         "description": "Invalid model, UUID, limit or cursor"
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
pub(super) async fn get_operation_by_idempotency(
    State(state): State<AppState>,
    MediaPrincipal(principal): MediaPrincipal,
    MediaId(id): MediaId,
    input: Result<Query<ModelQuery>, QueryRejection>,
) -> Result<(HeaderMap, Json<Value>), ApiError> {
    if id.is_nil() {
        return Err(ApiError::invalid_request("Invalid idempotency UUID"));
    }
    let input = query(input)?;
    let route = admit(&state, &principal, &input.model).await?;
    let data = state
        .store
        .workspace_provider_asset_operation_by_idempotency(&principal, id)
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
    Ok((operation_read_headers(), Json(json!({"data":data}))))
}
fn operation_read_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(
        axum::http::header::CACHE_CONTROL,
        axum::http::HeaderValue::from_static("no-store"),
    );
    headers
}

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub(super) enum OperationInput {
    CreateGroup {
        model: String,
        name: String,
        description: Option<String>,
    },
    UpdateGroup {
        model: String,
        group_id: Uuid,
        name: Option<String>,
        description: Option<String>,
        expected_revision: Option<String>,
    },
    DeleteGroup {
        model: String,
        group_id: Uuid,
        expected_revision: Option<String>,
    },
    CreateAsset {
        model: String,
        group_id: Uuid,
        url: String,
        name: Option<String>,
        kind: AssetKind,
    },
    RenameAsset {
        model: String,
        asset_id: Uuid,
        name: String,
        expected_revision: Option<String>,
    },
    DeleteAsset {
        model: String,
        asset_id: Uuid,
        expected_revision: Option<String>,
    },
}
impl OperationInput {
    fn mutation(
        self,
    ) -> Result<(String, WorkspaceProviderAssetMutation, FastRouterAction), ApiError> {
        use WorkspaceProviderAssetMutation as M;
        Ok(match self {
            Self::CreateGroup {
                model,
                name,
                description,
            } => (
                model,
                M::CreateGroup { name, description },
                FastRouterAction::CreateAssetGroup,
            ),
            Self::UpdateGroup {
                model,
                group_id,
                name,
                description,
                expected_revision,
            } => (
                model,
                M::UpdateGroup {
                    group_id,
                    name,
                    description,
                    expected_revision: revision(expected_revision)?,
                },
                FastRouterAction::UpdateAssetGroup,
            ),
            Self::DeleteGroup {
                model,
                group_id,
                expected_revision,
            } => (
                model,
                M::DeleteGroup {
                    group_id,
                    expected_revision: revision(expected_revision)?,
                },
                FastRouterAction::DeleteAssetGroup,
            ),
            Self::CreateAsset {
                model,
                group_id,
                url,
                name,
                kind,
            } => (
                model,
                M::CreateAsset {
                    group_id,
                    url,
                    name,
                    kind: match kind {
                        AssetKind::Image => FastRouterAssetKind::Image,
                        AssetKind::Video => FastRouterAssetKind::Video,
                        AssetKind::Audio => FastRouterAssetKind::Audio,
                    },
                },
                FastRouterAction::CreateAsset,
            ),
            Self::RenameAsset {
                model,
                asset_id,
                name,
                expected_revision,
            } => (
                model,
                M::RenameAsset {
                    asset_id,
                    name,
                    expected_revision: revision(expected_revision)?,
                },
                FastRouterAction::UpdateAsset,
            ),
            Self::DeleteAsset {
                model,
                asset_id,
                expected_revision,
            } => (
                model,
                M::DeleteAsset {
                    asset_id,
                    expected_revision: revision(expected_revision)?,
                },
                FastRouterAction::DeleteAsset,
            ),
        })
    }
}
fn required_idempotency(headers: &HeaderMap) -> Result<Uuid, ApiError> {
    if !headers.contains_key("idempotency-key") {
        return Err(ApiError::invalid_request("Idempotency-Key is required"));
    }
    idempotency(headers)
}

/// ```openapi
/// {
///   "path": "/v1/media/asset-operations/prepare",
///   "method": "post",
///   "operation": {
///     "operationId": "prepareProviderAssetOperation",
///     "summary": "Prepare a native material operation without dispatch",
///     "description": "Current selected key, exact model/account/channel and workspace Write authority required. Safe Niu references only; no Provider identifiers, source URLs, credentials or procurement prices returned. Commits the existing immutable request hash and resource binding without a Provider call. Same UUID and changed payload returns409. Full original payload is required for later dispatch; source URLs are not retained. Preparation is not Provider readiness.",
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
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Original canonical nonnil request UUID."
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Saved operation metadata",
///         "headers": {
///           "Cache-Control": {
///             "schema": {
///               "type": "string"
///             },
///             "description": "no-store"
///           }
///         },
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "group",
///                 "asset"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/MediaAssetOperation"
///                 },
///                 "group": {
///                   "anyOf": [
///                     {
///                       "$ref": "#/components/schemas/MediaAssetGroup"
///                     },
///                     {
///                       "type": "null"
///                     }
///                   ]
///                 },
///                 "asset": {
///                   "anyOf": [
///                     {
///                       "$ref": "#/components/schemas/MediaAsset"
///                     },
///                     {
///                       "type": "null"
///                     }
///                   ]
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid input or missing idempotency UUID"
///       },
///       "401": {
///         "description": "Missing expired or revoked key/session"
///       },
///       "403": {
///         "description": "Workspace Write or key policy refused"
///       },
///       "404": {
///         "description": "Owned preparation or model unavailable"
///       },
///       "409": {
///         "description": "Changed canonical input, stale revision, route or operation state conflict"
///       },
///       "413": {
///         "description": "Request exceeds16KiB"
///       },
///       "501": {
///         "description": "Channel unsupported"
///       },
///       "503": {
///         "description": "Storage or configuration unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "$ref": "#/components/schemas/MediaAssetOperationInput"
///           }
///         }
///       }
///     }
///   },
///   "schemas": {
///     "MediaAssetOperationInput": {
///       "oneOf": [
///         {
///           "type": "object",
///           "additionalProperties": false,
///           "required": [
///             "action",
///             "model",
///             "name"
///           ],
///           "properties": {
///             "action": {
///               "type": "string",
///               "const": "create_group"
///             },
///             "model": {
///               "type": "string"
///             },
///             "name": {
///               "type": "string"
///             },
///             "description": {
///               "type": "string"
///             }
///           }
///         },
///         {
///           "type": "object",
///           "additionalProperties": false,
///           "required": [
///             "action",
///             "model",
///             "group_id"
///           ],
///           "properties": {
///             "action": {
///               "type": "string",
///               "const": "update_group"
///             },
///             "model": {
///               "type": "string"
///             },
///             "group_id": {
///               "type": "string",
///               "format": "uuid"
///             },
///             "name": {
///               "type": "string"
///             },
///             "description": {
///               "type": "string"
///             },
///             "expected_revision": {
///               "type": "string",
///               "pattern": "^[1-9][0-9]*$"
///             }
///           }
///         },
///         {
///           "type": "object",
///           "additionalProperties": false,
///           "required": [
///             "action",
///             "model",
///             "group_id"
///           ],
///           "properties": {
///             "action": {
///               "type": "string",
///               "const": "delete_group"
///             },
///             "model": {
///               "type": "string"
///             },
///             "group_id": {
///               "type": "string",
///               "format": "uuid"
///             },
///             "expected_revision": {
///               "type": "string",
///               "pattern": "^[1-9][0-9]*$"
///             }
///           }
///         },
///         {
///           "type": "object",
///           "additionalProperties": false,
///           "required": [
///             "action",
///             "model",
///             "group_id",
///             "url",
///             "kind"
///           ],
///           "properties": {
///             "action": {
///               "type": "string",
///               "const": "create_asset"
///             },
///             "model": {
///               "type": "string"
///             },
///             "group_id": {
///               "type": "string",
///               "format": "uuid"
///             },
///             "url": {
///               "type": "string",
///               "format": "uri",
///               "writeOnly": true
///             },
///             "name": {
///               "type": "string"
///             },
///             "kind": {
///               "type": "string",
///               "enum": [
///                 "image",
///                 "video",
///                 "audio"
///               ]
///             }
///           }
///         },
///         {
///           "type": "object",
///           "additionalProperties": false,
///           "required": [
///             "action",
///             "model",
///             "asset_id",
///             "name"
///           ],
///           "properties": {
///             "action": {
///               "type": "string",
///               "const": "rename_asset"
///             },
///             "model": {
///               "type": "string"
///             },
///             "asset_id": {
///               "type": "string",
///               "format": "uuid"
///             },
///             "name": {
///               "type": "string"
///             },
///             "expected_revision": {
///               "type": "string",
///               "pattern": "^[1-9][0-9]*$"
///             }
///           }
///         },
///         {
///           "type": "object",
///           "additionalProperties": false,
///           "required": [
///             "action",
///             "model",
///             "asset_id"
///           ],
///           "properties": {
///             "action": {
///               "type": "string",
///               "const": "delete_asset"
///             },
///             "model": {
///               "type": "string"
///             },
///             "asset_id": {
///               "type": "string",
///               "format": "uuid"
///             },
///             "expected_revision": {
///               "type": "string",
///               "pattern": "^[1-9][0-9]*$"
///             }
///           }
///         }
///       ]
///     }
///   }
/// }
/// ```
pub(super) async fn prepare_operation(
    State(state): State<AppState>,
    MediaPrincipal(principal): MediaPrincipal,
    headers: HeaderMap,
    input: Result<Json<OperationInput>, JsonRejection>,
) -> Result<(HeaderMap, Json<Value>), ApiError> {
    let identity = required_idempotency(&headers)?;
    let (model, mutation, _) = body(input)?.mutation()?;
    let route = admit(&state, &principal, &model).await?;
    let prepared = state
        .store
        .prepare_workspace_provider_asset_operation(&principal, &route, mutation, identity)
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        operation_read_headers(),
        Json(
            json!({"data":prepared.operation(),"group":prepared.group(),"asset":prepared.asset()}),
        ),
    ))
}

/// ```openapi
/// {
///   "path": "/v1/media/asset-operations/{id}/dispatch",
///   "method": "post",
///   "operation": {
///     "operationId": "dispatchProviderAssetOperation",
///     "summary": "Explicitly dispatch an existing native material preparation",
///     "description": "Current selected key, exact model/account/channel and workspace Write authority required. Safe Niu references only; no Provider identifiers, source URLs, credentials or procurement prices returned. Requires an already saved operation matching the original idempotency UUID and full canonical input. Never creates a missing preparation. Atomic prepared-to-unknown claim precedes a single Provider call; unknown and terminal records never redispatch. No automatic retries.",
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
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Original canonical nonnil request UUID."
///       }
///     ],
///     "responses": {
///       "202": {
///         "description": "Saved operation metadata",
///         "headers": {
///           "Cache-Control": {
///             "schema": {
///               "type": "string"
///             },
///             "description": "no-store"
///           }
///         },
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "group",
///                 "asset"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/MediaAssetOperation"
///                 },
///                 "group": {
///                   "anyOf": [
///                     {
///                       "$ref": "#/components/schemas/MediaAssetGroup"
///                     },
///                     {
///                       "type": "null"
///                     }
///                   ]
///                 },
///                 "asset": {
///                   "anyOf": [
///                     {
///                       "$ref": "#/components/schemas/MediaAsset"
///                     },
///                     {
///                       "type": "null"
///                     }
///                   ]
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid input or missing idempotency UUID"
///       },
///       "401": {
///         "description": "Missing expired or revoked key/session"
///       },
///       "403": {
///         "description": "Workspace Write or key policy refused"
///       },
///       "404": {
///         "description": "Owned preparation or model unavailable"
///       },
///       "409": {
///         "description": "Changed canonical input, stale revision, route or operation state conflict"
///       },
///       "413": {
///         "description": "Request exceeds16KiB"
///       },
///       "501": {
///         "description": "Channel unsupported"
///       },
///       "503": {
///         "description": "Storage or configuration unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "$ref": "#/components/schemas/MediaAssetOperationInput"
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(super) async fn dispatch_operation(
    State(state): State<AppState>,
    MediaPrincipal(principal): MediaPrincipal,
    headers: HeaderMap,
    MediaId(id): MediaId,
    input: Result<Json<OperationInput>, JsonRejection>,
) -> Result<(StatusCode, HeaderMap, Json<Value>), ApiError> {
    let identity = required_idempotency(&headers)?;
    let (model, mutation, action) = body(input)?.mutation()?;
    // Existing identity is mandatory: dispatch must never create an absent preparation.
    let route = admit(&state, &principal, &model).await?;
    let existing = state
        .store
        .workspace_provider_asset_operation_by_idempotency(&principal, identity)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    if existing.id != id || existing.model != model {
        return Err(ApiError::from_store(niu_storage::StoreError::Conflict));
    }
    let (status, result) =
        mutate_with_route(&state, &headers, principal, route, mutation, action).await?;
    Ok((status, operation_read_headers(), result))
}

/// ```openapi
/// {
///   "path": "/v1/media/asset-operations/{id}/cancel",
///   "method": "post",
///   "operation": {
///     "operationId": "cancelPreparedProviderAssetOperation",
///     "summary": "Cancel an unclaimed native material preparation",
///     "description": "Current selected key, exact model/account/channel and workspace Write authority required. Safe Niu references only; no Provider identifiers, source URLs, credentials or procurement prices returned. Only prepared can transition to not_sent; a not_sent replay is unchanged. Unknown or acknowledged returns409 and cannot be canceled. No Provider call. This key-scoped endpoint requires current original-key authority; use the workspace historical cancellation endpoint after key expiry or revocation.",
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
///         "description": "Saved operation metadata",
///         "headers": {
///           "Cache-Control": {
///             "schema": {
///               "type": "string"
///             },
///             "description": "no-store"
///           }
///         },
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
///         "description": "Invalid input or missing idempotency UUID"
///       },
///       "401": {
///         "description": "Missing expired or revoked key/session"
///       },
///       "403": {
///         "description": "Workspace Write or key policy refused"
///       },
///       "404": {
///         "description": "Owned preparation or model unavailable"
///       },
///       "409": {
///         "description": "Changed canonical input, stale revision, route or operation state conflict"
///       },
///       "413": {
///         "description": "Request exceeds16KiB"
///       },
///       "501": {
///         "description": "Channel unsupported"
///       },
///       "503": {
///         "description": "Storage or configuration unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(super) async fn cancel_operation(
    State(state): State<AppState>,
    MediaPrincipal(principal): MediaPrincipal,
    MediaId(id): MediaId,
    input: Result<Query<ModelQuery>, QueryRejection>,
) -> Result<(HeaderMap, Json<Value>), ApiError> {
    let model = query(input)?.model;
    let route = admit(&state, &principal, &model).await?;
    state
        .store
        .cancel_workspace_provider_asset_operation(&principal, id, &route)
        .await
        .map_err(ApiError::from_store)?;
    let operation = state
        .store
        .workspace_provider_asset_operation(&principal, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok((operation_read_headers(), Json(json!({"data":operation}))))
}

/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/media/asset-operations/{id}/cancel",
///   "method": "post",
///   "operation": {
///     "operationId": "cancelPreparedWorkspaceProviderAssetOperation",
///     "summary": "Abandon an unclaimed native operation after key expiry",
///     "description": "Current member workspace Write permission required, independent of inference-key expiry or revocation. Native operation history is workspace-shared. Exact workspace, Niu operation and immutable group model binding are checked under group-first locks. Only prepared becomes not_sent; unknown is never resolved, resent or canceled. No Provider client, calls, route reenabling or inference authority restoration. Repeated not_sent cancellation is unchanged. Original key and private account binding remain immutable.",
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
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "project",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
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
///         "description": "Preparation abandoned before claim",
///         "headers": {
///           "Cache-Control": {
///             "schema": {
///               "type": "string"
///             },
///             "description": "no-store"
///           }
///         },
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "required": [
///                     "status"
///                   ],
///                   "properties": {
///                     "status": {
///                       "type": "string",
///                       "const": "not_sent"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid path or query"
///       },
///       "401": {
///         "description": "Invalid member session"
///       },
///       "403": {
///         "description": "Current workspace Write denied"
///       },
///       "409": {
///         "description": "Unknown, acknowledged, foreign or mismatched model preparation"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(super) async fn cancel_historical_operation(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path((organization, project, id)): axum::extract::Path<(Uuid, Uuid, Uuid)>,
    input: Result<Query<ModelQuery>, QueryRejection>,
) -> Result<(HeaderMap, Json<Value>), ApiError> {
    let scope = niu_storage::TenantScope {
        organization_id: organization,
        project_id: project,
    };
    let auth = state
        .authorize_admin_headers(&headers, niu_storage::AdminPermission::Write)
        .await?;
    if !auth.permits_project(scope) {
        return Err(ApiError::forbidden());
    }
    let model = query(input)?.model;
    state
        .store
        .cancel_workspace_provider_asset_preparation(scope, id, &model)
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        operation_read_headers(),
        Json(json!({"data":{"status":"not_sent"}})),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct HistoricalOperationQuery {
    key_id: Uuid,
    model: String,
    context_group_id: Option<Uuid>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct HistoricalOperationListQuery {
    key_id: Uuid,
    model: String,
    context_group_id: Option<Uuid>,
    after: Option<Uuid>,
    limit: Option<u32>,
}
async fn authorize_historical_operations(
    state: &AppState,
    headers: &HeaderMap,
    scope: niu_storage::TenantScope,
) -> Result<(), ApiError> {
    let auth = state
        .authorize_admin_headers(headers, niu_storage::AdminPermission::Read)
        .await?;
    if !auth.permits_project(scope) {
        return Err(ApiError::forbidden());
    }
    Ok(())
}
/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/media/asset-operations",
///   "method": "get",
///   "operation": {
///     "operationId": "listHistoricalWorkspaceProviderAssetOperations",
///     "summary": "List historical native material operations",
///     "description": "Current authenticated workspace Read permission required. Native operation history is workspace-shared. Reads only immutable saved scope, original key, model and optional group/account context; does not authenticate or reenable an expired or revoked inference key, consult current model grants or catalog, select a default account, create a Provider client, call the Provider or retry a mutation. Safe Niu references and saved diagnostic metadata only; private Provider identifiers, source URLs, credentials and procurement prices are excluded. Prepared is not dispatch permission; unknown remains uncertain. A missing record does not prove an original request was never sent. Deleted resources retain operation history. Without context_group_id, includes all saved account bindings for this original key and model, without claiming they share an account. Newest-first creation time and UUID tie-breaker with exclusive cursor pagination. Validation and page share one bounded database snapshot; keep all filters fixed. This is a live history, not a fixed export snapshot.",
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
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "project",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "key_id",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Original saved workspace key reference; expiration or revocation does not restore or remove historical read permission."
///       },
///       {
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 512
///         },
///         "description": "Exact recorded Niu model alias. Never resolves a default Provider account."
///       },
///       {
///         "name": "context_group_id",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Existing scoped Niu group recorded under this original key/model; pins its immutable account, credential revision, model revision and upstream mapping without exposing those fields."
///       },
///       {
///         "name": "after",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Cursor from these exact original-key/model/account filters. Unknown or foreign cursors are refused."
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
///         "description": "Saved workspace operation metadata",
///         "headers": {
///           "Cache-Control": {
///             "schema": {
///               "type": "string"
///             },
///             "description": "no-store"
///           }
///         },
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "next_cursor"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/MediaAssetOperation"
///                   }
///                 },
///                 "next_cursor": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "format": "uuid"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid query, UUID or limit"
///       },
///       "401": {
///         "description": "Invalid or expired member session"
///       },
///       "403": {
///         "description": "Current workspace Read denied"
///       },
///       "404": {
///         "description": "Operation absent from this exact binding"
///       },
///       "409": {
///         "description": "Foreign original key, account context or pagination cursor"
///       },
///       "503": {
///         "description": "Bounded storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(super) async fn list_historical_operations(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path((organization, project)): axum::extract::Path<(Uuid, Uuid)>,
    input: Result<Query<HistoricalOperationListQuery>, QueryRejection>,
) -> Result<(HeaderMap, Json<Value>), ApiError> {
    let scope = niu_storage::TenantScope {
        organization_id: organization,
        project_id: project,
    };
    authorize_historical_operations(&state, &headers, scope).await?;
    let input = query(input)?;
    let page = state
        .store
        .historical_workspace_provider_asset_operations(
            scope,
            input.key_id,
            &input.model,
            input.context_group_id,
            input.after,
            page_limit(input.limit)?,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((operation_read_headers(), Json(json!(page))))
}
async fn historical_operation(
    state: &AppState,
    headers: &HeaderMap,
    scope: niu_storage::TenantScope,
    id: Uuid,
    input: HistoricalOperationQuery,
    by_idempotency: bool,
) -> Result<(HeaderMap, Json<Value>), ApiError> {
    authorize_historical_operations(state, headers, scope).await?;
    let operation = state
        .store
        .historical_workspace_provider_asset_operation(
            scope,
            input.key_id,
            &input.model,
            input.context_group_id,
            id,
            by_idempotency,
        )
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok((operation_read_headers(), Json(json!({"data":operation}))))
}
/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/media/asset-operations/{id}",
///   "method": "get",
///   "operation": {
///     "operationId": "getHistoricalWorkspaceProviderAssetOperation",
///     "summary": "Read historical native material operations",
///     "description": "Current authenticated workspace Read permission required. Native operation history is workspace-shared. Reads only immutable saved scope, original key, model and optional group/account context; does not authenticate or reenable an expired or revoked inference key, consult current model grants or catalog, select a default account, create a Provider client, call the Provider or retry a mutation. Safe Niu references and saved diagnostic metadata only; private Provider identifiers, source URLs, credentials and procurement prices are excluded. Prepared is not dispatch permission; unknown remains uncertain. A missing record does not prove an original request was never sent. Deleted resources retain operation history. Without context_group_id, includes all saved account bindings for this original key and model, without claiming they share an account.",
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
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "project",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
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
///         "name": "key_id",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Original saved workspace key reference; expiration or revocation does not restore or remove historical read permission."
///       },
///       {
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 512
///         },
///         "description": "Exact recorded Niu model alias. Never resolves a default Provider account."
///       },
///       {
///         "name": "context_group_id",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Existing scoped Niu group recorded under this original key/model; pins its immutable account, credential revision, model revision and upstream mapping without exposing those fields."
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Saved workspace operation metadata",
///         "headers": {
///           "Cache-Control": {
///             "schema": {
///               "type": "string"
///             },
///             "description": "no-store"
///           }
///         },
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
///         "description": "Invalid query, UUID or limit"
///       },
///       "401": {
///         "description": "Invalid or expired member session"
///       },
///       "403": {
///         "description": "Current workspace Read denied"
///       },
///       "404": {
///         "description": "Operation absent from this exact binding"
///       },
///       "409": {
///         "description": "Foreign original key, account context or pagination cursor"
///       },
///       "503": {
///         "description": "Bounded storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(super) async fn get_historical_operation(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path((organization, project, id)): axum::extract::Path<(Uuid, Uuid, Uuid)>,
    input: Result<Query<HistoricalOperationQuery>, QueryRejection>,
) -> Result<(HeaderMap, Json<Value>), ApiError> {
    historical_operation(
        &state,
        &headers,
        niu_storage::TenantScope {
            organization_id: organization,
            project_id: project,
        },
        id,
        query(input)?,
        false,
    )
    .await
}
/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/media/asset-operations/by-idempotency/{id}",
///   "method": "get",
///   "operation": {
///     "operationId": "getHistoricalWorkspaceProviderAssetOperationByIdempotency",
///     "summary": "Read historical native material operations",
///     "description": "Current authenticated workspace Read permission required. Native operation history is workspace-shared. Reads only immutable saved scope, original key, model and optional group/account context; does not authenticate or reenable an expired or revoked inference key, consult current model grants or catalog, select a default account, create a Provider client, call the Provider or retry a mutation. Safe Niu references and saved diagnostic metadata only; private Provider identifiers, source URLs, credentials and procurement prices are excluded. Prepared is not dispatch permission; unknown remains uncertain. A missing record does not prove an original request was never sent. Deleted resources retain operation history. Without context_group_id, includes all saved account bindings for this original key and model, without claiming they share an account. The path id is the original canonical nonnil request idempotency UUID, not an operation reference.",
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
///         "name": "organization",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "project",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
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
///         "name": "key_id",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Original saved workspace key reference; expiration or revocation does not restore or remove historical read permission."
///       },
///       {
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 512
///         },
///         "description": "Exact recorded Niu model alias. Never resolves a default Provider account."
///       },
///       {
///         "name": "context_group_id",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Existing scoped Niu group recorded under this original key/model; pins its immutable account, credential revision, model revision and upstream mapping without exposing those fields."
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Saved workspace operation metadata",
///         "headers": {
///           "Cache-Control": {
///             "schema": {
///               "type": "string"
///             },
///             "description": "no-store"
///           }
///         },
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
///         "description": "Invalid query, UUID or limit"
///       },
///       "401": {
///         "description": "Invalid or expired member session"
///       },
///       "403": {
///         "description": "Current workspace Read denied"
///       },
///       "404": {
///         "description": "Operation absent from this exact binding"
///       },
///       "409": {
///         "description": "Foreign original key, account context or pagination cursor"
///       },
///       "503": {
///         "description": "Bounded storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(super) async fn get_historical_operation_by_idempotency(
    State(state): State<AppState>,
    headers: HeaderMap,
    axum::extract::Path((organization, project, id)): axum::extract::Path<(Uuid, Uuid, Uuid)>,
    input: Result<Query<HistoricalOperationQuery>, QueryRejection>,
) -> Result<(HeaderMap, Json<Value>), ApiError> {
    historical_operation(
        &state,
        &headers,
        niu_storage::TenantScope {
            organization_id: organization,
            project_id: project,
        },
        id,
        query(input)?,
        true,
    )
    .await
}
