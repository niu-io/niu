//! Human read-only review under workspace membership, independent of agent keys.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State, rejection::JsonRejection},
    http::{HeaderMap, StatusCode},
};
use niu_storage::{AdminPermission, EvaluationDefinition, TenantScope, WorkspaceModelPool};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Page {
    after: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Version {
    revision: Option<i64>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct History {
    before: Option<i64>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Comparison {
    left: String,
    right: String,
}
async fn scope(
    state: &AppState,
    headers: &HeaderMap,
    workspace: Uuid,
) -> Result<TenantScope, ApiError> {
    Ok(crate::admin::workspace_aliases::authorize_workspace(
        state,
        headers,
        workspace,
        AdminPermission::Read,
    )
    .await?
    .1)
}
fn slug(value: &str) -> Result<(), ApiError> {
    if !niu_storage::is_valid_pool_slug(value) {
        return Err(ApiError::invalid_request("Use a readable resource slug"));
    }
    Ok(())
}
fn page(mut rows: Vec<Value>, field: &str) -> Value {
    let has_more = rows.len() > 100;
    rows.truncate(100);
    let next = if has_more {
        rows.last().and_then(|row| row.get(field)).cloned()
    } else {
        None
    };
    json!({"data":rows,"has_more":has_more,"next_after":next})
}
/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/routing",
///   "method": "get",
///   "operation": {
///     "x-niu-implementation": "implemented",
///     "operationId": "listWorkspaceReviewPools",
///     "summary": "Review: List workspace model policies",
///     "description": "Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "after",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Workspace-scoped result; no-store.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/WorkspaceModelPool"
///                   }
///                 },
///                 "has_more": {
///                   "type": "boolean"
///                 },
///                 "next_after": {
///                   "type": [
///                     "string",
///                     "null"
///                   ]
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Missing, expired or revoked credential"
///       },
///       "403": {
///         "description": "Required delegated capability is absent"
///       },
///       "404": {
///         "description": "Scoped pool not found"
///       },
///       "409": {
///         "description": "Expected revision conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn pools(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(workspace): Path<Uuid>,
    Query(query): Query<Page>,
) -> Result<Json<Value>, ApiError> {
    let scope = scope(&state, &headers, workspace).await?;
    if let Some(after) = &query.after {
        slug(after)?;
    }
    let rows = state
        .store
        .workspace_model_pools(scope, query.after.as_deref())
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(page(
        rows.into_iter().map(|row| json!(row)).collect(),
        "slug",
    )))
}
/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/routing/{slug}",
///   "method": "get",
///   "operation": {
///     "x-niu-implementation": "implemented",
///     "operationId": "getWorkspaceReviewPool",
///     "summary": "Review: Read a workspace model policy",
///     "description": "Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Workspace-scoped result; no-store.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/WorkspaceModelPool"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Missing, expired or revoked credential"
///       },
///       "403": {
///         "description": "Required delegated capability is absent"
///       },
///       "404": {
///         "description": "Scoped pool not found"
///       },
///       "409": {
///         "description": "Expected revision conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn pool(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((workspace, name)): Path<(Uuid, String)>,
) -> Result<Json<Value>, ApiError> {
    let scope = scope(&state, &headers, workspace).await?;
    slug(&name)?;
    Ok(Json(
        json!({"data":state.store.workspace_model_pool(scope,&name).await.map_err(ApiError::from_store)?.ok_or_else(ApiError::not_found)?}),
    ))
}
/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/routing/{slug}",
///   "method": "put",
///   "operation": {
///     "x-niu-implementation": "implemented",
///     "operationId": "setWorkspaceReviewPool",
///     "summary": "Review: Create or replace a workspace model policy",
///     "description": "Workspace model pool management under a current member session with Write permission (Owner or Admin); an installation administrator can also update explicitly scoped records. Use revision zero to create, otherwise the current expected revision. Candidate aliases must be visible in the workspace.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "$ref": "#/components/schemas/WorkspaceModelPool"
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Workspace-scoped result; no-store.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/WorkspaceModelPool"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Missing, expired or revoked credential"
///       },
///       "403": {
///         "description": "Required workspace write permission is absent"
///       },
///       "404": {
///         "description": "Scoped workspace not found"
///       },
///       "409": {
///         "description": "Expected revision conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn put_pool(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((workspace, name)): Path<(Uuid, String)>,
    input: Result<Json<WorkspaceModelPool>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let scope = crate::admin::workspace_aliases::authorize_workspace(
        &state,
        &headers,
        workspace,
        AdminPermission::Write,
    )
    .await?
    .1;
    slug(&name)?;
    let Json(input) = input
        .map_err(|_| ApiError::invalid_request("Provide a workspace model pool configuration"))?;
    if name != input.slug {
        return Err(ApiError::invalid_request("Pool slug must match its URL"));
    }
    let aliases = input.validate().map_err(ApiError::from_store)?;
    let models = crate::vendors::scoped_models(&state, scope.organization_id).await?;
    if models.contains_key(&format!("pool/{}", input.slug))
        || aliases
            .iter()
            .any(|alias| !models.contains_key(alias) || alias.starts_with("codex/"))
    {
        return Err(ApiError::invalid_request(
            "Every pool candidate must be an authorized model; pool names cannot shadow an existing model",
        ));
    }
    if let Some(decider) = input.strategy.auto().and_then(|auto| auto.decider.as_ref()) {
        let decider_model = models.get(&decider.model).ok_or_else(|| {
            ApiError::invalid_request("The Auto decider model must be a visible workspace model")
        })?;
        if !crate::vendors::supports_protocol(
            decider_model,
            &crate::guardrails::input::Protocol::Chat,
        ) {
            return Err(ApiError::invalid_request(
                "The Auto decider model must support the Chat protocol",
            ));
        }
    }
    let saved = state
        .store
        .set_workspace_model_pool_for_scope(scope, &input)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":saved})))
}
#[derive(Deserialize)]
pub struct DeletePool {
    revision: i64,
}

