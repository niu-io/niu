//! Customer retail workspace limits, separate from procurement administration.
use super::{
    AdminPermission, ApiError, AppState, HeaderMap, Json, Path, Query, State, TenantScope, Uuid,
    Value, authorize_project, json,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LimitInput {
    limit_nanos: String,
    expected_revision: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HistoryQuery {
    before_revision: Option<i64>,
    limit: Option<i64>,
}

fn decimal(value: &str) -> Result<i64, ApiError> {
    if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ApiError::invalid_request(
            "Amounts and revisions must be nonnegative decimal integer strings",
        ));
    }
    value
        .parse()
        .map_err(|_| ApiError::invalid_request("Amount or revision exceeds the supported range"))
}

fn scope(organization_id: Uuid, project_id: Uuid, currency: &str) -> Result<TenantScope, ApiError> {
    if currency.len() != 3 || !currency.bytes().all(|b| b.is_ascii_uppercase()) {
        return Err(ApiError::invalid_request(
            "A three-letter uppercase account currency is required",
        ));
    }
    Ok(TenantScope {
        organization_id,
        project_id,
    })
}

/// Discover usable currencies without granting company-balance access.
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/spending-limit",
///   "method": "get",
///   "operation": {
///     "operationId": "listWorkspaceSpendingLimits",
///     "summary": "List workspace spending currencies",
///     "description": "Workspace readers may discover company account currencies and this workspace commitment without company-balance access. Absent limits and revisions are null. No state is changed.",
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
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Current scoped state",
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
///                   "items": {
///                     "$ref": "#/components/schemas/WorkspaceSpendingSummary"
///                   }
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
///         "description": "Insufficient role permissions"
///       },
///       "404": {
///         "description": "Workspace unavailable in the authorized scope"
///       },
///       "400": {
///         "description": "Invalid currency, decimal value or history query"
///       }
///     }
///   },
///   "schemas": {
///     "WorkspaceSpendingSummary": {
///       "type": "object",
///       "required": [
///         "currency",
///         "limit_nanos",
///         "revision",
///         "committed_nanos"
///       ],
///       "properties": {
///         "currency": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         },
///         "limit_nanos": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$",
///           "description": "Exact nonnegative decimal integer, within signed 64-bit range."
///         },
///         "revision": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$",
///           "description": "Exact nonnegative decimal integer, within signed 64-bit range."
///         },
///         "committed_nanos": {
///           "type": "string",
///           "pattern": "^[0-9]+$",
///           "description": "Exact nonnegative decimal integer, within signed 64-bit range."
///         }
///       }
///     },
///     "WorkspaceSpendingInput": {
///       "type": "object",
///       "required": [
///         "limit_nanos",
///         "expected_revision"
///       ],
///       "properties": {
///         "limit_nanos": {
///           "type": "string",
///           "pattern": "^[0-9]+$",
///           "description": "Exact nonnegative decimal integer, within signed 64-bit range."
///         },
///         "expected_revision": {
///           "type": "string",
///           "pattern": "^[0-9]+$",
///           "description": "Exact nonnegative decimal integer, within signed 64-bit range."
///         }
///       },
///       "additionalProperties": false
///     },
///     "WorkspaceSpendingHistory": {
///       "type": "object",
///       "required": [
///         "currency",
///         "revision",
///         "limit_nanos",
///         "recorded_at",
///         "source",
///         "actor_kind",
///         "actor_name"
///       ],
///       "properties": {
///         "currency": {
///           "type": "string"
///         },
///         "revision": {
///           "type": "string",
///           "pattern": "^[0-9]+$",
///           "description": "Exact nonnegative decimal integer, within signed 64-bit range."
///         },
///         "limit_nanos": {
///           "type": "string",
///           "pattern": "^[0-9]+$",
///           "description": "Exact nonnegative decimal integer, within signed 64-bit range."
///         },
///         "recorded_at": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "date-time"
///         },
///         "source": {
///           "type": "string"
///         },
///         "actor_kind": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "actor_name": {
///           "type": [
///             "string",
///             "null"
///           ]
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn list(
    State(state): State<AppState>,
    Path((organization, workspace)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization,
        workspace,
    )
    .await?;
    let scope = TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    Ok(Json(
        json!({"data": state.store.customer_workspace_spending_limits(scope).await.map_err(ApiError::from_store)?}),
    ))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/spending-limit/{currency}",
///   "method": "get",
///   "operation": {
///     "operationId": "getWorkspaceSpendingLimit",
///     "summary": "Read a workspace spending limit",
///     "description": "Workspace read permission required. Returns data: null when no explicit limit exists. Does not expose company funds or other workspace usage.",
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
///         "name": "currency",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Current scoped state",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "oneOf": [
///                     {
///                       "$ref": "#/components/schemas/WorkspaceSpendingSummary"
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
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Insufficient role permissions"
///       },
///       "404": {
///         "description": "Workspace unavailable in the authorized scope"
///       },
///       "400": {
///         "description": "Invalid currency, decimal value or history query"
///       }
///     }
///   }
/// }
/// ```
pub async fn read(
    State(state): State<AppState>,
    Path((organization, workspace, currency)): Path<(Uuid, Uuid, String)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization,
        workspace,
    )
    .await?;
    let scope = scope(organization, workspace, &currency)?;
    Ok(Json(
        json!({"data":state.store.customer_workspace_spending_limit(scope,&currency).await.map_err(ApiError::from_store)?}),
    ))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/spending-limit/{currency}",
///   "method": "put",
///   "operation": {
///     "operationId": "setWorkspaceSpendingLimit",
///     "summary": "Set a workspace spending limit",
///     "description": "Scoped owner or installation administrator required. Both input fields are nonnegative decimal strings, not null. expected_revision 0 creates the first limit; later writes require the saved revision. Zero denies new paid liability; there is no null reset on this endpoint. A limit below existing commitment is rejected. Writes append actor history and never change company funds.",
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
///         "name": "currency",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Current scoped state",
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
///                     "revision"
///                   ],
///                   "properties": {
///                     "revision": {
///                       "type": "string",
///                       "pattern": "^[0-9]+$",
///                       "description": "Exact nonnegative decimal integer, within signed 64-bit range."
///                     }
///                   }
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
///         "description": "Insufficient role permissions"
///       },
///       "404": {
///         "description": "Workspace unavailable in the authorized scope"
///       },
///       "400": {
///         "description": "Invalid currency, decimal value or history query"
///       },
///       "402": {
///         "description": "Limit is below existing workspace commitment"
///       },
///       "409": {
///         "description": "Revision conflict or unavailable currency account"
///       },
///       "422": {
///         "description": "JSON input shape is invalid"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "$ref": "#/components/schemas/WorkspaceSpendingInput"
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn write(
    State(state): State<AppState>,
    Path((organization, workspace, currency)): Path<(Uuid, Uuid, String)>,
    headers: HeaderMap,
    Json(input): Json<LimitInput>,
) -> Result<Json<Value>, ApiError> {
    let authorization = authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization,
        workspace,
    )
    .await?;
    if matches!(authorization, crate::state::AdminAuthorization::Operator(ref operator) if operator.role != niu_storage::OperatorRole::Owner)
    {
        return Err(ApiError::forbidden());
    }
    let scope = scope(organization, workspace, &currency)?;
    let revision = state
        .store
        .set_customer_workspace_spending_limit_audited(
            scope,
            &currency,
            decimal(&input.limit_nanos)?,
            decimal(&input.expected_revision)?,
            super::audit_actor(authorization),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":revision.to_string()}})))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/spending-limit/{currency}/history",
///   "method": "get",
///   "operation": {
///     "operationId": "listWorkspaceSpendingLimitHistory",
///     "summary": "List workspace spending revisions",
///     "description": "Workspace read permission required. Descending immutable history. before_revision is exclusive. next_before_revision is a decimal string or null; an exactly full final page can yield an empty following page. Baseline timestamps and actor data may be null.",
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
///         "name": "currency",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         }
///       },
///       {
///         "in": "query",
///         "name": "before_revision",
///         "schema": {
///           "type": "integer",
///           "format": "int64",
///           "minimum": 1
///         }
///       },
///       {
///         "in": "query",
///         "name": "limit",
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
///         "description": "Current scoped state",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "next_before_revision"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/WorkspaceSpendingHistory"
///                   }
///                 },
///                 "next_before_revision": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "pattern": "^[0-9]+$",
///                   "description": "Exact nonnegative decimal integer, within signed 64-bit range."
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
///         "description": "Insufficient role permissions"
///       },
///       "404": {
///         "description": "Workspace unavailable in the authorized scope"
///       },
///       "400": {
///         "description": "Invalid currency, decimal value or history query"
///       }
///     }
///   }
/// }
/// ```
pub async fn history(
    State(state): State<AppState>,
    Path((organization, workspace, currency)): Path<(Uuid, Uuid, String)>,
    headers: HeaderMap,
    query: Result<Query<HistoryQuery>, axum::extract::rejection::QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization,
        workspace,
    )
    .await?;
    let scope = scope(organization, workspace, &currency)?;
    let Query(query) =
        query.map_err(|_| ApiError::invalid_request("Invalid spending-limit history query"))?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) || query.before_revision.is_some_and(|r| r <= 0) {
        return Err(ApiError::invalid_request(
            "Invalid spending-limit history cursor or page size",
        ));
    }
    let rows = state
        .store
        .customer_workspace_spending_limit_history(scope, &currency, query.before_revision, limit)
        .await
        .map_err(ApiError::from_store)?;
    // The last returned revision is a stable exclusive cursor; an empty next
    // page is valid when this page is exactly full.
    let next = if rows.len() == limit as usize {
        rows.last().and_then(|row| row.get("revision")).cloned()
    } else {
        None
    };
    Ok(Json(json!({"data":rows,"next_before_revision":next})))
}
