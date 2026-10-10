//! Per-key customer spending management; secret rotations share one limit.
use super::{
    AdminPermission, ApiError, AppState, HeaderMap, Json, Path, Query, State, TenantScope, Uuid,
    Value, authorize_project, json,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LimitInput {
    #[serde(deserialize_with = "nullable_amount")]
    limit_nanos: Option<String>,
    expected_revision: String,
}
fn nullable_amount<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(d)
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
            "Use nonnegative decimal integer strings",
        ));
    }
    value
        .parse()
        .map_err(|_| ApiError::invalid_request("Amount or revision exceeds the supported range"))
}
fn currency(value: &str) -> Result<(), ApiError> {
    if value.len() != 3 || !value.bytes().all(|b| b.is_ascii_uppercase()) {
        return Err(ApiError::invalid_request(
            "A three-letter uppercase account currency is required",
        ));
    }
    Ok(())
}
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit",
///   "method": "get",
///   "operation": {
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "operationId": "listKeySpendingLimits",
///     "description": "Scoped readers may inspect customer commitments. Rotated keys share the original spending identity. Personal upstream routes do not consume customer funds. No Supplier costs or company balance are exposed.",
///     "responses": {
///       "200": {
///         "description": "Account currencies and lifetime key commitments; null limit means unlimited and null revision means never configured.",
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
///                     "type": "object",
///                     "required": [
///                       "currency",
///                       "limit_nanos",
///                       "revision",
///                       "committed_nanos",
///                       "remaining_nanos"
///                     ],
///                     "properties": {
///                       "currency": {
///                         "type": "string",
///                         "pattern": "^[A-Z]{3}$"
///                       },
///                       "limit_nanos": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^[0-9]+$"
///                       },
///                       "revision": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^[0-9]+$"
///                       },
///                       "committed_nanos": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "remaining_nanos": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^[0-9]+$",
///                         "description": "Maximum of cap minus committed customer amount and zero; null for unlimited. This is key allowance only, not company balance or guaranteed admission."
///                       }
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
///         "description": "Workspace access denied"
///       },
///       "404": {
///         "description": "Key does not exist in the authorized workspace"
///       }
///     },
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
///     "x-niu-implementation": "implemented",
///     "summary": "List API key spending limits"
///   }
/// }
/// ```
pub async fn list(
    State(state): State<AppState>,
    Path((organization, workspace, key)): Path<(Uuid, Uuid, Uuid)>,
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
    if !state
        .store
        .key_spending_scope_exists(scope, key)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(
        json!({"data":state.store.customer_key_spending_limits(scope,key).await.map_err(ApiError::from_store)?}),
    ))
}
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit/{currency}",
///   "method": "put",
///   "operation": {
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "operationId": "setKeySpendingLimit",
///     "description": "Workspace/company owner or installation administrator. Cap includes settled customer charges minus refunds plus unreleased reservations, across secret rotations. Lowering below committed liability is rejected. Account and workspace limits still apply. Writes do not add funds. Null explicitly restores unlimited; omission is rejected.",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "limit_nanos",
///               "expected_revision"
///             ],
///             "properties": {
///               "limit_nanos": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "pattern": "^[0-9]+$",
///                 "description": "Nonnegative signed-64-bit nanounits or explicit null."
///               },
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$",
///                 "description": "Zero for initial configuration; maximum 9223372036854775806."
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "New immutable policy revision recorded.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "properties": {
///                     "revision": {
///                       "type": "string",
///                       "pattern": "^[1-9][0-9]*$"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid amount or currency"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "402": {
///         "description": "Proposed limit is below committed key liability"
///       },
///       "403": {
///         "description": "Owner permission required"
///       },
///       "404": {
///         "description": "Key does not exist in the authorized workspace"
///       },
///       "409": {
///         "description": "Stale revision",
///         "missing account": null,
///         "or unresolved attribution": null
///       },
///       "422": {
///         "description": "Missing or invalid body fields"
///       }
///     },
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
///       },
///       {
///         "name": "currency",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         }
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "summary": "Set API key spending limit"
///   }
/// }
/// ```
pub async fn write(
    State(state): State<AppState>,
    Path((organization, workspace, key, unit)): Path<(Uuid, Uuid, Uuid, String)>,
    headers: HeaderMap,
    Json(input): Json<LimitInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization,
        workspace,
    )
    .await?;
    if matches!(auth,crate::state::AdminAuthorization::Operator(ref operator) if operator.role!=niu_storage::OperatorRole::Owner)
    {
        return Err(ApiError::forbidden());
    }
    currency(&unit)?;
    let scope = TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    if !state
        .store
        .key_spending_scope_exists(scope, key)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::not_found());
    }
    let revision = state
        .store
        .set_customer_key_spending_limit(
            scope,
            key,
            &unit,
            input.limit_nanos.as_deref().map(decimal).transpose()?,
            decimal(&input.expected_revision)?,
            super::audit_actor(auth),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":revision.to_string()}})))
}
/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/keys/{key}/spending-limit/{currency}/history",
///   "method": "get",
///   "operation": {
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "operationId": "listKeySpendingLimitHistory",
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
///       },
///       {
///         "name": "currency",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         }
///       },
///       {
///         "name": "before_revision",
///         "in": "query",
///         "schema": {
///           "type": "integer",
///           "minimum": 1
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
///       }
///     ],
///     "description": "Descending immutable revision history shared across rotations. Use the last returned revision as before_revision for the next page. Returns currency, nullable limit_nanos, revision, recorded_at, actor_kind and actor_name; never an internal actor identifier.",
///     "responses": {
///       "200": {
///         "description": "Data array of policy revisions",
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
///                     "type": "object",
///                     "required": [
///                       "currency",
///                       "limit_nanos",
///                       "revision",
///                       "recorded_at",
///                       "actor_kind",
///                       "actor_name"
///                     ],
///                     "properties": {
///                       "currency": {
///                         "type": "string",
///                         "pattern": "^[A-Z]{3}$"
///                       },
///                       "limit_nanos": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^[0-9]+$"
///                       },
///                       "revision": {
///                         "type": "string",
///                         "pattern": "^[1-9][0-9]*$"
///                       },
///                       "recorded_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "actor_kind": {
///                         "type": "string",
///                         "enum": [
///                           "installation",
///                           "member"
///                         ]
///                       },
///                       "actor_name": {
///                         "type": "string"
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
///         "description": "Invalid currency or pagination"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Workspace access denied"
///       },
///       "404": {
///         "description": "Key does not exist in the authorized workspace"
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "summary": "List API key spending history"
///   }
/// }
/// ```
pub async fn history(
    State(state): State<AppState>,
    Path((organization, workspace, key, unit)): Path<(Uuid, Uuid, Uuid, String)>,
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
    currency(&unit)?;
    let Query(query) =
        query.map_err(|_| ApiError::invalid_request("Invalid key-limit history query"))?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) || query.before_revision.is_some_and(|r| r <= 0) {
        return Err(ApiError::invalid_request(
            "Invalid history cursor or page size",
        ));
    }
    let scope = TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    if !state
        .store
        .key_spending_scope_exists(scope, key)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(
        json!({"data":state.store.customer_key_limit_history(scope,key,&unit,query.before_revision,limit).await.map_err(ApiError::from_store)?}),
    ))
}