/// Soft-delete a custom model under the current member Write authority.
pub async fn delete_pool(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((workspace, name)): Path<(Uuid, String)>,
    Query(query): Query<DeletePool>,
) -> Result<StatusCode, ApiError> {
    let scope = crate::admin::workspace_aliases::authorize_workspace(
        &state,
        &headers,
        workspace,
        AdminPermission::Write,
    )
    .await?
    .1;
    slug(&name)?;
    state
        .store
        .delete_workspace_model_pool_for_scope(scope, &name, query.revision)
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/routing/{slug}/history",
///   "method": "get",
///   "operation": {
///     "x-niu-implementation": "implemented",
///     "operationId": "getWorkspaceReviewPoolHistory",
///     "summary": "Review: Read immutable workspace policy revisions",
///     "description": "Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       },
///       {
///         "name": "before",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "minimum": 1
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Workspace-scoped result; no-store.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/WorkspaceModelPool"
///                   }
///                 },
///                 "next_before": {
///                   "type": [
///                     "integer",
///                     "null"
///                   ]
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Missing, expired or revoked credential"
///       },
///       "403": {
///         "description": "Required delegated capability is absent"
///       },
///       "404": {
///         "description": "Scoped pool not found"
///       },
///       "409": {
///         "description": "Expected revision conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn pool_history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((workspace, name)): Path<(Uuid, String)>,
    Query(query): Query<History>,
) -> Result<Json<Value>, ApiError> {
    let scope = scope(&state, &headers, workspace).await?;
    slug(&name)?;
    if query.before.is_some_and(|revision| revision < 1) {
        return Err(ApiError::invalid_request("Use a positive history revision"));
    }
    let mut rows = state
        .store
        .workspace_model_pool_history(scope, &name, query.before)
        .await
        .map_err(ApiError::from_store)?;
    let more = rows.len() == 100;
    rows.truncate(100);
    let next = if more {
        rows.last().map(|row| json!(row.revision))
    } else {
        None
    };
    Ok(Json(json!({"data":rows,"next_before":next})))
}
/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/routing/{slug}/selections",
///   "method": "get",
///   "operation": {
///     "x-niu-implementation": "implemented",
///     "operationId": "getWorkspaceReviewPoolSelections",
///     "summary": "Review: Read the latest 100 workspace pool selections",
///     "description": "Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Workspace-scoped result; no-store.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "properties": {
///                       "pool_revision": {
///                         "type": "integer"
///                       },
///                       "selected_model": {
///                         "type": "string"
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "operation_id": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "uuid"
///                       },
///                       "attempt_id": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "uuid"
///                       },
///                       "response_status": {
///                         "type": [
///                           "integer",
///                           "null"
///                         ],
///                         "description": "Returned HTTP status, not terminal stream completion or task acceptance."
///                       }
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Missing, expired or revoked credential"
///       },
///       "403": {
///         "description": "Required delegated capability is absent"
///       },
///       "404": {
///         "description": "Scoped pool not found"
///       },
///       "409": {
///         "description": "Expected revision conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn pool_selections(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((workspace, name)): Path<(Uuid, String)>,
) -> Result<Json<Value>, ApiError> {
    let scope = scope(&state, &headers, workspace).await?;
    slug(&name)?;
    Ok(Json(
        json!({"data":state.store.workspace_pool_selections(scope,&name).await.map_err(ApiError::from_store)?}),
    ))
}
/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/events",
///   "method": "get",
///   "operation": {
///     "operationId": "listWorkspaceReviewSubscriptions",
///     "summary": "Review: List workspace event subscriptions",
///     "description": "Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
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
///         "description": "Scoped result",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/EventSubscription"
///                   }
///                 },
///                 "limit": {
///                   "type": "integer",
///                   "const": 32
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Required current delegation is absent"
///       },
///       "404": {
///         "description": "Scoped subscription not found"
///       },
///       "409": {
///         "description": "Revision, quota or cursor conflict"
///       },
///       "503": {
///         "description": "Required encryption or storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub async fn subscriptions(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(workspace): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let scope = scope(&state, &headers, workspace).await?;
    Ok(Json(
        json!({"data":state.store.event_subscriptions(scope).await.map_err(ApiError::from_store)?,"limit":32}),
    ))
}
/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/events/{slug}",
///   "method": "get",
///   "operation": {
///     "operationId": "getWorkspaceReviewSubscription",
///     "summary": "Review: Read an event subscription",
///     "description": "Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped result",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/EventSubscription"
///                 },
///                 "processed_cursor": {
///                   "type": "string"
///                 },
///                 "authorization_active": {
///                   "type": "boolean"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Required current delegation is absent"
///       },
///       "404": {
///         "description": "Scoped subscription not found"
///       },
///       "409": {
///         "description": "Revision, quota or cursor conflict"
///       },
///       "503": {
///         "description": "Required encryption or storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub async fn subscription(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((workspace, name)): Path<(Uuid, String)>,
) -> Result<Json<Value>, ApiError> {
    let scope = scope(&state, &headers, workspace).await?;
    slug(&name)?;
    let record = state
        .store
        .event_subscription(scope, &name)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let active = state
        .store
        .event_subscription_authorized(scope, &name)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":record.configuration,"processed_cursor":record.cursor.to_string(),"authorization_active":active}),
    ))
}
/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/events/{slug}/deliveries",
///   "method": "get",
///   "operation": {
///     "operationId": "getWorkspaceReviewDeliveries",
///     "summary": "Review: Inspect the latest 100 subscription deliveries",
///     "description": "Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped result",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/EventDelivery"
///                   }
///                 },
///                 "limit": {
///                   "type": "integer",
///                   "const": 100
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Required current delegation is absent"
///       },
///       "404": {
///         "description": "Scoped subscription not found"
///       },
///       "409": {
///         "description": "Revision, quota or cursor conflict"
///       },
///       "503": {
///         "description": "Required encryption or storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub async fn deliveries(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((workspace, name)): Path<(Uuid, String)>,
) -> Result<Json<Value>, ApiError> {
    let scope = scope(&state, &headers, workspace).await?;
    slug(&name)?;
    Ok(Json(
        json!({"data":state.store.event_deliveries(scope,&name).await.map_err(ApiError::from_store)?,"limit":100}),
    ))
}
/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/evaluations",
///   "method": "get",
///   "operation": {
///     "operationId": "listWorkspaceReviewEvaluations",
///     "summary": "Review: List workspace evaluation definitions",
///     "description": "Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "after",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped evidence",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "$ref": "#/components/schemas/EvaluationDefinition"
///                   }
///                 },
///                 "next_after": {
///                   "type": [
///                     "string",
///                     "null"
///                   ]
///                 }
///               },
///               "required": [
///                 "data",
///                 "next_after"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid input or mismatched evaluation binding"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Current delegated capability required"
///       },
///       "404": {
///         "description": "Scoped definition or run not found"
///       },
///       "409": {
///         "description": "Revision or immutable submission conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn evaluations(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(workspace): Path<Uuid>,
    Query(query): Query<Page>,
) -> Result<Json<Value>, ApiError> {
    let scope = scope(&state, &headers, workspace).await?;
    if let Some(after) = &query.after {
        slug(after)?;
    }
    let rows = state
        .store
        .evaluation_definitions(scope, query.after.as_deref())
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(page(
        rows.into_iter().map(|row| json!(row)).collect(),
        "slug",
    )))
}
/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/evaluations/{slug}",
///   "method": "get",
///   "operation": {
///     "operationId": "getWorkspaceReviewEvaluation",
///     "summary": "Review: Read a current or historical evaluation definition",
///     "description": "Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       },
///       {
///         "name": "revision",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 9007199254740991
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped evidence",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/EvaluationDefinition"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid input or mismatched evaluation binding"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Current delegated capability required"
///       },
///       "404": {
///         "description": "Scoped definition or run not found"
///       },
///       "409": {
///         "description": "Revision or immutable submission conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn evaluation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((workspace, name)): Path<(Uuid, String)>,
    Query(query): Query<Version>,
) -> Result<Json<Value>, ApiError> {
    let scope = scope(&state, &headers, workspace).await?;
    slug(&name)?;
    if query
        .revision
        .is_some_and(|value| !(1..=9_007_199_254_740_991).contains(&value))
    {
        return Err(ApiError::invalid_request("Invalid evaluation revision"));
    }
    Ok(Json(json!(
        state
            .store
            .evaluation_definition(scope, &name, query.revision)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(ApiError::not_found)?
    )))
}
/// Save a workspace evaluation definition under the current member Write authority.
pub async fn put_evaluation(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((workspace, name)): Path<(Uuid, String)>,
    input: Result<Json<EvaluationDefinition>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let scope = crate::admin::workspace_aliases::authorize_workspace(
        &state,
        &headers,
        workspace,
        AdminPermission::Write,
    )
    .await?
    .1;
    slug(&name)?;
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Invalid evaluation definition"))?;
    if name != input.slug {
        return Err(ApiError::invalid_request(
            "Path and definition slug must match",
        ));
    }
    let saved = state
        .store
        .set_evaluation_definition_for_scope(scope, &input)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!(saved)))
}
/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/evaluations/{slug}/runs",
///   "method": "get",
///   "operation": {
///     "operationId": "listWorkspaceReviewEvaluationRuns",
///     "summary": "Review: List immutable evaluation run receipts",
///     "description": "Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       },
///       {
///         "name": "after",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped evidence",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "type": "object",
///                     "properties": {
///                       "slug": {
///                         "type": "string"
///                       },
///                       "name": {
///                         "type": "string"
///                       },
///                       "evaluation_revision": {
///                         "type": "integer"
///                       },
///                       "created_at": {
///                         "type": "string"
///                       },
///                       "evaluator": {
///                         "type": "object"
///                       },
///                       "summary": {
///                         "$ref": "#/components/schemas/EvaluationSummary"
///                       }
///                     },
///                     "required": [
///                       "slug",
///                       "name",
///                       "evaluation_revision",
///                       "created_at",
///                       "evaluator",
///                       "summary"
///                     ]
///                   }
///                 },
///                 "next_after": {
///                   "type": [
///                     "string",
///                     "null"
///                   ]
///                 }
///               },
///               "required": [
///                 "data",
///                 "next_after"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid input or mismatched evaluation binding"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Current delegated capability required"
///       },
///       "404": {
///         "description": "Scoped definition or run not found"
///       },
///       "409": {
///         "description": "Revision or immutable submission conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn runs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((workspace, name)): Path<(Uuid, String)>,
    Query(query): Query<Page>,
) -> Result<Json<Value>, ApiError> {
    let scope = scope(&state, &headers, workspace).await?;
    slug(&name)?;
    if let Some(after) = &query.after {
        slug(after)?;
    }
    Ok(Json(page(
        state
            .store
            .evaluation_runs(scope, &name, query.after.as_deref())
            .await
            .map_err(ApiError::from_store)?,
        "slug",
    )))
}
/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/evaluations/{slug}/runs/{run}",
///   "method": "get",
///   "operation": {
///     "operationId": "getWorkspaceReviewEvaluationRun",
///     "summary": "Review: Read an immutable evaluation receipt",
///     "description": "Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       },
///       {
///         "name": "run",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped evidence",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/EvaluationReceipt"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid input or mismatched evaluation binding"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Current delegated capability required"
///       },
///       "404": {
///         "description": "Scoped definition or run not found"
///       },
///       "409": {
///         "description": "Revision or immutable submission conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn run(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((workspace, name, run)): Path<(Uuid, String, String)>,
) -> Result<Json<Value>, ApiError> {
    let scope = scope(&state, &headers, workspace).await?;
    slug(&name)?;
    slug(&run)?;
    Ok(Json(
        state
            .store
            .evaluation_run(scope, &name, &run)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(ApiError::not_found)?,
    ))
}
/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/evaluations/{slug}/compare",
///   "method": "get",
///   "operation": {
///     "operationId": "compareWorkspaceReviewEvaluationRuns",
///     "summary": "Review: Compare verified matched evaluation samples",
///     "description": "Read-only workspace review under a current member session with Read permission (including Viewer); an installation administrator can also inspect explicitly scoped records. No workspace API key or delegated agent credential is required or accepted as member authority. Authenticate before scope resolution; foreign or missing workspaces return 404. No-store. Customer charges only; no signing credentials or procurement information. Stored judgments remain attributed evidence, not platform guarantees.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       },
///       {
///         "name": "left",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       },
///       {
///         "name": "right",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped evidence",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "left": {
///                   "type": "string"
///                 },
///                 "right": {
///                   "type": "string"
///                 },
///                 "same_task_protocol_and_rubric": {
///                   "type": "boolean"
///                 },
///                 "same_evaluator": {
///                   "type": "boolean"
///                 },
///                 "quality_comparable": {
///                   "type": "boolean"
///                 },
///                 "matched_verified_samples": {
///                   "type": "integer"
///                 },
///                 "shared_operations": {
///                   "type": "integer"
///                 },
///                 "left_unmatched_samples": {
///                   "type": "integer"
///                 },
///                 "right_unmatched_samples": {
///                   "type": "integer"
///                 },
///                 "left_summary": {
///                   "$ref": "#/components/schemas/EvaluationSummary"
///                 },
///                 "right_summary": {
///                   "$ref": "#/components/schemas/EvaluationSummary"
///                 }
///               },
///               "required": [
///                 "left",
///                 "right",
///                 "same_task_protocol_and_rubric",
///                 "same_evaluator",
///                 "quality_comparable",
///                 "matched_verified_samples",
///                 "shared_operations",
///                 "left_unmatched_samples",
///                 "right_unmatched_samples",
///                 "left_summary",
///                 "right_summary"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid input or mismatched evaluation binding"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Current delegated capability required"
///       },
///       "404": {
///         "description": "Scoped definition or run not found"
///       },
///       "409": {
///         "description": "Revision or immutable submission conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn compare(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((workspace, name)): Path<(Uuid, String)>,
    Query(query): Query<Comparison>,
) -> Result<Json<Value>, ApiError> {
    let scope = scope(&state, &headers, workspace).await?;
    slug(&name)?;
    slug(&query.left)?;
    slug(&query.right)?;
    Ok(Json(
        state
            .store
            .compare_evaluation_runs(scope, &name, &query.left, &query.right)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(ApiError::not_found)?,
    ))
}
