//! Explicit copies into the existing workspace material library, never generation.
use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{
    Json,
    extract::{Path, State, rejection::JsonRejection},
    http::HeaderMap,
};
use niu_storage::{
    AdminPermission, AssetLibraryCreate, AssetLibraryKind, AssetLibraryLimits,
    GenerationArtifactCapture, GenerationArtifactCaptureRequest, Principal, TenantScope,
};
use serde::Deserialize;
use std::sync::LazyLock;
use uuid::Uuid;
static CAPTURES: LazyLock<tokio::sync::Semaphore> =
    LazyLock::new(|| tokio::sync::Semaphore::new(2));
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::web) struct CaptureRequest {
    id: Uuid,
    name: String,
    mode: String,
    key_id: Option<Uuid>,
}
async fn owner(
    state: &AppState,
    headers: &HeaderMap,
    scope: TenantScope,
    permission: AdminPermission,
) -> Result<String, ApiError> {
    let authorization = state.authorize_admin_headers(headers, permission).await?;
    if !authorization.permits_project(scope) {
        return Err(ApiError::forbidden());
    }
    Ok(match authorization {
        AdminAuthorization::Installation => "installation".to_owned(),
        AdminAuthorization::Operator(operator) => format!("operator:{}", operator.id),
    })
}
fn kind(value: &str) -> Result<(), ApiError> {
    if !["video", "last_frame"].contains(&value) {
        return Err(ApiError::invalid_request("Unknown artifact kind"));
    }
    Ok(())
}
/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/generations/artifacts/{task}/{kind}/capture",
///   "method": "get",
///   "operation": {
///     "operationId": "retrieveGenerationsArtifactCapture",
///     "summary": "Read saved artifact capture status",
///     "description": "Current dashboard workspace Read permission and actor-visible original task required. Task/output identity is scoped; no Provider URLs, private references, credentials or costs are returned. Saved claim metadata only; no download, refresh, retry, generation or ledger mutation. Source lookup returns the stored/active outcome or newest failed request; missing/private task or missing capture404.",
///     "x-niu-implementation": "implemented",
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
///         "name": "task",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "kind",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "enum": [
///             "video",
///             "last_frame"
///           ]
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Saved capture metadata; retained means actual encrypted library bytes were committed, independent of Provider URL expiry.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "id",
///                     "task_id",
///                     "kind",
///                     "status",
///                     "asset_id",
///                     "availability",
///                     "failure_code",
///                     "created_at",
///                     "updated_at"
///                   ],
///                   "properties": {
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "task_id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "kind": {
///                       "enum": [
///                         "video",
///                         "last_frame"
///                       ]
///                     },
///                     "status": {
///                       "enum": [
///                         "preparing",
///                         "stored",
///                         "failed"
///                       ]
///                     },
///                     "asset_id": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "format": "uuid"
///                     },
///                     "availability": {
///                       "enum": [
///                         "retained",
///                         "deleted",
///                         "not_stored"
///                       ]
///                     },
///                     "failure_code": {
///                       "enum": [
///                         null,
///                         "delivery_failed",
///                         "authorization_changed",
///                         "invalid_media",
///                         "capacity_exceeded",
///                         "storage_unavailable",
///                         "encryption_unavailable"
///                       ]
///                     },
///                     "created_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     },
///                     "updated_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid capture request or media bytes"
///       },
///       "401": {
///         "description": "Sign-in required"
///       },
///       "403": {
///         "description": "Workspace or current key authority denied"
///       },
///       "404": {
///         "description": "Missing/private task, capture, or unavailable source"
///       },
///       "409": {
///         "description": "Active lease, changed replay, quota exceeded or binding/visibility conflict"
///       },
///       "413": {
///         "description": "Source bytes exceed8MiB"
///       },
///       "502": {
///         "description": "Upstream query or delivery failed"
///       },
///       "503": {
///         "description": "Capture capacity, configuration or storage unavailable"
///       },
///       "504": {
///         "description": "Upstream query or delivery timeout"
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn retrieve(
    State(state): State<AppState>,
    Path((organization_id, project_id, task, kind_value)): Path<(Uuid, Uuid, Uuid, String)>,
    headers: HeaderMap,
) -> Result<([(String, String); 1], Json<serde_json::Value>), ApiError> {
    kind(&kind_value)?;
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let actor = owner(&state, &headers, scope, AdminPermission::Read).await?;
    let saved = state
        .store
        .generation_artifact_capture(scope, &actor, task, &kind_value)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok((
        [("cache-control".into(), "private, no-store".into())],
        Json(serde_json::json!({"data":saved})),
    ))
}
/// ```openapi
/// {
///   "path": "/api/v1/organizations/{organization}/projects/{project}/generations/artifacts/{task}/{kind}/capture",
///   "method": "post",
///   "operation": {
///     "operationId": "captureGenerationsArtifact",
///     "summary": "Explicitly save a generated output into workspace materials",
///     "description": "Current dashboard workspace Write permission and actor-visible original task required. Task/output identity is scoped; no Provider URLs, private references, credentials or costs are returned. Explicit bounded copy into the existing encrypted workspace material library, not Provider registration or generation. Cached mode uses unexpired saved references under historical access; fresh mode explicitly queries the original task then retrieves output, using optional selected current workspace key or original-key fallback. The selected key cannot replace the immutable Provider/account/model/channel. Original expired keys without explicit current authority refuse fresh actions. Upstream operations never retry automatically. Two process capture slots; transport and format validation limited to8MiB; existing256asset/256MiB workspace quotas remain. A durable2minute preparing lease is committed before retrieval. Only an explicit repeated POST recovers failed/expired claims. Same requestid with changed fields409; a NEW requestid may change mode after failure; source identity prevents duplicate active/stored captures. Stored source replay returns canonical retained/deleted outcome without network; deleted retained bytes are never resurrected. Asset bytes, source provenance, quota and audit commit atomically after rechecking visibility under the source task lock. Failed delivery returns its error and retains a safe failed claim when storage is available; ambiguous failure-record writes leave preparing, not false availability. Cached expiry/deletion and original task/pricing identity are not rewritten. Fresh status queries may append diagnosis and settle an original pending liability through existing recovery, never create a new generation or reprice it. Saving shares copied bytes with authorized workspace members through the existing library; Provider readiness and verified identity remain separate.",
///     "x-niu-implementation": "implemented",
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
///         "name": "task",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "kind",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "enum": [
///             "video",
///             "last_frame"
///           ]
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Saved capture metadata; retained means actual encrypted library bytes were committed, independent of Provider URL expiry.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "id",
///                     "task_id",
///                     "kind",
///                     "status",
///                     "asset_id",
///                     "availability",
///                     "failure_code",
///                     "created_at",
///                     "updated_at"
///                   ],
///                   "properties": {
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "task_id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "kind": {
///                       "enum": [
///                         "video",
///                         "last_frame"
///                       ]
///                     },
///                     "status": {
///                       "enum": [
///                         "preparing",
///                         "stored",
///                         "failed"
///                       ]
///                     },
///                     "asset_id": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "format": "uuid"
///                     },
///                     "availability": {
///                       "enum": [
///                         "retained",
///                         "deleted",
///                         "not_stored"
///                       ]
///                     },
///                     "failure_code": {
///                       "enum": [
///                         null,
///                         "delivery_failed",
///                         "authorization_changed",
///                         "invalid_media",
///                         "capacity_exceeded",
///                         "storage_unavailable",
///                         "encryption_unavailable"
///                       ]
///                     },
///                     "created_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     },
///                     "updated_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid capture request or media bytes"
///       },
///       "401": {
///         "description": "Sign-in required"
///       },
///       "403": {
///         "description": "Workspace or current key authority denied"
///       },
///       "404": {
///         "description": "Missing/private task, capture, or unavailable source"
///       },
///       "409": {
///         "description": "Active lease, changed replay, quota exceeded or binding/visibility conflict"
///       },
///       "413": {
///         "description": "Source bytes exceed8MiB"
///       },
///       "502": {
///         "description": "Upstream query or delivery failed"
///       },
///       "503": {
///         "description": "Capture capacity, configuration or storage unavailable"
///       },
///       "504": {
///         "description": "Upstream query or delivery timeout"
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
///               "id",
///               "name",
///               "mode"
///             ],
///             "properties": {
///               "id": {
///                 "type": "string",
///                 "format": "uuid",
///                 "description": "Canonical nonnil request identity retained before sending."
///               },
///               "name": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 200,
///                 "description": "Exact trimmed UTF8 name, at most200 bytes, no control characters."
///               },
///               "mode": {
///                 "enum": [
///                   "cached",
///                   "fresh"
///                 ]
///               },
///               "key_id": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "format": "uuid",
///                 "description": "Only fresh: explicit current workspace key authority; original Provider binding never changes."
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn capture(
    State(state): State<AppState>,
    Path((organization_id, project_id, task, kind_value)): Path<(Uuid, Uuid, Uuid, String)>,
    headers: HeaderMap,
    input: Result<Json<CaptureRequest>, JsonRejection>,
) -> Result<([(String, String); 1], Json<serde_json::Value>), ApiError> {
    kind(&kind_value)?;
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let actor = owner(&state, &headers, scope, AdminPermission::Write).await?;
    let Json(input) = input.map_err(|_| {
        ApiError::invalid_request("Provide a capture reference, name and cached or fresh mode")
    })?;
    if input.id.is_nil()
        || !["cached", "fresh"].contains(&input.mode.as_str())
        || input.name.is_empty()
        || input.name.len() > 200
        || input.name.trim() != input.name
        || input.name.chars().any(char::is_control)
        || (input.mode == "cached" && input.key_id.is_some())
        || input.key_id.is_some_and(|id| id.is_nil())
    {
        return Err(ApiError::invalid_request(
            "Invalid artifact capture request",
        ));
    }
    state
        .store
        .generation_task(scope, &actor, task)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let _permit = CAPTURES
        .try_acquire()
        .map_err(|_| ApiError::asset_management_busy())?;
    let claim = state
        .store
        .prepare_generation_artifact_capture(
            scope,
            &actor,
            task,
            &kind_value,
            GenerationArtifactCaptureRequest {
                id: input.id,
                name: &input.name,
                mode: &input.mode,
                key_id: input.key_id,
            },
        )
        .await
        .map_err(ApiError::from_store)?;
    let saved = if let Some(lease) = claim.lease_token {
        let work = copy_using(CopyContext {
            state: &state,
            headers: &headers,
            scope,
            actor: &actor,
            task,
            kind: &kind_value,
            input: &input,
            id: claim.capture.id,
            lease,
        })
        .await;
        match work {
            Ok(saved) => saved,
            Err((code, error)) => {
                // A failed failure-record write leaves a bounded preparing claim,
                // never false availability; explicit retry can recover its lease.
                state
                    .store
                    .fail_generation_artifact_capture(scope, &actor, claim.capture.id, lease, code)
                    .await
                    .map_err(ApiError::from_store)?;
                return Err(error);
            }
        }
    } else {
        claim.capture
    };
    Ok((
        [("cache-control".into(), "private, no-store".into())],
        Json(serde_json::json!({"data":saved})),
    ))
}
struct CopyContext<'a> {
    state: &'a AppState,
    headers: &'a HeaderMap,
    scope: TenantScope,
    actor: &'a str,
    task: Uuid,
    kind: &'a str,
    input: &'a CaptureRequest,
    id: Uuid,
    lease: Uuid,
}
async fn copy_using(
    context: CopyContext<'_>,
) -> Result<GenerationArtifactCapture, (&'static str, ApiError)> {
    let CopyContext {
        state,
        headers,
        scope,
        actor,
        task,
        kind,
        input,
        id,
        lease,
    } = context;
    let principal: Option<Principal> = if input.mode == "fresh" {
        let key = match input.key_id {
            Some(key) => key,
            None => state
                .store
                .generations_task_action_key(scope, actor, task)
                .await
                .map_err(|e| ("authorization_changed", ApiError::from_store(e)))?
                .ok_or_else(|| ("authorization_changed", ApiError::not_found()))?,
        };
        Some(
            state
                .authorize_dashboard_key(headers, scope, key, AdminPermission::Write)
                .await
                .map_err(|e| ("authorization_changed", e))?,
        )
    } else {
        None
    };
    let media =
        super::video_results::retrieve_capture(state, scope, actor, principal.as_ref(), task, kind)
            .await
            .map_err(|e| ("delivery_failed", e))?;
    let content_type = media.content_type.to_owned();
    let media_kind = AssetLibraryKind::for_content_type(&content_type).ok_or_else(|| {
        (
            "invalid_media",
            ApiError::invalid_request("Unsupported captured media type"),
        )
    })?;
    if media.bytes.len() > niu_media::workspace_asset_validation::MAX_ASSET_BYTES {
        return Err(("invalid_media", ApiError::request_too_large()));
    }
    let bytes = media.bytes;
    niu_media::workspace_asset_validation::validate(&content_type, &bytes)
        .await
        .map_err(|_| {
            (
                "invalid_media",
                ApiError::invalid_request("Invalid captured media bytes"),
            )
        })?;
    owner(state, headers, scope, AdminPermission::Write)
        .await
        .map_err(|e| ("authorization_changed", e))?;
    if let Some(principal) = &principal {
        state
            .authorize_dashboard_key(headers, scope, principal.key_id(), AdminPermission::Write)
            .await
            .map_err(|e| ("authorization_changed", e))?;
    }
    super::video_results::authorize_delivery(state, scope, principal.as_ref(), Some(actor), task)
        .await
        .map_err(|e| ("authorization_changed", e))?;
    let aad = niu_storage::workspace_asset_content_aad(scope, id);
    let cipher = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(|| ("encryption_unavailable", ApiError::unavailable()))?;
    let encrypted = cipher
        .seal_bytes_with_aad(&aad, &bytes)
        .map_err(|_| ("encryption_unavailable", ApiError::unavailable()))?;
    state
        .store
        .complete_generation_artifact_capture(
            scope,
            actor,
            niu_storage::GenerationArtifactCaptureLease { id, token: lease },
            AssetLibraryCreate {
                id,
                name: &input.name,
                kind: media_kind,
                content_type: &content_type,
                bytes: &bytes,
                actor,
            },
            AssetLibraryLimits::default(),
            |actual_aad, actual_bytes| {
                if actual_aad != aad || actual_bytes != bytes.as_slice() {
                    return Err(niu_storage::StoreError::InvalidObservation);
                }
                Ok(encrypted)
            },
        )
        .await
        .map_err(|e| {
            let code = if matches!(e, niu_storage::StoreError::AssetLibraryCapacityExceeded) {
                "capacity_exceeded"
            } else {
                "storage_unavailable"
            };
            (code, ApiError::from_store(e))
        })
}
