//! Administrator endpoints. The configured token bootstraps installation ownership;
//! durable operator sessions carry role-based access after setup.
pub mod asset_requests;
pub mod chat_sessions;
pub mod guardrails;
pub(crate) mod key_concurrency;
pub mod key_ip;
pub(crate) mod key_request_rate;
pub mod key_spending;
pub(crate) mod key_token_rate;
mod operator_audit;
pub mod passwords;
pub mod preferences;
pub mod profile;
pub mod request_exports;
pub mod request_payloads;
mod session;
pub mod workspace_spending;
pub use operator_audit::operator_events;
pub use session::current_session;

use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use niu_storage::{AdminPermission, OperatorAuditActor, OperatorScope, TenantScope};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct Name {
    name: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OrganizationInput {
    name: String,
    #[serde(default = "default_billing_currency")]
    currency: String,
}

fn default_billing_currency() -> String {
    "USD".to_owned()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceInput {
    name: String,
    organization_id: Option<Uuid>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct KeyInput {
    name: String,
    #[serde(default = "all_model_aliases")]
    allowed_models: Vec<String>,
    ttl_seconds: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct KeyMetadataInput {
    name: String,
    allowed_models: Vec<String>,
    expected_revision: i64,
}

fn all_model_aliases() -> Vec<String> {
    vec!["*".to_owned()]
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OperatorInput {
    organization_id: Uuid,
    project_id: Option<Uuid>,
    name: String,
    role: niu_storage::OperatorRole,
    expires_in_seconds: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OperatorSessionInput {
    expires_in_seconds: i64,
}

#[derive(Deserialize)]
pub struct QuotaWindowQuery {
    window_key: String,
}

async fn authorize(
    state: &AppState,
    headers: &HeaderMap,
    permission: AdminPermission,
) -> Result<crate::state::AdminAuthorization, ApiError> {
    state.authorize_admin_headers(headers, permission).await
}

fn audit_actor(authorization: crate::state::AdminAuthorization) -> OperatorAuditActor {
    match authorization {
        crate::state::AdminAuthorization::Installation => OperatorAuditActor::Installation,
        crate::state::AdminAuthorization::Operator(operator) => {
            OperatorAuditActor::Operator(operator.id)
        }
    }
}

async fn authorize_project(
    state: &AppState,
    headers: &HeaderMap,
    permission: AdminPermission,
    organization_id: Uuid,
    project_id: Uuid,
) -> Result<crate::state::AdminAuthorization, ApiError> {
    let authorization = authorize(state, headers, permission).await?;
    if authorization.permits_project(TenantScope {
        organization_id,
        project_id,
    }) {
        Ok(authorization)
    } else {
        Err(ApiError::not_found())
    }
}

// Wholesale costs are platform records, never customer or supplier entitlements.
async fn authorize_platform(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    if !authorize(state, headers, AdminPermission::Read)
        .await?
        .can_manage_platform()
    {
        return Err(ApiError::forbidden());
    }
    Ok(())
}

async fn authorize_operator_management(
    state: &AppState,
    headers: &HeaderMap,
    operator_id: Uuid,
) -> Result<crate::state::AdminAuthorization, ApiError> {
    let authorization = authorize(state, headers, AdminPermission::ManageOperators).await?;
    if authorization.is_installation() {
        return Ok(authorization);
    }
    let operator = state
        .store
        .operator(operator_id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let Some(organization_id) = operator.organization_id else {
        return Err(ApiError::not_found());
    };
    let scope = OperatorScope {
        organization_id,
        project_id: operator.project_id,
    };
    if authorization.permits_operator_scope(scope) {
        Ok(authorization)
    } else {
        Err(ApiError::not_found())
    }
}
fn validate_name(name: &str) -> Result<(), ApiError> {
    if name.trim().is_empty() || name.len() > 200 {
        return Err(ApiError::invalid_request(
            "Name must contain 1 to 200 bytes",
        ));
    }
    Ok(())
}

/// ```openapi
/// {
///   "path": "/admin/v1/setup/default-workspace",
///   "method": "post",
///   "operation": {
///     "operationId": "getOrCreateDefaultWorkspace",
///     "x-niu-implementation": "implemented",
///     "summary": "Get or create the installation default workspace",
///     "description": "Installation credential only. First use atomically creates company/workspace ownership and a zero-funded USD balance account with zero approved credit. Repeated and concurrent calls reuse the designated default. Existing defaults retain their billing configuration. Development login uses the same first-use initializer. No API key, payment receipt or spending capacity is created. No request body is required. The legacy project_id field identifies the workspace; these identifiers are routing references, not display labels.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Stable default ownership references, without a data wrapper.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "organization_id",
///                 "project_id"
///               ],
///               "additionalProperties": false,
///               "properties": {
///                 "organization_id": {
///                   "type": "string",
///                   "format": "uuid"
///                 },
///                 "project_id": {
///                   "type": "string",
///                   "format": "uuid",
///                   "description": "Workspace routing identifier."
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Missing, invalid, expired or inference-only credential."
///       },
///       "403": {
///         "description": "Authenticated member lacks installation authority, including a platform administrator."
///       }
///     }
///   }
/// }
/// ```
pub async fn default_workspace(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    if !authorize(&state, &headers, AdminPermission::Write)
        .await?
        .is_installation()
    {
        return Err(ApiError::forbidden());
    }
    let scope = state
        .store
        .default_prepaid_workspace()
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({ "organization_id": scope.organization_id, "project_id": scope.project_id }),
    ))
}

pub async fn workspaces(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let authorization = authorize(&state, &headers, AdminPermission::Read).await?;
    let (organization_id, project_id) = match authorization {
        crate::state::AdminAuthorization::Installation => (None, None),
        crate::state::AdminAuthorization::Operator(operator) => (
            Some(operator.scope.organization_id),
            operator.scope.project_id,
        ),
    };
    let workspaces = state
        .store
        .workspaces(organization_id, project_id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": workspaces})))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}",
///   "method": "patch",
///   "operation": {
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
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
///       }
///     ],
///     "operationId": "renameWorkspace",
///     "summary": "Rename a workspace",
///     "description": "Requires scoped workspace write access. Trims the saved name. Returns the existing workspace identity and new name; no optimistic revision is accepted.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "required": [
///               "name"
///             ],
///             "properties": {
///               "name": {
///                 "type": "string",
///                 "description": "Must contain non-whitespace text and be at most 200 UTF-8 bytes before trimming."
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Saved workspace name",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "id",
///                 "name"
///               ],
///               "properties": {
///                 "id": {
///                   "type": "string",
///                   "format": "uuid"
///                 },
///                 "name": {
///                   "type": "string"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid name or identifier"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Write permission required"
///       },
///       "404": {
///         "description": "Workspace missing or outside authorized scope"
///       },
///       "422": {
///         "description": "Invalid body shape"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub async fn rename_workspace(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    Json(input): Json<Name>,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
    validate_name(&input.name)?;
    if !state
        .store
        .rename_workspace(
            TenantScope {
                organization_id,
                project_id,
            },
            &input.name,
        )
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({"id":project_id,"name":input.name.trim()})))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}",
///   "method": "delete",
///   "operation": {
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
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
///       }
///     ],
///     "operationId": "deleteWorkspace",
///     "summary": "Delete an empty workspace",
///     "description": "Requires installation authority or company-level membership with member-management permission. Workspace-scoped members cannot delete a workspace. Referenced workspaces are protected by storage foreign keys and return 409; no cascade deletion of business history is requested.",
///     "responses": {
///       "204": {
///         "description": "Workspace deleted; empty body"
///       },
///       "400": {
///         "description": "Invalid identifier"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Required company-level management permission missing"
///       },
///       "404": {
///         "description": "Workspace missing or outside authorized scope"
///       },
///       "409": {
///         "description": "Workspace still has dependent records"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub async fn delete_workspace(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, ApiError> {
    let authorization = authorize_project(
        &state,
        &headers,
        AdminPermission::ManageOperators,
        organization_id,
        project_id,
    )
    .await?;
    if let crate::state::AdminAuthorization::Operator(operator) = authorization
        && operator.scope.project_id.is_some()
    {
        return Err(ApiError::forbidden());
    }
    if !state
        .store
        .delete_empty_workspace(TenantScope {
            organization_id,
            project_id,
        })
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::not_found());
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn create_workspace(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<WorkspaceInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let authorization = authorize(&state, &headers, AdminPermission::Write).await?;
    validate_name(&input.name)?;
    let organization_id = match authorization {
        crate::state::AdminAuthorization::Installation => input.organization_id,
        crate::state::AdminAuthorization::Operator(operator) => {
            if operator.scope.project_id.is_some()
                || input
                    .organization_id
                    .is_some_and(|organization| organization != operator.scope.organization_id)
            {
                return Err(ApiError::not_found());
            }
            Some(operator.scope.organization_id)
        }
    };
    let organization_id = match organization_id {
        Some(organization) => organization,
        None => state
            .store
            .create_prepaid_organization("Personal workspace", "USD")
            .await
            .map_err(ApiError::from_store)?,
    };
    let scope = state
        .store
        .create_project(organization_id, &input.name)
        .await
        .map_err(ApiError::from_store)?;
    let workspace = state
        .store
        .workspaces(Some(scope.organization_id), Some(scope.project_id))
        .await
        .map_err(ApiError::from_store)?
        .into_iter()
        .next()
        .ok_or_else(ApiError::not_found)?;
    Ok((StatusCode::CREATED, Json(json!(workspace))))
}

pub async fn organization(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<OrganizationInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    if !authorize(&state, &headers, AdminPermission::Write)
        .await?
        .is_installation()
    {
        return Err(ApiError::forbidden());
    }
    validate_name(&input.name)?;
    if input.currency.len() != 3 || !input.currency.bytes().all(|b| b.is_ascii_uppercase()) {
        return Err(ApiError::invalid_request(
            "Currency must be a three-letter uppercase code",
        ));
    }
    let id = state
        .store
        .create_prepaid_organization(&input.name, &input.currency)
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({"id": id, "name": input.name, "currency": input.currency})),
    ))
}

