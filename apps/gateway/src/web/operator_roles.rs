//! Customer member role changes reuse existing scoped management authority.
use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{
    Json,
    extract::{Path, State, rejection::JsonRejection},
    http::HeaderMap,
};
use niu_storage::{AdminPermission, OperatorAuditActor, OperatorRole, OperatorScope};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(super) struct RoleUpdate {
    role: OperatorRole,
    expected_role: OperatorRole,
}

/// ```openapi
/// {
///   "path": "/api/v1/operators/{operator}",
///   "method": "patch",
///   "operation": {
///     "operationId": "updateOperatorRole",
///     "summary": "Change a scoped customer member role",
///     "description": "Current scoped Owner management permission or installation administrator required. Admin and Viewer cannot manage user roles. Preserves the original member organization/workspace, credentials, sessions, session expiries and Provider memberships. Rejects self role changes, revoked/noncustomer/platform actors and role-update demotion of the last applicable active Owner. expected_role is a compare-and-set precondition; stale input returns 409 and requires reloading. Organization-scoped serialization and current actor/session validation protect the mutation transaction. A same-role request with a matching precondition returns unchanged metadata without an audit event. Changed roles apply to the original token on its next authenticated request; no replacement token or renewed session is issued. A future immutable role_changed journal records exact before/after roles and actor attribution; historical roles are never inferred. No credentials or commercial data returned.",
///     "tags": [
///       "Administration"
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "operator",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "Scoped Niu user routing reference; never display as a product label."
///       }
///     ],
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "$ref": "#/components/schemas/MemberRoleUpdate"
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Current scoped user metadata; no credential or session renewal",
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
///                   "$ref": "#/components/schemas/MemberRoleChangeView"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid role/input or protected customer actor"
///       },
///       "401": {
///         "description": "Invalid, expired or concurrently revoked management session"
///       },
///       "403": {
///         "description": "Manage-users permission denied or self role change"
///       },
///       "404": {
///         "description": "User outside the actor scope or not a customer user"
///       },
///       "409": {
///         "description": "Stale expected role, revoked user or last Owner protection"
///       },
///       "413": {
///         "description": "Body exceeds bounded request size"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     },
///     "x-niu-implementation": "implemented"
///   },
///   "schemas": {
///     "MemberRoleUpdate": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "role",
///         "expected_role"
///       ],
///       "properties": {
///         "role": {
///           "type": "string",
///           "enum": [
///             "owner",
///             "admin",
///             "viewer"
///           ]
///         },
///         "expected_role": {
///           "type": "string",
///           "enum": [
///             "owner",
///             "admin",
///             "viewer"
///           ]
///         }
///       }
///     },
///     "MemberRoleChangeView": {
///       "type": "object",
///       "required": [
///         "id",
///         "name",
///         "role",
///         "organization_id",
///         "project_id",
///         "revoked"
///       ],
///       "properties": {
///         "id": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "name": {
///           "type": "string"
///         },
///         "role": {
///           "type": "string",
///           "enum": [
///             "owner",
///             "admin",
///             "viewer"
///           ]
///         },
///         "organization_id": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "uuid"
///         },
///         "project_id": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "format": "uuid"
///         },
///         "revoked": {
///           "type": "boolean"
///         }
///       }
///     }
///   }
/// }
/// ```
pub(super) async fn update_operator_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    input: Result<Json<RoleUpdate>, JsonRejection>,
) -> Result<(HeaderMap, Json<Value>), ApiError> {
    let authorization = state
        .authorize_admin_headers(&headers, AdminPermission::ManageOperators)
        .await?;
    let input = input
        .map(|Json(input)| input)
        .map_err(|_| ApiError::invalid_request("Provide role and expected_role only"))?;
    if id.is_nil() {
        return Err(ApiError::invalid_request("Invalid user reference"));
    }
    let target = state
        .store
        .operator(id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let organization = target.organization_id.ok_or_else(ApiError::not_found)?;
    if !authorization.permits_operator_scope(OperatorScope {
        organization_id: organization,
        project_id: target.project_id,
    }) {
        return Err(ApiError::not_found());
    }
    let (actor, principal) = match authorization {
        AdminAuthorization::Installation => (OperatorAuditActor::Installation, None),
        AdminAuthorization::Operator(principal) => {
            if principal.id == id {
                return Err(ApiError::forbidden());
            }
            (OperatorAuditActor::Operator(principal.id), Some(principal))
        }
    };
    let updated = state
        .store
        .update_operator_role(id, input.role, input.expected_role, actor, principal)
        .await
        .map_err(ApiError::from_store)?;
    let mut response_headers = HeaderMap::new();
    response_headers.insert(
        "cache-control",
        "no-store".parse().expect("constant header"),
    );
    Ok((response_headers, Json(json!({"data":updated}))))
}
