//! Actor-owned restoration; only the explicit submit handler can dispatch.
use super::video;
use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use niu_storage::{AdminPermission, Principal, TenantScope, VideoIntent, VideoIntentInput};
use serde::Deserialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use uuid::Uuid;

type IntentPath = (Uuid, Uuid, Uuid);
fn scope(organization_id: Uuid, project_id: Uuid) -> TenantScope {
    TenantScope {
        organization_id,
        project_id,
    }
}
async fn owner(
    state: &AppState,
    headers: &HeaderMap,
    scope: TenantScope,
    permission: AdminPermission,
) -> Result<String, ApiError> {
    let authority = state.authorize_admin_headers(headers, permission).await?;
    if !authority.permits_project(scope) {
        return Err(ApiError::forbidden());
    }
    Ok(match authority {
        AdminAuthorization::Installation => "installation".into(),
        AdminAuthorization::Operator(operator) => format!("operator:{}", operator.id),
    })
}
fn identity(intent: &VideoIntent) -> video::SubmissionIdentity {
    video::SubmissionIdentity {
        key: Sha256::digest(intent.submission_key.to_string().as_bytes()).to_vec(),
        request: intent.request_digest.clone(),
    }
}
async fn selected(
    state: &AppState,
    scope: TenantScope,
    intent: &VideoIntent,
) -> Result<Principal, ApiError> {
    let key = state
        .store
        .video_intent_key(scope, intent.key_id, &intent.model)
        .await
        .map_err(ApiError::from_store)?;
    let principal = state
        .store
        .dashboard_key(scope, key)
        .await
        .map_err(ApiError::from_store)?;
    state.authorize_key_source(principal).await
}
async fn load(
    state: &AppState,
    scope: TenantScope,
    owner: &str,
    id: Uuid,
) -> Result<VideoIntent, ApiError> {
    state
        .store
        .video_intent(scope, owner, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)
}
async fn restored(
    state: &AppState,
    scope: TenantScope,
    intent: VideoIntent,
) -> Result<Value, ApiError> {
    let principal = selected(state, scope, &intent).await?;
    let identity = identity(&intent);
    let attempt = state
        .store
        .media_submission_attempt(scope, &identity.key, &identity.request)
        .await
        .map_err(ApiError::from_store)?;
    let (submission_state, job) = if let Some(attempt) = attempt {
        let (dispatched, job) = state
            .store
            .media_job_snapshot_for_key(&principal, attempt)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(ApiError::not_found)?;
        (
            if dispatched {
                "dispatched"
            } else {
                "not_dispatched"
            },
            Some(job),
        )
    } else {
        ("saved", None)
    };
    Ok(
        json!({"data":{"id":intent.id,"revision":intent.revision,"original_key_id":intent.key_id,"key_id":principal.key_id(),"model":intent.model,"funding_mode":if intent.owner_funded {"owner_funded"} else {"customer"},"request":intent.request,"content_state":if intent.expired {"expired"} else if intent.deleted {"deleted"} else {"retained"},"expires_at_ms":intent.expires_at_ms,"submission_state":submission_state,"job":job}}),
    )
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::web) struct SaveInput {
    key_id: Uuid,
    request: Value,
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/video-intents/{intent}",
///   "method": "put",
///   "operation": {
///     "operationId": "saveVideoSubmissionIntent",
///     "summary": "Save an immutable text-video submission intent",
///     "description": "Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Requires workspace write permission and an active selected key with model access and allowed source. A fresh client-generated intent UUID binds the exact request, original key and funding mode. Identical retries return the same record; changed input or key under that UUID conflicts. No attempt, upstream call or reservation is created. The internal idempotency identity is server-generated and is never exposed; use the submit operation rather than legacy job creation.",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
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
///         "name": "intent",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Save an immutable text-video submission intent",
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
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/VideoSubmissionIntent"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid path, query or request; framework rejections may be plain text."
///       },
///       "401": {
///         "description": "Invalid actor credential or no authorized current key in the original lineage."
///       },
///       "403": {
///         "description": "Workspace permission or current source policy denied."
///       },
///       "404": {
///         "description": "Intent is not owned by this actor and workspace, or selected model is inaccessible."
///       },
///       "409": {
///         "description": "Immutable identity, request, funding mode, revision or cursor conflict."
///       },
///       "503": {
///         "description": "Required storage or route configuration is unavailable."
///       },
///       "501": {
///         "description": "Unsupported video capability or non-text intent."
///       },
///       "413": {
///         "description": "Request envelope exceeds 64 KiB."
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "x-niu-status": "Text-only durable intent persistence and explicit submission. Full browser restoration and customer-funded video qualification remain open.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "key_id",
///               "request"
///             ],
///             "properties": {
///               "key_id": {
///                 "type": "string",
///                 "format": "uuid"
///               },
///               "request": {
///                 "$ref": "#/components/schemas/VideoIntentRequest"
///               }
///             }
///           }
///         }
///       }
///     }
///   },
///   "schemas": {
///     "VideoIntentRequest": {
///       "type": "object",
///       "required": [
///         "model",
///         "content"
///       ],
///       "additionalProperties": true,
///       "description": "Validated text-only request with configured defaults materialized at save time, at most 60 KiB encoded JSON. Model-specific controls must satisfy the current configured video schema; image/media references and callbacks are unsupported. Saving validates availability and funding mode but does not reserve funds.",
///       "properties": {
///         "model": {
///           "type": "string"
///         },
///         "content": {
///           "type": "array",
///           "minItems": 1,
///           "items": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "type",
///               "text"
///             ],
///             "properties": {
///               "type": {
///                 "const": "text"
///               },
///               "text": {
///                 "type": "string"
///               }
///             }
///           }
///         }
///       }
///     },
///     "VideoIntentIndexItem": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "id",
///         "revision",
///         "expires_at_ms",
///         "content_state"
///       ],
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "revision": {
///           "type": "integer",
///           "minimum": 1
///         },
///         "expires_at_ms": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "content_state": {
///           "type": "string",
///           "enum": [
///             "retained",
///             "deleted",
///             "expired"
///           ]
///         }
///       }
///     },
///     "VideoSubmissionIntent": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "id",
///         "revision",
///         "original_key_id",
///         "key_id",
///         "model",
///         "funding_mode",
///         "request",
///         "content_state",
///         "expires_at_ms",
///         "submission_state",
///         "job"
///       ],
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "revision": {
///           "type": "integer",
///           "minimum": 1
///         },
///         "expires_at_ms": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "content_state": {
///           "type": "string",
///           "enum": [
///             "retained",
///             "deleted",
///             "expired"
///           ]
///         },
///         "original_key_id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "key_id": {
///           "type": "string",
///           "format": "uuid",
///           "description": "Current active key in the original rotation lineage; no secret is returned."
///         },
///         "model": {
///           "type": "string"
///         },
///         "funding_mode": {
///           "type": "string",
///           "enum": [
///             "owner_funded",
///             "customer"
///           ]
///         },
///         "request": {
///           "anyOf": [
///             {
///               "$ref": "#/components/schemas/VideoIntentRequest"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         },
///         "submission_state": {
///           "type": "string",
///           "enum": [
///             "saved",
///             "not_dispatched",
///             "dispatched"
///           ],
///           "description": "Dispatch and job status are read from one database statement snapshot. not_dispatched means original preparation has no recorded dispatch; it never grants a fresh submission right."
///         },
///         "job": {
///           "anyOf": [
///             {
///               "$ref": "#/paths/~1v1~1video~1jobs~1{id}/get/responses/200/content/application~1json/schema"
///             },
///             {
///               "type": "null"
///             }
///           ]
///         }
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn save(
    State(state): State<AppState>,
    Path((org, ws, id)): Path<IntentPath>,
    headers: HeaderMap,
    Json(input): Json<SaveInput>,
) -> Result<Json<Value>, ApiError> {
    if serde_json::to_vec(&input.request)
        .map_err(|_| ApiError::invalid_request("Invalid video request"))?
        .len()
        > 60 * 1024
    {
        return Err(ApiError::invalid_request(
            "Saved video request exceeds 60 KiB",
        ));
    }
    let scope = scope(org, ws);
    let owner = owner(&state, &headers, scope, AdminPermission::Write).await?;
    let principal = state
        .authorize_dashboard_key(&headers, scope, input.key_id, AdminPermission::Write)
        .await?;
    let model = input
        .request
        .get("model")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::invalid_request("A video model is required"))?;
    if !principal.allows_model(model) {
        return Err(ApiError::not_found());
    }
    if input
        .request
        .get("content")
        .and_then(Value::as_array)
        .is_none_or(|items| {
            items.is_empty()
                || items
                    .iter()
                    .any(|item| item.get("type").and_then(Value::as_str) != Some("text"))
        })
    {
        return Err(ApiError::unsupported_message(
            "Saved video intents support text input only",
        ));
    }
    let (_, validated, _, _, owner_funded) =
        video::validate_admission(&state, &principal, &input.request, model).await?;
    // Materialize defaults now so later schema defaults cannot silently change
    // the restored document. Keep the customer alias, not the upstream model.
    let mut canonical = validated.body().clone();
    canonical["model"] = Value::String(model.to_owned());
    canonical.sort_all_objects();
    let document = serde_json::to_vec(&canonical)
        .map_err(|_| ApiError::invalid_request("Invalid video request"))?;
    if document.len() > 60 * 1024 {
        return Err(ApiError::invalid_request(
            "Validated video request exceeds 60 KiB",
        ));
    }
    let digest = Sha256::digest(document);
    state
        .store
        .save_video_intent(
            scope,
            &owner,
            VideoIntentInput {
                id,
                key_id: input.key_id,
                model,
                owner_funded,
                request: &canonical,
                request_digest: &digest,
            },
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        restored(&state, scope, load(&state, scope, &owner, id).await?).await?,
    ))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/video-intents/{intent}",
///   "method": "get",
///   "operation": {
///     "operationId": "getVideoSubmissionIntent",
///     "summary": "Restore a video intent and resolve its original job",
///     "description": "Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Requires read permission plus current key/model/source authorization. A rotated key is resolved only within the saved key lineage. An unrelated key never replaces the original billing source. This GET never polls upstream, reserves funds or submits a job; it reports saved, not_dispatched or dispatched preparation.",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
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
///         "name": "intent",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Restore a video intent and resolve its original job",
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
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/VideoSubmissionIntent"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid path, query or request; framework rejections may be plain text."
///       },
///       "401": {
///         "description": "Invalid actor credential or no authorized current key in the original lineage."
///       },
///       "403": {
///         "description": "Workspace permission or current source policy denied."
///       },
///       "404": {
///         "description": "Intent is not owned by this actor and workspace, or selected model is inaccessible."
///       },
///       "409": {
///         "description": "Immutable identity, request, funding mode, revision or cursor conflict."
///       },
///       "503": {
///         "description": "Required storage or route configuration is unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "x-niu-status": "Text-only durable intent persistence and explicit submission. Full browser restoration and customer-funded video qualification remain open."
///   }
/// }
/// ```
pub(in crate::web) async fn get(
    State(state): State<AppState>,
    Path((org, ws, id)): Path<IntentPath>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let scope = scope(org, ws);
    let owner = owner(&state, &headers, scope, AdminPermission::Read).await?;
    Ok(Json(
        restored(&state, scope, load(&state, scope, &owner, id).await?).await?,
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::web) struct Page {
    before: Option<Uuid>,
    limit: Option<i64>,
}
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/video-intents",
///   "method": "get",
///   "operation": {
///     "operationId": "listVideoSubmissionIntents",
///     "summary": "List the current actor video intent index",
///     "description": "Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Newest-first creation order with UUID tie-breaker. The index contains only intent identity, revision, expiry and retention state; it intentionally exposes no request, model or key content. Index access remains available for deleting retained content after key revocation. Read each intent separately under current key authorization. A cursor must belong to this actor and workspace.",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
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
///         "name": "before",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "limit",
///         "in": "query",
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 100,
///           "default": 25
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "List the current actor video intent index",
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
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data",
///                 "has_more",
///                 "next_before"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "$ref": "#/components/schemas/VideoIntentIndexItem"
///                   }
///                 },
///                 "has_more": {
///                   "type": "boolean"
///                 },
///                 "next_before": {
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
///         "description": "Invalid path, query or request; framework rejections may be plain text."
///       },
///       "401": {
///         "description": "Invalid actor credential or no authorized current key in the original lineage."
///       },
///       "403": {
///         "description": "Workspace permission or current source policy denied."
///       },
///       "404": {
///         "description": "Intent is not owned by this actor and workspace, or selected model is inaccessible."
///       },
///       "409": {
///         "description": "Immutable identity, request, funding mode, revision or cursor conflict."
///       },
///       "503": {
///         "description": "Required storage or route configuration is unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "x-niu-status": "Text-only durable intent persistence and explicit submission. Full browser restoration and customer-funded video qualification remain open."
///   }
/// }
/// ```
pub(in crate::web) async fn list(
    State(state): State<AppState>,
    Path((org, ws)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Query(page): Query<Page>,
) -> Result<Json<Value>, ApiError> {
    let scope = scope(org, ws);
    let owner = owner(&state, &headers, scope, AdminPermission::Read).await?;
    let limit = page.limit.unwrap_or(25);
    if !(1..=100).contains(&limit) {
        return Err(ApiError::invalid_request(
            "Page size must be between 1 and 100",
        ));
    }
    // One bounded metadata query; never load retained prompts for the index.
    let mut data = state
        .store
        .video_intent_index(scope, &owner, page.before, limit)
        .await
        .map_err(ApiError::from_store)?;
    let has_more = data.len() > limit as usize;
    data.truncate(limit as usize);
    let next = if has_more {
        data.last().and_then(|row| row.get("id")).cloned()
    } else {
        None
    };
    Ok(Json(
        json!({"data":data,"has_more":has_more,"next_before":next}),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::web) struct Revision {
    expected_revision: i64,
}
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/video-intents/{intent}",
///   "method": "delete",
///   "operation": {
///     "operationId": "deleteVideoSubmissionIntent",
///     "summary": "Erase saved intent content without cancelling its job",
///     "description": "Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Requires write permission and the expected revision. Replaying the same successful deletion is idempotent. Does not require an active selected key. Deleted identities cannot be saved or submitted again.",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
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
///         "name": "intent",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Erase saved intent content without cancelling its job",
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
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "id",
///                     "revision",
///                     "deleted"
///                   ],
///                   "properties": {
///                     "id": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "revision": {
///                       "type": "integer",
///                       "minimum": 1
///                     },
///                     "deleted": {
///                       "const": true
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid path, query or request; framework rejections may be plain text."
///       },
///       "401": {
///         "description": "Invalid actor credential or no authorized current key in the original lineage."
///       },
///       "403": {
///         "description": "Workspace permission or current source policy denied."
///       },
///       "404": {
///         "description": "Intent is not owned by this actor and workspace, or selected model is inaccessible."
///       },
///       "409": {
///         "description": "Immutable identity, request, funding mode, revision or cursor conflict."
///       },
///       "503": {
///         "description": "Required storage or route configuration is unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "x-niu-status": "Text-only durable intent persistence and explicit submission. Full browser restoration and customer-funded video qualification remain open.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "expected_revision"
///             ],
///             "properties": {
///               "expected_revision": {
///                 "type": "integer",
///                 "minimum": 1
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn delete(
    State(state): State<AppState>,
    Path((org, ws, id)): Path<IntentPath>,
    headers: HeaderMap,
    Json(input): Json<Revision>,
) -> Result<Json<Value>, ApiError> {
    if input.expected_revision <= 0 || input.expected_revision == i64::MAX {
        return Err(ApiError::invalid_request(
            "Expected revision must be a positive incrementable integer",
        ));
    }
    let scope = scope(org, ws);
    let owner = owner(&state, &headers, scope, AdminPermission::Write).await?;
    load(&state, scope, &owner, id).await?;
    let revision = state
        .store
        .delete_video_intent(scope, &owner, id, input.expected_revision)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"id":id,"revision":revision,"deleted":true}}),
    ))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/video-intents/{intent}/submit",
///   "method": "post",
///   "operation": {
///     "operationId": "submitVideoSubmissionIntent",
///     "summary": "Explicitly submit or replay an immutable saved video intent",
///     "description": "Actor-owned workspace records: installation authority shares one installation actor, while operator actors are isolated even within the same workspace. Current workspace permission applies. Request content is retained for 30 days from creation or until deletion; expiry is unreadable immediately and background maintenance clears retained content. Identity tombstones remain. Deletion does not cancel an already accepted concurrent submission, erase its job or refund charges. Requires write permission, matching retained revision and current key/model/source authorization. Uses only the saved request and original rotation lineage. Rechecks configured video admission and rejects a changed owner-funded/customer funding mode before a new dispatch. Concurrent and restarted calls use one original submission identity. Interrupted original preparation is read back, never assumed safe to dispatch again. HTTP 202 can represent unresolved submission and is not a completed generation or settled charge.",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
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
///         "name": "intent",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "202": {
///         "description": "Explicitly submit or replay an immutable saved video intent",
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
///               "$ref": "#/paths/~1v1~1video~1jobs~1{id}/get/responses/200/content/application~1json/schema"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid path, query or request; framework rejections may be plain text."
///       },
///       "401": {
///         "description": "Invalid actor credential or no authorized current key in the original lineage."
///       },
///       "403": {
///         "description": "Workspace permission or current source policy denied."
///       },
///       "404": {
///         "description": "Intent is not owned by this actor and workspace, or selected model is inaccessible."
///       },
///       "409": {
///         "description": "Immutable identity, request, funding mode, revision or cursor conflict."
///       },
///       "503": {
///         "description": "Required storage or route configuration is unavailable."
///       },
///       "501": {
///         "description": "Unsupported video capability or non-text intent."
///       },
///       "402": {
///         "description": "Insufficient funds or spending allowance before dispatch."
///       },
///       "429": {
///         "description": "Current rate or concurrency policy denied admission."
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "x-niu-status": "Text-only durable intent persistence and explicit submission. Full browser restoration and customer-funded video qualification remain open.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "expected_revision"
///             ],
///             "properties": {
///               "expected_revision": {
///                 "type": "integer",
///                 "minimum": 1
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn submit(
    State(state): State<AppState>,
    Path((org, ws, id)): Path<IntentPath>,
    headers: HeaderMap,
    Json(input): Json<Revision>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    if input.expected_revision <= 0 || input.expected_revision == i64::MAX {
        return Err(ApiError::invalid_request(
            "Expected revision must be a positive incrementable integer",
        ));
    }
    let scope = scope(org, ws);
    let owner = owner(&state, &headers, scope, AdminPermission::Write).await?;
    let intent = load(&state, scope, &owner, id).await?;
    if intent.revision != input.expected_revision || intent.request.is_none() {
        return Err(ApiError::from_store(niu_storage::StoreError::Conflict));
    }
    let principal = selected(&state, scope, &intent).await?;
    let identity = identity(&intent);
    let body = intent.request.as_ref().expect("retained request");
    let _in_flight = state.track_inference();
    video::create_as(
        state,
        body.clone(),
        principal,
        Some(identity),
        Some(intent.owner_funded),
    )
    .await
}