pub async fn project(
    State(state): State<AppState>,
    Path(organization_id): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<Name>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let authorization = authorize(&state, &headers, AdminPermission::Write).await?;
    if !authorization.permits_project_creation(organization_id) {
        return Err(ApiError::not_found());
    }
    validate_name(&input.name)?;
    let scope = state
        .store
        .create_project(organization_id, &input.name)
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        Json(
            json!({"id": scope.project_id, "organization_id": organization_id, "name": input.name}),
        ),
    ))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/keys",
///   "method": "post",
///   "operation": {
///     "operationId": "issueKey",
///     "summary": "Issue a workspace API key and return its secret once",
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
///       }
///     ],
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "$ref": "#/components/schemas/KeyInput"
///           }
///         }
///       }
///     },
///     "responses": {
///       "201": {
///         "description": "Issued key identity and one-time secret.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/IssuedWorkspaceKey"
///             }
///           }
///         },
///         "headers": {
///           "Cache-Control": {
///             "description": "Secrets must not be cached.",
///             "schema": {
///               "type": "string",
///               "const": "no-store"
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Invalid or expired administrative credential.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       },
///       "404": {
///         "description": "Workspace outside authorized scope.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       },
///       "403": {
///         "description": "Workspace write permission required.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid fields, model grants, name or lifetime.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           },
///           "text/plain": {
///             "schema": {
///               "type": "string",
///               "description": "Framework path or JSON syntax rejection may use a plain-text body instead of the application error envelope."
///             }
///           }
///         }
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "description": "Requires workspace write access. Workspace API keys do not authorize these management operations. Grants must be visible model aliases, or the wildcard * as the sole grant. The token is returned only in this response."
///   }
/// }
/// ```
pub async fn issue_key(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    input: Result<Json<KeyInput>, axum::extract::rejection::JsonRejection>,
) -> Result<(StatusCode, [(String, String); 1], Json<Value>), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
    let Json(input) = input.map_err(|_| {
        ApiError::invalid_request(
            "Provide only name, allowed_models and ttl_seconds when creating a workspace API key",
        )
    })?;
    let mut models = crate::vendors::scoped_models(&state, organization_id).await?;
    models.extend(
        crate::codex::private_models(
            &state,
            TenantScope {
                organization_id,
                project_id,
            },
        )
        .await?,
    );
    let all_models = input.allowed_models.len() == 1 && input.allowed_models[0] == "*";
    if (!all_models && input.allowed_models.iter().any(|m| !models.contains_key(m)))
        || (input.allowed_models.iter().any(|model| model == "*") && !all_models)
    {
        return Err(ApiError::invalid_request("Every granted model must exist"));
    }
    let issued = state
        .store
        .issue_key(
            TenantScope {
                organization_id,
                project_id,
            },
            &input.name,
            &input.allowed_models,
            input.ttl_seconds,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        [("cache-control".into(), "no-store".into())],
        Json(json!({"id": issued.id, "token": issued.token})),
    ))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}",
///   "method": "delete",
///   "operation": {
///     "operationId": "revokeKey",
///     "summary": "Revoke a workspace API key",
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
///         "name": "key",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "204": {
///         "description": "Key revoked, including an already revoked key."
///       },
///       "401": {
///         "description": "Invalid or expired administrative credential.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       },
///       "409": {
///         "description": "Key does not exist in this project.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       },
///       "404": {
///         "description": "Workspace outside authorized scope.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       },
///       "403": {
///         "description": "Workspace write permission required.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "description": "Requires workspace write access. Workspace API keys do not authorize these management operations."
///   }
/// }
/// ```
pub async fn revoke_key(
    State(state): State<AppState>,
    Path((organization_id, project_id, key_id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
    state
        .store
        .revoke_key(
            TenantScope {
                organization_id,
                project_id,
            },
            key_id,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}",
///   "method": "patch",
///   "operation": {
///     "operationId": "updateKeyMetadata",
///     "summary": "Update workspace API key name and model grants",
///     "description": "Requires workspace write access. Changes the saved name and model grants without returning or rotating the secret or extending expiry. Subsequent requests use the current grants; this does not cancel already dispatched requests. expected_revision is an integer, unlike decimal-string policy revisions. A no-op edit retains its revision; a changed edit increments it. Model aliases must exist in the authorized scope. The wildcard must be the sole grant.",
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
///         "name": "key",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "name",
///               "allowed_models",
///               "expected_revision"
///             ],
///             "properties": {
///               "name": {
///                 "type": "string",
///                 "description": "Trimmed before persistence; must be nonempty and at most 200 UTF-8 bytes."
///               },
///               "allowed_models": {
///                 "type": "array",
///                 "minItems": 1,
///                 "items": {
///                   "type": "string"
///                 },
///                 "description": "Existing scoped aliases, each nonempty and at most 200 UTF-8 bytes; [\"*\"] grants all eligible models."
///               },
///               "expected_revision": {
///                 "type": "integer",
///                 "format": "int64",
///                 "minimum": 1
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Current metadata revision; no secret is returned",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "revision"
///               ],
///               "properties": {
///                 "revision": {
///                   "type": "integer",
///                   "format": "int64",
///                   "minimum": 1
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid name, model grants or revision",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           },
///           "text/plain": {
///             "schema": {
///               "type": "string",
///               "description": "Framework path or JSON syntax rejection may use a plain-text body instead of the application error envelope."
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Authentication required",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       },
///       "403": {
///         "description": "Write permission required",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       },
///       "404": {
///         "description": "Workspace access not granted",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       },
///       "409": {
///         "description": "Stale revision, missing key, revoked key or expired key",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       },
///       "422": {
///         "description": "Invalid JSON shape, missing or unknown fields"
///       },
///       "503": {
///         "description": "Durable storage unavailable",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn update_key_metadata(
    State(state): State<AppState>,
    Path((organization_id, project_id, key_id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<KeyMetadataInput>,
) -> Result<Json<Value>, ApiError> {
    let authorization = authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let mut models = crate::vendors::scoped_models(&state, organization_id).await?;
    models.extend(crate::codex::private_models(&state, scope).await?);
    let all_models = input.allowed_models.len() == 1 && input.allowed_models[0] == "*";
    if (!all_models && input.allowed_models.iter().any(|m| !models.contains_key(m)))
        || (input.allowed_models.iter().any(|m| m == "*") && !all_models)
    {
        return Err(ApiError::invalid_request("Every granted model must exist"));
    }
    let actor = match authorization {
        crate::state::AdminAuthorization::Installation => "installation".to_owned(),
        crate::state::AdminAuthorization::Operator(operator) => format!("operator:{}", operator.id),
    };
    let revision = state
        .store
        .update_key_metadata(
            scope,
            key_id,
            &input.name,
            &input.allowed_models,
            input.expected_revision,
            &actor,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"revision": revision})))
}

pub async fn create_account(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<niu_storage::AccountInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
    let id = state
        .store
        .create_account(
            TenantScope {
                organization_id,
                project_id,
            },
            &input,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({"id": id, "health": "unverified"})),
    ))
}

pub async fn accounts(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    let accounts = state
        .store
        .accounts(TenantScope {
            organization_id,
            project_id,
        })
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": accounts})))
}

pub async fn quota(
    State(state): State<AppState>,
    Path((organization_id, project_id, account)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    let windows = state
        .store
        .quota(
            TenantScope {
                organization_id,
                project_id,
            },
            account,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": windows})))
}

pub async fn account_executions(
    State(state): State<AppState>,
    Path((organization_id, project_id, account)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    let executions = state
        .store
        .executions_for_account(
            TenantScope {
                organization_id,
                project_id,
            },
            account,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": executions})))
}

/// Ingest an independently observed provider quota window. This endpoint only
/// records the sample; it never refreshes credentials or resets provider state.
pub async fn observe_quota(
    State(state): State<AppState>,
    Path((organization_id, project_id, account)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    body: Result<Json<niu_storage::QuotaInput>, axum::extract::rejection::JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let header = headers
        .get("authorization")
        .and_then(|value| value.to_str().ok());
    let token = header
        .and_then(|value| value.strip_prefix("Bearer "))
        .ok_or_else(ApiError::unauthorized)?;
    let local_installation = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await
        .is_ok_and(|authorization| authorization.is_installation());
    let result = if state.admin_tokens.matches(header) || local_installation {
        let Json(input) =
            body.map_err(|_| ApiError::invalid_request("Invalid quota observation JSON"))?;
        state.store.observe_quota(scope, account, &input).await
    } else {
        match state.store.authenticate_operator(token).await {
            Ok(operator) => {
                if !operator.scope.permits_project(scope) {
                    return Err(ApiError::not_found());
                }
                if !operator.role.permits(AdminPermission::Write) {
                    return Err(ApiError::forbidden());
                }
                let Json(input) =
                    body.map_err(|_| ApiError::invalid_request("Invalid quota observation JSON"))?;
                state.store.observe_quota(scope, account, &input).await
            }
            Err(niu_storage::StoreError::Unauthorized) => {
                let Json(input) =
                    body.map_err(|_| ApiError::invalid_request("Invalid quota observation JSON"))?;
                state
                    .store
                    .observe_quota_as_collector(token, scope, account, &input)
                    .await
            }
            Err(error) => return Err(ApiError::from_store(error)),
        }
    };
    let id = result.map_err(ApiError::from_store)?;
    Ok((StatusCode::CREATED, Json(json!({"id": id}))))
}

/// Remove all imported quota samples for one account window. This does not
/// update the provider, subscription, account state, attempts or cost ledger.
pub async fn delete_quota_window(
    State(state): State<AppState>,
    Path((organization_id, project_id, account)): Path<(Uuid, Uuid, Uuid)>,
    Query(query): Query<QuotaWindowQuery>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
    let deleted_count = state
        .store
        .delete_quota_window(
            TenantScope {
                organization_id,
                project_id,
            },
            account,
            &query.window_key,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({
        "window_key": query.window_key,
        "deleted_count": deleted_count,
    })))
}

pub async fn organizations(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let authorization = authorize(&state, &headers, AdminPermission::Read).await?;
    let organizations = match authorization {
        crate::state::AdminAuthorization::Installation => state.store.organizations().await,
        crate::state::AdminAuthorization::Operator(operator) => {
            state.store.organizations_for_scope(operator.scope).await
        }
    }
    .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": organizations})))
}

pub async fn operators(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let authorization = authorize(&state, &headers, AdminPermission::ManageOperators).await?;
    let operators = match authorization {
        crate::state::AdminAuthorization::Installation => state.store.operators().await,
        crate::state::AdminAuthorization::Operator(operator) => {
            state.store.operators_for_scope(operator.scope).await
        }
    }
    .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": operators})))
}

pub async fn create_operator(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<OperatorInput>,
) -> Result<(StatusCode, [(String, String); 1], Json<Value>), ApiError> {
    let scope = OperatorScope {
        organization_id: input.organization_id,
        project_id: input.project_id,
    };
    let authorization = authorize(&state, &headers, AdminPermission::ManageOperators).await?;
    if !authorization.permits_operator_scope(scope) {
        return Err(ApiError::not_found());
    }
    let issued = state
        .store
        .create_operator(
            scope,
            &input.name,
            input.role,
            input.expires_in_seconds,
            audit_actor(authorization),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        [("cache-control".into(), "no-store".into())],
        Json(json!({
            "operator": {
                "id": issued.operator_id,
                "name": input.name.trim(),
                "role": input.role,
                "organization_id": scope.organization_id,
                "project_id": scope.project_id,
                "revoked": false
            },
            "session": issued.session,
            "token": issued.token
        })),
    ))
}

pub async fn operator_sessions(
    State(state): State<AppState>,
    Path(operator_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize_operator_management(&state, &headers, operator_id).await?;
    Ok(Json(json!({
        "data": state.store.operator_sessions(operator_id).await.map_err(ApiError::from_store)?
    })))
}

pub async fn create_operator_session(
    State(state): State<AppState>,
    Path(operator_id): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<OperatorSessionInput>,
) -> Result<(StatusCode, [(String, String); 1], Json<Value>), ApiError> {
    let authorization = authorize_operator_management(&state, &headers, operator_id).await?;
    let issued = state
        .store
        .create_operator_session(
            operator_id,
            input.expires_in_seconds,
            audit_actor(authorization),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        [("cache-control".into(), "no-store".into())],
        Json(json!({"session": issued.session, "token": issued.token})),
    ))
}

pub async fn revoke_operator_session(
    State(state): State<AppState>,
    Path((operator_id, session_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let authorization = authorize_operator_management(&state, &headers, operator_id).await?;
    state
        .store
        .revoke_operator_session(operator_id, session_id, audit_actor(authorization))
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn revoke_operator(
    State(state): State<AppState>,
    Path(operator_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let authorization = authorize_operator_management(&state, &headers, operator_id).await?;
    state
        .store
        .revoke_operator(operator_id, audit_actor(authorization))
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn projects(
    State(state): State<AppState>,
    Path(organization): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let authorization = authorize(&state, &headers, AdminPermission::Read).await?;
    if !authorization.permits_organization(organization) {
        return Err(ApiError::not_found());
    }
    let projects = match authorization {
        crate::state::AdminAuthorization::Installation => state.store.projects(organization).await,
        crate::state::AdminAuthorization::Operator(operator) => {
            state.store.projects_for_scope(operator.scope).await
        }
    }
    .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": projects})))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/keys",
///   "method": "get",
///   "operation": {
///     "operationId": "listKeys",
///     "summary": "List workspace API-key metadata (up to 1000 records)",
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
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped metadata, never token hashes or secrets. Last used is the latest durable dispatch intent, including uncertain attempts; it is not authentication time or proof of upstream completion.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "maxItems": 1000,
///                   "items": {
///                     "$ref": "#/components/schemas/WorkspaceKey"
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Invalid or expired administrative credential.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       },
///       "404": {
///         "description": "Workspace outside authorized scope.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "description": "Requires workspace read access. Workspace API keys do not authorize these management operations."
///   },
///   "schemas": {
///     "WorkspaceKey": {
///       "type": "object",
///       "required": [
///         "id",
///         "revision",
///         "name",
///         "allowed_models",
///         "expires_at_ms",
///         "last_used_at_ms",
///         "revoked",
///         "expired"
///       ],
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "revision": {
///           "type": "integer",
///           "format": "int64",
///           "minimum": 1
///         },
///         "name": {
///           "type": "string"
///         },
///         "allowed_models": {
///           "type": "array",
///           "items": {
///             "type": "string"
///           }
///         },
///         "expires_at_ms": {
///           "type": "integer",
///           "format": "int64"
///         },
///         "last_used_at_ms": {
///           "type": [
///             "integer",
///             "null"
///           ],
///           "format": "int64",
///           "description": "Latest durable dispatch intent in Unix milliseconds. Null means no attributed dispatch is recorded, not that the credential was never authenticated. Rotation preserves the old key's history; its replacement starts without a dispatch record."
///         },
///         "revoked": {
///           "type": "boolean"
///         },
///         "expired": {
///           "type": "boolean"
///         }
///       }
///     },
///     "KeyInput": {
///       "type": "object",
///       "additionalProperties": false,
///       "description": "Unknown fields are rejected. Configure per-key customer spending, IP allowlist, rolling request rate, token budgets and concurrent-request limits through their separate key management APIs. Key creation does not set these policies. Workspace and company financial limits still apply; rotation preserves the key lineage policies.",
///       "required": [
///         "name",
///         "ttl_seconds"
///       ],
///       "properties": {
///         "name": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200
///         },
///         "allowed_models": {
///           "type": "array",
///           "minItems": 1,
///           "default": [
///             "*"
///           ],
///           "description": "Deprecated. Omit to grant every model available to this workspace; explicit aliases are retained for compatibility. The wildcard must be the only entry when used.",
///           "items": {
///             "type": "string"
///           }
///         },
///         "ttl_seconds": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 31536000
///         }
///       }
///     },
///     "IssuedWorkspaceKey": {
///       "type": "object",
///       "required": [
///         "id",
///         "token"
///       ],
///       "additionalProperties": false,
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "token": {
///           "type": "string",
///           "description": "One-time workspace API key secret; store securely. Never present in key metadata reads."
///         }
///       }
///     },
///     "ApiErrorResponse": {
///       "type": "object",
///       "required": [
///         "error"
///       ],
///       "description": "Gateway application error envelope. This does not describe framework body/path parsing failures or a proxy-generated response. Branch on error.type and HTTP status rather than matching message text.",
///       "properties": {
///         "error": {
///           "type": "object",
///           "required": [
///             "message",
///             "type",
///             "param",
///             "code"
///           ],
///           "properties": {
///             "message": {
///               "type": "string",
///               "description": "Safe human-readable explanation; not a stable programmatic identifier."
///             },
///             "type": {
///               "type": "string",
///               "description": "Machine-readable failure category; new categories may be added."
///             },
///             "param": {
///               "type": "null"
///             },
///             "code": {
///               "type": "integer",
///               "minimum": 400,
///               "maximum": 599,
///               "description": "HTTP status code, not a separate application error number."
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn keys(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    Ok(Json(
        json!({"data":state.store.list_keys(TenantScope { organization_id, project_id }).await.map_err(ApiError::from_store)?}),
    ))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/rotate",
///   "method": "post",
///   "operation": {
///     "operationId": "rotateKey",
///     "summary": "Atomically replace a key while preserving its grants and expiry",
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
///         "name": "key",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "201": {
///         "description": "Issued key identity and one-time secret.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/IssuedWorkspaceKey"
///             }
///           }
///         },
///         "headers": {
///           "Cache-Control": {
///             "description": "Secrets must not be cached.",
///             "schema": {
///               "type": "string",
///               "const": "no-store"
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Invalid or expired administrative credential.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       },
///       "409": {
///         "description": "Key is absent, revoked, expired or concurrently rotated.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       },
///       "404": {
///         "description": "Workspace outside authorized scope.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       },
///       "403": {
///         "description": "Workspace write permission required.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/ApiErrorResponse"
///             }
///           }
///         }
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "description": "Requires workspace write access. Workspace API keys do not authorize these management operations. Revokes the old secret atomically. The replacement preserves grants, expiry, spending identity and configured key policies; rotation does not reset consumed allowance."
///   }
/// }
/// ```
pub async fn rotate_key(
    State(state): State<AppState>,
    Path((organization_id, project_id, key_id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<(StatusCode, [(String, String); 1], Json<Value>), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
    let issued = state
        .store
        .rotate_key(
            TenantScope {
                organization_id,
                project_id,
            },
            key_id,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        [("cache-control".into(), "no-store".into())],
        Json(json!({"id":issued.id,"token":issued.token})),
    ))
}

/// Decimal strings preserve exact BIGINT values for JavaScript clients.
pub async fn budget(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    authorize_platform(&state, &headers).await?;
    let budget = state
        .store
        .budget(TenantScope {
            organization_id,
            project_id,
        })
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": budget.map(|b| json!({
        "currency": b.currency,
        "limit_nanos": b.limit_nanos.to_string(),
        "reserved_nanos": b.reserved_nanos.to_string(),
        "spent_nanos": b.spent_nanos.to_string(),
        "period": "lifetime"
    }))})))
}

#[derive(Deserialize)]
pub struct CostQuery {
    after: Option<Uuid>,
    limit: Option<u16>,
}

pub async fn costs(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    axum::extract::Query(query): axum::extract::Query<CostQuery>,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    authorize_platform(&state, &headers).await?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) {
        return Err(ApiError::invalid_request("Limit must be between 1 and 100"));
    }
    let mut entries = state
        .store
        .cost_entries(
            TenantScope {
                organization_id,
                project_id,
            },
            query.after,
            i64::from(limit) + 1,
        )
        .await
        .map_err(ApiError::from_store)?;
    let has_more = entries.len() > usize::from(limit);
    entries.truncate(usize::from(limit));
    let next_cursor = if has_more {
        entries.last().map(|e| e.attempt_id)
    } else {
        None
    };
    let data: Vec<Value> = entries.into_iter().map(cost_entry_json).collect();
    Ok(Json(json!({"data": data, "next_cursor": next_cursor})))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GatewayActivityQuery {
    http_status: Option<String>,
    sort: Option<String>,
    limit: Option<u16>,
    after: Option<Uuid>,
    from_ms: Option<i64>,
    to_ms: Option<i64>,
    model_alias: Option<String>,
    key_id: Option<Uuid>,
    status: Option<String>,
}

pub(super) fn gateway_activity_filter(
    query: &GatewayActivityQuery,
) -> Result<niu_storage::GatewayActivityFilter, ApiError> {
    if matches!((query.from_ms, query.to_ms), (Some(from), Some(to)) if from >= to) {
        return Err(ApiError::invalid_request(
            "from_ms must be earlier than to_ms",
        ));
    }
    const MIN_TIMESTAMP_MS: i64 = -62_135_596_800_000;
    const MAX_TIMESTAMP_MS: i64 = 253_402_300_799_999;
    if query
        .from_ms
        .is_some_and(|time| !(MIN_TIMESTAMP_MS..=MAX_TIMESTAMP_MS).contains(&time))
        || query
            .to_ms
            .is_some_and(|time| !(MIN_TIMESTAMP_MS..=MAX_TIMESTAMP_MS).contains(&time))
    {
        return Err(ApiError::invalid_request(
            "Date filters must be valid Unix epoch milliseconds",
        ));
    }
    if query
        .model_alias
        .as_ref()
        .is_some_and(|alias| alias.is_empty() || alias.len() > 200)
    {
        return Err(ApiError::invalid_request(
            "model_alias must contain 1 to 200 bytes",
        ));
    }
    if query.status.as_deref().is_some_and(|status| {
        !matches!(
            status,
            "not_sent"
                | "may_have_executed"
                | "confirmed_completed"
                | "confirmed_not_executed"
                | "output_withheld"
                | "delivery_failed"
        )
    }) {
        return Err(ApiError::invalid_request("Unsupported request status"));
    }
    let sort = match query.sort.as_deref().unwrap_or("time_desc") {
        "time_desc" => niu_storage::GatewayActivitySort::Newest,
        "time_asc" => niu_storage::GatewayActivitySort::Oldest,
        "latency_desc" => niu_storage::GatewayActivitySort::Latency,
        "input_desc" => niu_storage::GatewayActivitySort::InputTokens,
        "output_desc" => niu_storage::GatewayActivitySort::OutputTokens,
        _ => return Err(ApiError::invalid_request("Unsupported request sort")),
    };
    let delivery_status = match query.http_status.as_deref() {
        None => None,
        Some("unknown") => Some(niu_storage::GatewayDeliveryFilter::Unknown),
        Some(value) if value.len() == 3 && value.bytes().all(|c| c.is_ascii_digit()) => {
            let code = value
                .parse::<i32>()
                .map_err(|_| ApiError::invalid_request("Unsupported HTTP status"))?;
            if !(100..=599).contains(&code) {
                return Err(ApiError::invalid_request(
                    "HTTP status must be 100 to 599 or unknown",
                ));
            }
            Some(niu_storage::GatewayDeliveryFilter::HttpStatus(code))
        }
        Some(_) => {
            return Err(ApiError::invalid_request(
                "HTTP status must be 100 to 599 or unknown",
            ));
        }
    };
    Ok(niu_storage::GatewayActivityFilter {
        sort,
        delivery_status,
        from_ms: query.from_ms,
        to_ms: query.to_ms,
        model_alias: query.model_alias.clone(),
        api_key_id: query.key_id,
        execution: query.status.clone(),
    })
}

/// Read the request metadata that the gateway records automatically. Bodies,
/// prompts and model responses are never included.
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}",
///   "method": "get",
///   "operation": {
///     "operationId": "getGatewayRequest",
///     "summary": "Read a recorded gateway request",
///     "description": "Scoped workspace read access required. Returns persisted metadata, usage, timing, safe failure classification and customer charges without prompts, response bodies or Supplier procurement costs. Missing or foreign attempts return 404. Unknown values remain null. Legacy correlation fields are opaque metadata. Does not contact the upstream service or change billing.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "parameters": [
///       {
///         "in": "path",
///         "name": "organization",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "in": "path",
///         "name": "project",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "in": "path",
///         "name": "attempt",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Saved request metadata. Cache-Control: no-store.",
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
///                   "$ref": "#/components/schemas/GatewayRequestMetadata"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Workspace read permission denied"
///       },
///       "404": {
///         "description": "Workspace or request unavailable in this scope"
///       }
///     }
///   },
///   "schemas": {
///     "GatewayRequestMetadata": {
///       "type": "object",
///       "required": [
///         "attempt_id",
///         "operation_id",
///         "api_key_id",
///         "key_name",
///         "task_id",
///         "provider_model",
///         "output_guardrail_outcome",
///         "customer_charge_currency",
///         "task_evidence",
///         "request_kind",
///         "model",
///         "created_at",
///         "execution",
///         "usage_confidence",
///         "customer_charge_status",
///         "dispatched_at",
///         "completed_at",
///         "duration_ms",
///         "prompt_tokens",
///         "completion_tokens",
///         "cached_input_tokens",
///         "reasoning_output_tokens",
///         "customer_charge_nanos",
///         "timing",
///         "failure",
///         "finish_reasons"
///       ],
///       "properties": {
///         "attempt_id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "operation_id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "api_key_id": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "uuid"
///         },
///         "key_name": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "task_id": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "provider_model": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "output_guardrail_outcome": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "customer_charge_currency": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "task_evidence": {
///           "description": "Legacy optional correlation metadata; not request content or a complete agent trace."
///         },
///         "request_kind": {
///           "type": "string"
///         },
///         "model": {
///           "type": "string"
///         },
///         "created_at": {
///           "type": "string"
///         },
///         "execution": {
///           "type": "string"
///         },
///         "usage_confidence": {
///           "type": "string"
///         },
///         "customer_charge_status": {
///           "type": "string"
///         },
///         "dispatched_at": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "date-time"
///         },
///         "completed_at": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "date-time"
///         },
///         "duration_ms": {
///           "type": [
///             "integer",
///             "null"
///           ],
///           "description": "Legacy dispatch-to-completion interval, not complete gateway latency."
///         },
///         "prompt_tokens": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         },
///         "completion_tokens": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         },
///         "cached_input_tokens": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         },
///         "reasoning_output_tokens": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         },
///         "customer_charge_nanos": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$",
///           "description": "Customer retail charge only. Null is unknown or absent, never an upstream expense fallback."
///         },
///         "timing": {
///           "type": [
///             "object",
///             "null"
///           ],
///           "required": [
///             "dispatch_ms",
///             "headers_ms",
///             "first_output_ms",
///             "http_status",
///             "total_ms",
///             "complete"
///           ],
///           "properties": {
///             "dispatch_ms": {
///               "type": [
///                 "integer",
///                 "null"
///               ]
///             },
///             "headers_ms": {
///               "type": [
///                 "integer",
///                 "null"
///               ]
///             },
///             "first_output_ms": {
///               "type": [
///                 "integer",
///                 "null"
///               ]
///             },
///             "http_status": {
///               "type": [
///                 "integer",
///                 "null"
///               ]
///             },
///             "total_ms": {
///               "type": "integer"
///             },
///             "complete": {
///               "type": "boolean"
///             }
///           }
///         },
///         "failure": {
///           "type": [
///             "object",
///             "null"
///           ],
///           "required": [
///             "kind",
///             "upstream_http_status"
///           ],
///           "properties": {
///             "kind": {
///               "type": "string"
///             },
///             "upstream_http_status": {
///               "type": [
///                 "integer",
///                 "null"
///               ]
///             }
///           }
///         },
///         "finish_reasons": {
///           "type": [
///             "array",
///             "null"
///           ],
///           "items": {
///             "type": "object",
///             "required": [
///               "index",
///               "reason"
///             ],
///             "properties": {
///               "index": {
///                 "type": "integer"
///               },
///               "reason": {
///                 "type": "string"
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn gateway_request(
    State(state): State<AppState>,
    Path((organization_id, project_id, attempt)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    let data = state
        .store
        .gateway_request(
            TenantScope {
                organization_id,
                project_id,
            },
            attempt,
        )
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(([("cache-control", "no-store")], Json(json!({"data": data}))))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/requests",
///   "method": "get",
///   "operation": {
///     "operationId": "listProjectGatewayActivity",
///     "summary": "Read automatically retained gateway request activity",
///     "description": "Returns metadata for model attempts admitted by Niu, newest first by default, with the requested sort applied to the whole range. Request and response bodies, prompts and completions are not included. Pages are bounded to at most 100 entries. Pass the previous response's next_cursor as after to read older matching entries; traversal is a live view, not a cross-page snapshot. Optional filters apply to the whole workspace scope. summary totals cover the selected filters independent of page. An absent task_id means the caller did not supply X-Niu-Task-ID. Missing usage remains unknown. All workspace responses exclude Supplier expenses and platform margins, including for installation administrators. Customer-facing charges and nullable observed request phase timing are included.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "http_status",
///         "in": "query",
///         "description": "Recorded delivery HTTP status, or unknown when absent; independent of Provider execution.",
///         "schema": {
///           "type": "string",
///           "pattern": "^(unknown|[1-5][0-9]{2})$"
///         }
///       },
///       {
///         "name": "sort",
///         "in": "query",
///         "description": "Full-range order. Known latency/token values precede unknown values; time and ID break ties. Live traversal is not a cross-page snapshot.",
///         "schema": {
///           "type": "string",
///           "enum": [
///             "time_desc",
///             "time_asc",
///             "latency_desc",
///             "input_desc",
///             "output_desc"
///           ],
///           "default": "time_desc"
///         }
///       },
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
///         "name": "after",
///         "in": "query",
///         "description": "Exclusive cursor from the previous page's next_cursor; continue strictly after this attempt in the same sort order; preserve sort and filters across pages.",
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
///           "default": 50
///         }
///       },
///       {
///         "name": "from_ms",
///         "in": "query",
///         "description": "Inclusive creation-time lower bound as Unix epoch milliseconds.",
///         "schema": {
///           "type": "integer",
///           "format": "int64"
///         }
///       },
///       {
///         "name": "to_ms",
///         "in": "query",
///         "description": "Exclusive creation-time upper bound as Unix epoch milliseconds.",
///         "schema": {
///           "type": "integer",
///           "format": "int64"
///         }
///       },
///       {
///         "name": "model_alias",
///         "in": "query",
///         "description": "Exact public model alias filter.",
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200
///         }
///       },
///       {
///         "name": "key_id",
///         "in": "query",
///         "description": "Workspace API key ID filter. Key names and IDs are visible only within the authorized workspace.",
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "status",
///         "in": "query",
///         "description": "Exact gateway execution state, or output_withheld for recorded blocked/indeterminate output inspection. delivery_failed selects recorded HTTP errors (400\u2013599). Completion at the Provider does not establish successful response delivery.",
///         "schema": {
///           "type": "string",
///           "enum": [
///             "not_sent",
///             "may_have_executed",
///             "confirmed_completed",
///             "confirmed_not_executed",
///             "output_withheld",
///             "delivery_failed"
///           ]
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Gateway activity wrapped in data, nullable next_cursor, and summary. Each entry includes attempt_id, operation_id, optional project api_key_id/key_name and task_id, an optional summary of the latest supplemental execution record for that task, public model alias and nullable provider-reported model, creation/dispatch/completion times, duration_ms, execution status, usage confidence, nullable prompt/completion token counts, and nullable customer charge currency/amount/status and request phase timing. Integer quantities and amounts are decimal strings. Pages follow the requested sort; next_cursor is the last attempt_id when further matching entries remain. summary covers all rows matching the filters, not only the current page.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "next_cursor",
///                 "summary"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/GatewayActivity"
///                   }
///                 },
///                 "next_cursor": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "format": "uuid"
///                 },
///                 "summary": {
///                   "type": "object",
///                   "required": [
///                     "request_count",
///                     "usage_count",
///                     "prompt_tokens",
///                     "completion_tokens",
///                     "timing_count",
///                     "average_duration_ms"
///                   ],
///                   "properties": {
///                     "request_count": {
///                       "type": "integer",
///                       "format": "int64"
///                     },
///                     "usage_count": {
///                       "type": "integer",
///                       "format": "int64"
///                     },
///                     "prompt_tokens": {
///                       "type": "string",
///                       "pattern": "^[0-9]+$"
///                     },
///                     "completion_tokens": {
///                       "type": "string",
///                       "pattern": "^[0-9]+$"
///                     },
///                     "timing_count": {
///                       "type": "integer",
///                       "format": "int64"
///                     },
///                     "average_duration_ms": {
///                       "type": [
///                         "integer",
///                         "null"
///                       ],
///                       "minimum": 0,
///                       "description": "Rounded mean of completed gateway request totals over all matching requests. Interrupted phase measurements are excluded. Historical rows without phase timing are excluded because their dispatch interval uses a different boundary. No eligible samples returns null."
///                     },
///                     "unresolved_customer_charge_count": {
///                       "type": "integer",
///                       "minimum": 0
///                     },
///                     "unpriced_request_count": {
///                       "type": "integer",
///                       "minimum": 0
///                     },
///                     "owner_funded_request_count": {
///                       "type": "integer",
///                       "minimum": 0,
///                       "description": "Dispatched requests using the account owner\u2019s API credential without a Niu customer debit."
///                     },
///                     "delivery_statuses": {
///                       "type": "array",
///                       "description": "Counts by recorded delivery HTTP status across all matching requests in the summary snapshot. Null means unknown, not successful or failed.",
///                       "items": {
///                         "type": "object",
///                         "required": [
///                           "http_status",
///                           "request_count"
///                         ],
///                         "properties": {
///                           "http_status": {
///                             "type": [
///                               "integer",
///                               "null"
///                             ],
///                             "minimum": 100,
///                             "maximum": 599
///                           },
///                           "request_count": {
///                             "type": "integer",
///                             "minimum": 0
///                           }
///                         }
///                       }
///                     },
///                     "customer_charges": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "required": [
///                           "currency",
///                           "amount_nanos",
///                           "charged_requests"
///                         ],
///                         "properties": {
///                           "currency": {
///                             "type": "string",
///                             "pattern": "^[A-Z]{3}$"
///                           },
///                           "amount_nanos": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "charged_requests": {
///                             "type": "integer",
///                             "minimum": 0
///                           }
///                         }
///                       }
///                     },
///                     "usage_by_model": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "required": [
///                           "model_alias",
///                           "request_count",
///                           "usage_count",
///                           "prompt_tokens",
///                           "completion_tokens",
///                           "unknown_usage_count"
///                         ],
///                         "properties": {
///                           "model_alias": {
///                             "type": "string"
///                           },
///                           "request_count": {
///                             "type": "integer",
///                             "minimum": 0
///                           },
///                           "usage_count": {
///                             "type": "integer",
///                             "minimum": 0
///                           },
///                           "prompt_tokens": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "completion_tokens": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "unknown_usage_count": {
///                             "type": "integer",
///                             "minimum": 0
///                           }
///                         }
///                       }
///                     },
///                     "charges_by_model": {
///                       "type": "array",
///                       "items": {
///                         "allOf": [
///                           {
///                             "type": "object",
///                             "description": "Full-range customer ledger totals grouped separately by currency; missing amounts stay null. Coverage counts partition each row's requests. Supplier expenses are excluded.",
///                             "required": [
///                               "currency",
///                               "amount_nanos",
///                               "request_count",
///                               "charged_requests",
///                               "unresolved_requests",
///                               "unpriced_requests",
///                               "not_charged_requests"
///                             ],
///                             "properties": {
///                               "currency": {
///                                 "type": [
///                                   "string",
///                                   "null"
///                                 ],
///                                 "pattern": "^[A-Z]{3}$"
///                               },
///                               "amount_nanos": {
///                                 "type": [
///                                   "string",
///                                   "null"
///                                 ],
///                                 "pattern": "^[0-9]+$"
///                               },
///                               "request_count": {
///                                 "type": "integer",
///                                 "minimum": 0
///                               },
///                               "charged_requests": {
///                                 "type": "integer",
///                                 "minimum": 0
///                               },
///                               "unresolved_requests": {
///                                 "type": "integer",
///                                 "minimum": 0
///                               },
///                               "unpriced_requests": {
///                                 "type": "integer",
///                                 "minimum": 0
///                               },
///                               "not_charged_requests": {
///                                 "type": "integer",
///                                 "minimum": 0
///                               }
///                             }
///                           },
///                           {
///                             "type": "object",
///                             "required": [
///                               "model_alias"
///                             ],
///                             "properties": {
///                               "model_alias": {
///                                 "type": "string"
///                               }
///                             }
///                           }
///                         ]
///                       }
///                     },
///                     "charges_by_key": {
///                       "type": "array",
///                       "items": {
///                         "allOf": [
///                           {
///                             "type": "object",
///                             "description": "Full-range customer ledger totals grouped separately by currency; missing amounts stay null. Coverage counts partition each row's requests. Supplier expenses are excluded.",
///                             "required": [
///                               "currency",
///                               "amount_nanos",
///                               "request_count",
///                               "charged_requests",
///                               "unresolved_requests",
///                               "unpriced_requests",
///                               "not_charged_requests"
///                             ],
///                             "properties": {
///                               "currency": {
///                                 "type": [
///                                   "string",
///                                   "null"
///                                 ],
///                                 "pattern": "^[A-Z]{3}$"
///                               },
///                               "amount_nanos": {
///                                 "type": [
///                                   "string",
///                                   "null"
///                                 ],
///                                 "pattern": "^[0-9]+$"
///                               },
///                               "request_count": {
///                                 "type": "integer",
///                                 "minimum": 0
///                               },
///                               "charged_requests": {
///                                 "type": "integer",
///                                 "minimum": 0
///                               },
///                               "unresolved_requests": {
///                                 "type": "integer",
///                                 "minimum": 0
///                               },
///                               "unpriced_requests": {
///                                 "type": "integer",
///                                 "minimum": 0
///                               },
///                               "not_charged_requests": {
///                                 "type": "integer",
///                                 "minimum": 0
///                               }
///                             }
///                           },
///                           {
///                             "type": "object",
///                             "required": [
///                               "api_key_id",
///                               "key_name"
///                             ],
///                             "properties": {
///                               "api_key_id": {
///                                 "type": [
///                                   "string",
///                                   "null"
///                                 ],
///                                 "format": "uuid"
///                               },
///                               "key_name": {
///                                 "type": [
///                                   "string",
///                                   "null"
///                                 ]
///                               }
///                             }
///                           }
///                         ]
///                       }
///                     },
///                     "usage_by_key": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "required": [
///                           "api_key_id",
///                           "key_name",
///                           "request_count",
///                           "usage_count",
///                           "prompt_tokens",
///                           "completion_tokens",
///                           "unknown_usage_count"
///                         ],
///                         "properties": {
///                           "api_key_id": {
///                             "type": [
///                               "string",
///                               "null"
///                             ],
///                             "format": "uuid"
///                           },
///                           "key_name": {
///                             "type": [
///                               "string",
///                               "null"
///                             ]
///                           },
///                           "request_count": {
///                             "type": "integer",
///                             "minimum": 0
///                           },
///                           "usage_count": {
///                             "type": "integer",
///                             "minimum": 0
///                           },
///                           "prompt_tokens": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "completion_tokens": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "unknown_usage_count": {
///                             "type": "integer",
///                             "minimum": 0
///                           }
///                         }
///                       }
///                     },
///                     "latency_percentiles": {
///                       "type": "object",
///                       "description": "Discrete percentiles of completed gateway body-consumption durations across the filtered range, independent of pagination. Incomplete or missing measurements are excluded. This is not client receipt time or upstream-only generation time.",
///                       "required": [
///                         "boundary",
///                         "sample_count",
///                         "p50_ms",
///                         "p95_ms",
///                         "p99_ms"
///                       ],
///                       "properties": {
///                         "boundary": {
///                           "type": "string",
///                           "const": "gateway_body_ms"
///                         },
///                         "sample_count": {
///                           "type": "integer",
///                           "minimum": 0
///                         },
///                         "p50_ms": {
///                           "type": [
///                             "integer",
///                             "null"
///                           ],
///                           "minimum": 0
///                         },
///                         "p95_ms": {
///                           "type": [
///                             "integer",
///                             "null"
///                           ],
///                           "minimum": 0
///                         },
///                         "p99_ms": {
///                           "type": [
///                             "integer",
///                             "null"
///                           ],
///                           "minimum": 0
///                         }
///                       }
///                     },
///                     "token_categories": {
///                       "type": "object",
///                       "description": "Explicitly reported token subsets over the full filtered snapshot. Sums cover reported requests only; null means no observations. Missing category data is never inferred as zero, and no category-specific billing rate is implied.",
///                       "required": [
///                         "cached_input_tokens",
///                         "cached_input_requests",
///                         "cached_input_unknown_requests",
///                         "reasoning_output_tokens",
///                         "reasoning_output_requests",
///                         "reasoning_output_unknown_requests"
///                       ],
///                       "properties": {
///                         "cached_input_tokens": {
///                           "type": [
///                             "string",
///                             "null"
///                           ],
///                           "pattern": "^[0-9]+$"
///                         },
///                         "cached_input_requests": {
///                           "type": "integer",
///                           "minimum": 0
///                         },
///                         "cached_input_unknown_requests": {
///                           "type": "integer",
///                           "minimum": 0
///                         },
///                         "reasoning_output_tokens": {
///                           "type": [
///                             "string",
///                             "null"
///                           ],
///                           "pattern": "^[0-9]+$"
///                         },
///                         "reasoning_output_requests": {
///                           "type": "integer",
///                           "minimum": 0
///                         },
///                         "reasoning_output_unknown_requests": {
///                           "type": "integer",
///                           "minimum": 0
///                         }
///                       }
///                     },
///                     "request_histogram": {
///                       "type": "array",
///                       "maxItems": 24,
///                       "description": "Nonempty time buckets over all filtered requests, independent of pagination. Buckets and other summary aggregates share one database snapshot. Empty ranges return an empty array.",
///                       "items": {
///                         "type": "object",
///                         "required": [
///                           "start_ms",
///                           "end_ms",
///                           "request_count"
///                         ],
///                         "properties": {
///                           "start_ms": {
///                             "type": "integer"
///                           },
///                           "end_ms": {
///                             "type": "integer"
///                           },
///                           "request_count": {
///                             "type": "integer",
///                             "minimum": 1
///                           }
///                         }
///                       }
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         },
///         "headers": {
///           "Cache-Control": {
///             "description": "Request diagnostics must not be cached.",
///             "schema": {
///               "type": "string",
///               "const": "no-store"
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Administrator authentication required."
///       },
///       "400": {
///         "description": "Invalid path or query parameter."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   },
///   "schemas": {
///     "GatewayActivity": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "attempt_id",
///         "operation_id",
///         "api_key_id",
///         "key_name",
///         "task_evidence",
///         "model",
///         "provider_model",
///         "created_at",
///         "execution",
///         "output_guardrail_outcome",
///         "usage_confidence"
///       ],
///       "properties": {
///         "attempt_id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "operation_id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "api_key_id": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "uuid"
///         },
///         "key_name": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "task_id": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "maxLength": 200
///         },
///         "task_evidence": {
///           "oneOf": [
///             {
///               "type": "null"
///             },
///             {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "execution_id",
///                 "source",
///                 "record_id",
///                 "coverage",
///                 "outcomes"
///               ],
///               "properties": {
///                 "execution_id": {
///                   "type": "string",
///                   "format": "uuid",
///                   "description": "Historical correlation reference; external execution imports are no longer supported."
///                 },
///                 "source": {
///                   "type": "string"
///                 },
///                 "record_id": {
///                   "type": "string"
///                 },
///                 "coverage": {
///                   "type": "string",
///                   "enum": [
///                     "complete",
///                     "partial",
///                     "unknown"
///                   ]
///                 },
///                 "outcomes": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "authority",
///                       "result"
///                     ],
///                     "properties": {
///                       "authority": {
///                         "type": "string",
///                         "enum": [
///                           "agent_claim",
///                           "deterministic_validator",
///                           "human_acceptance"
///                         ]
///                       },
///                       "result": {
///                         "type": "string",
///                         "enum": [
///                           "accepted",
///                           "rejected",
///                           "inconclusive"
///                         ]
///                       }
///                     }
///                   }
///                 }
///               }
///             }
///           ]
///         },
///         "model": {
///           "type": "string",
///           "description": "Public model alias requested through Niu."
///         },
///         "request_kind": {
///           "type": "string",
///           "enum": [
///             "video",
///             "inference"
///           ],
///           "description": "Durable video recovery-route identity; model names and pricing alone do not establish video kind."
///         },
///         "provider_model": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "description": "Provider-reported model identity when returned by the provider. It is distinct from the public model alias."
///         },
///         "created_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "dispatched_at": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "date-time"
///         },
///         "completed_at": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "date-time"
///         },
///         "duration_ms": {
///           "type": [
///             "integer",
///             "null"
///           ],
///           "minimum": 0,
///           "description": "Legacy dispatch-to-completion attempt interval. Prefer timing.total_ms when timing.complete is true for the full measured gateway request interval; interrupted timing must not be treated as completed latency."
///         },
///         "execution": {
///           "type": "string"
///         },
///         "output_guardrail_outcome": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "enum": [
///             "allowed",
///             "redacted",
///             "blocked",
///             "indeterminate",
///             null
///           ],
///           "description": "Immutable recorded output inspection. Null means no recorded outcome, not successful delivery or content protection. Blocked/indeterminate output is withheld without cancelling incurred usage or customer charges."
///         },
///         "usage_confidence": {
///           "type": "string"
///         },
///         "prompt_tokens": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         },
///         "completion_tokens": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         },
///         "cached_input_tokens": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$",
///           "description": "Explicitly reported subset of prompt tokens. Null means unknown."
///         },
///         "reasoning_output_tokens": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$",
///           "description": "Explicitly reported subset of completion tokens. Null means unknown."
///         },
///         "failure": {
///           "oneOf": [
///             {
///               "type": "null"
///             },
///             {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "kind",
///                 "upstream_http_status"
///               ],
///               "properties": {
///                 "kind": {
///                   "type": "string",
///                   "enum": [
///                     "upstream_http_error",
///                     "upstream_region_unavailable",
///                     "upstream_timeout",
///                     "upstream_connection_error",
///                     "upstream_transport_error",
///                     "upstream_invalid_response"
///                   ]
///                 },
///                 "upstream_http_status": {
///                   "type": [
///                     "integer",
///                     "null"
///                   ],
///                   "minimum": 100,
///                   "maximum": 599,
///                   "description": "Recorded upstream non-success status. Null for transport or invalid-response classifications. This is independent of the HTTP status delivered by Niu."
///                 }
///               }
///             }
///           ],
///           "description": "Content-free immutable upstream diagnosis, independent of payload retention. Null means no recorded classification, not a successful request. Does not establish execution, usage or billing certainty."
///         },
///         "finish_reasons": {
///           "type": [
///             "array",
///             "null"
///           ],
///           "description": "Explicit allowlisted terminal observations, independent of payload retention. Chat indexes identify choices. For nonstreaming Responses interruptions, index zero identifies the whole response; max_output_tokens maps to length and content_filter maps to content_filter. Completed Responses status alone supplies no stop reason. Null means unknown; finish reasons do not establish task success or customer delivery.",
///           "minItems": 1,
///           "maxItems": 128,
///           "items": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "index",
///               "reason"
///             ],
///             "properties": {
///               "index": {
///                 "type": "integer",
///                 "minimum": 0,
///                 "maximum": 4294967295
///               },
///               "reason": {
///                 "type": "string",
///                 "enum": [
///                   "stop",
///                   "length",
///                   "tool_calls",
///                   "content_filter",
///                   "function_call"
///                 ]
///               }
///             }
///           }
///         },
///         "customer_charge_currency": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[A-Z]{3}$"
///         },
///         "customer_charge_nanos": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         },
///         "customer_charge_status": {
///           "type": "string",
///           "enum": [
///             "charged",
///             "owner_funded",
///             "pending",
///             "unpriced",
///             "not_charged"
///           ]
///         },
///         "timing": {
///           "oneOf": [
///             {
///               "type": "null"
///             },
///             {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "dispatch_ms",
///                 "headers_ms",
///                 "first_output_ms",
///                 "total_ms",
///                 "complete",
///                 "http_status"
///               ],
///               "description": "Monotonic millisecond offsets from gateway request handling. Missing observations stay null; values do not include client network delivery after body consumption. First output means a meaningful streamed Chat event, not a role, keepalive or usage event.",
///               "properties": {
///                 "dispatch_ms": {
///                   "type": [
///                     "integer",
///                     "null"
///                   ],
///                   "minimum": 0
///                 },
///                 "headers_ms": {
///                   "type": [
///                     "integer",
///                     "null"
///                   ],
///                   "minimum": 0
///                 },
///                 "first_output_ms": {
///                   "type": [
///                     "integer",
///                     "null"
///                   ],
///                   "minimum": 0
///                 },
///                 "total_ms": {
///                   "type": "integer",
///                   "minimum": 0
///                 },
///                 "complete": {
///                   "type": "boolean",
///                   "description": "The response body reached EOF without a stream error; not a claim of successful inference."
///                 },
///                 "http_status": {
///                   "type": [
///                     "integer",
///                     "null"
///                   ],
///                   "minimum": 100,
///                   "maximum": 599
///                 }
///               }
///             }
///           ]
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn gateway_activity(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Query(query): Query<GatewayActivityQuery>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) {
        return Err(ApiError::invalid_request("Limit must be between 1 and 100"));
    }
    let filter = gateway_activity_filter(&query)?;
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let summary = state
        .store
        .gateway_activity_summary(scope, &filter)
        .await
        .map_err(ApiError::from_store)?;
    let mut data = state
        .store
        .gateway_activity(scope, query.after, i64::from(limit) + 1, &filter)
        .await
        .map_err(ApiError::from_store)?;
    let has_more = data.len() > usize::from(limit);
    data.truncate(usize::from(limit));
    let next_cursor = has_more
        .then(|| data.last().map(|entry| entry.attempt_id))
        .flatten();
    let data = serde_json::to_value(data)
        .map_err(|_| ApiError::invalid_request("Activity serialization failed"))?;
    let summary = serde_json::to_value(summary)
        .map_err(|_| ApiError::invalid_request("Activity serialization failed"))?;
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"data": data, "next_cursor": next_cursor, "summary": summary})),
    ))
}

fn cost_entry_json(e: niu_storage::CostEntry) -> Value {
    json!({
        "attempt_id": e.attempt_id,
        "price_revision_id": e.price_revision_id,
        "currency": e.currency,
        "api_equivalent_nanos": e.api_equivalent_nanos.to_string(),
        "cash_nanos": e.cash_nanos.to_string(),
        "usage_prompt_tokens": e.usage_prompt_tokens.to_string(),
        "usage_completion_tokens": e.usage_completion_tokens.to_string(),
        "bound_exceeded": e.bound_exceeded
    })
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BudgetInput {
    currency: String,
    limit_nanos: String,
}

pub async fn create_budget(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<BudgetInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    authorize_platform(&state, &headers).await?;
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
    // No float, exponent, signed or whitespace-coerced financial inputs.
    if input.limit_nanos.is_empty() || !input.limit_nanos.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ApiError::invalid_request(
            "limit_nanos must be a nonnegative decimal integer string",
        ));
    }
    let limit = input.limit_nanos.parse::<i64>().map_err(|_| {
        ApiError::invalid_request("limit_nanos exceeds the supported integer range")
    })?;
    state
        .store
        .create_budget(
            TenantScope {
                organization_id,
                project_id,
            },
            &input.currency,
            limit,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({"data": {
            "currency": input.currency, "limit_nanos": limit.to_string(),
            "reserved_nanos": "0", "spent_nanos": "0", "period": "lifetime"
        }})),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CollectorKeyInput {
    #[serde(default = "default_collector_purpose")]
    purpose: String,
    name: String,
    ttl_seconds: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CollectorKeyQuery {
    purpose: Option<String>,
}

fn default_collector_purpose() -> String {
    "quota".into()
}

pub async fn issue_collector_key(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<CollectorKeyInput>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
    if input.purpose != "quota" {
        return Err(ApiError::invalid_request(
            "Only supplier quota collection is supported",
        ));
    }
    let issued = state
        .store
        .issue_collector_key_for(
            TenantScope {
                organization_id,
                project_id,
            },
            &input.name,
            input.ttl_seconds,
            &input.purpose,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"id": issued.id, "token": issued.token})),
    ))
}

pub async fn collector_keys(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Query(query): Query<CollectorKeyQuery>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    let data = state
        .store
        .list_collector_keys(
            TenantScope {
                organization_id,
                project_id,
            },
            query.purpose.as_deref(),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(([("cache-control", "no-store")], Json(json!({"data": data}))))
}

pub async fn revoke_collector_key(
    State(state): State<AppState>,
    Path((organization_id, project_id, id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
    state
        .store
        .revoke_collector_key(
            TenantScope {
                organization_id,
                project_id,
            },
            id,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

/// Analyze an already-collected paired dataset. This endpoint is stateless and
/// never dispatches inference or writes imported traces or cost entries.
pub async fn compare_benchmark(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(dataset): Json<niu_benchmark::PairedExperiment>,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers, AdminPermission::Read).await?;
    let report = dataset.evaluate().map_err(|_| {
        ApiError::invalid_request("Invalid paired benchmark dataset or incomplete cost evidence")
    })?;
    Ok(Json(json!({ "data": report })))
}
