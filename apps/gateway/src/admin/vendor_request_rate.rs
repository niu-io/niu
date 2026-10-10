//! Installation-managed request caps on saved upstream credentials.
use super::{
    AdminPermission, ApiError, AppState, HeaderMap, Json, Path, Query, State, Uuid, Value, json,
};
use crate::state::AdminAuthorization;
use niu_storage::OperatorAuditActor;
use serde::Deserialize;

async fn authorize(state: &AppState, headers: &HeaderMap) -> Result<OperatorAuditActor, ApiError> {
    let auth = state
        .authorize_admin_headers(headers, AdminPermission::Read)
        .await?;
    if !auth.can_manage_platform() {
        return Err(ApiError::forbidden());
    }
    Ok(match auth {
        AdminAuthorization::Installation => OperatorAuditActor::Installation,
        AdminAuthorization::Operator(member) => OperatorAuditActor::Operator(member.id),
    })
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Input {
    #[serde(deserialize_with = "required_nullable_limit")]
    requests_per_minute: Option<i64>,
    expected_revision: String,
}
fn required_nullable_limit<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<Option<i64>, D::Error> {
    Option::<i64>::deserialize(d)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct History {
    before_revision: Option<i64>,
    limit: Option<i64>,
}

/// ```openapi
/// {
///   "path": "/admin/v1/vendors/{vendor}/request-rate-limit",
///   "method": "get",
///   "operation": {
///     "operationId": "getVendorRequestRateLimit",
///     "summary": "Read upstream credential request limit",
///     "description": "Platform administration only. Applies to mapped inference dispatches pinned to this saved credential across workspaces and gateway instances, independent of customer key RPM. Null is unlimited; zero denies dispatch. Revision starts at string 0 and survives credential edits. Rolling 60-second admissions count dispatch, including upstream failures and uncertain outcomes; polling and connection checks are not inference dispatch. Unlimited dispatches also count when a cap is subsequently enabled. No automatic route substitution or replay. Duplicated credentials saved under different vendor IDs have independent windows.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "vendor",
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
///         "description": "Current policy or descending immutable history.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/VendorRequestRateLimit"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid limit, revision or query."
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "403": {
///         "description": "Platform administration required."
///       },
///       "404": {
///         "description": "Credential configuration not found."
///       },
///       "409": {
///         "description": "Stale revision on policy update."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   },
///   "schemas": {
///     "VendorRequestRateLimit": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "requests_per_minute",
///         "revision"
///       ],
///       "properties": {
///         "requests_per_minute": {
///           "type": [
///             "integer",
///             "null"
///           ],
///           "minimum": 0,
///           "maximum": 1000000
///         },
///         "revision": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         }
///       }
///     },
///     "VendorRequestRateLimitRevision": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "requests_per_minute",
///         "revision",
///         "recorded_at",
///         "actor_kind",
///         "actor_name"
///       ],
///       "properties": {
///         "requests_per_minute": {
///           "type": [
///             "integer",
///             "null"
///           ],
///           "minimum": 0,
///           "maximum": 1000000
///         },
///         "revision": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "recorded_at": {
///           "type": "string",
///           "format": "date-time"
///         },
///         "actor_kind": {
///           "type": "string",
///           "enum": [
///             "installation",
///             "member"
///           ]
///         },
///         "actor_name": {
///           "type": "string"
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(vendor): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers).await?;
    let data = state
        .store
        .vendor_request_rate_policy(vendor)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data":data})))
}
/// ```openapi
/// {
///   "path": "/admin/v1/vendors/{vendor}/request-rate-limit",
///   "method": "put",
///   "operation": {
///     "operationId": "setVendorRequestRateLimit",
///     "summary": "Set upstream credential request limit",
///     "description": "Platform administration only. Applies to mapped inference dispatches pinned to this saved credential across workspaces and gateway instances, independent of customer key RPM. Null is unlimited; zero denies dispatch. Revision starts at string 0 and survives credential edits. Rolling 60-second admissions count dispatch, including upstream failures and uncertain outcomes; polling and connection checks are not inference dispatch. Unlimited dispatches also count when a cap is subsequently enabled. No automatic route substitution or replay. Duplicated credentials saved under different vendor IDs have independent windows.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "vendor",
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
///         "description": "Current policy or descending immutable history.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data"
///               ],
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/VendorRequestRateLimit"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid limit, revision or query."
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "403": {
///         "description": "Platform administration required."
///       },
///       "404": {
///         "description": "Credential configuration not found."
///       },
///       "409": {
///         "description": "Stale revision on policy update."
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "requests_per_minute",
///               "expected_revision"
///             ],
///             "properties": {
///               "requests_per_minute": {
///                 "type": [
///                   "integer",
///                   "null"
///                 ],
///                 "minimum": 0,
///                 "maximum": 1000000
///               },
///               "expected_revision": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$",
///                 "description": "Exact current revision. Concurrent stale updates return 409."
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn write(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(vendor): Path<Uuid>,
    Json(input): Json<Input>,
) -> Result<Json<Value>, ApiError> {
    let actor = authorize(&state, &headers).await?;
    if input.expected_revision.is_empty()
        || !input.expected_revision.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(ApiError::invalid_request(
            "Expected revision must be a nonnegative integer string",
        ));
    }
    let expected = input.expected_revision.parse::<i64>().map_err(|_| {
        ApiError::invalid_request("Expected revision is outside the supported range")
    })?;
    let revision = state
        .store
        .set_vendor_request_rate_policy(vendor, input.requests_per_minute, expected, actor)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(
        json!({"data":{"requests_per_minute":input.requests_per_minute,"revision":revision.to_string()}}),
    ))
}
/// ```openapi
/// {
///   "path": "/admin/v1/vendors/{vendor}/request-rate-limit/history",
///   "method": "get",
///   "operation": {
///     "operationId": "listVendorRequestRateLimitHistory",
///     "summary": "Read credential request-limit history",
///     "description": "Platform administration only. Applies to mapped inference dispatches pinned to this saved credential across workspaces and gateway instances, independent of customer key RPM. Null is unlimited; zero denies dispatch. Revision starts at string 0 and survives credential edits. Rolling 60-second admissions count dispatch, including upstream failures and uncertain outcomes; polling and connection checks are not inference dispatch. Unlimited dispatches also count when a cap is subsequently enabled. No automatic route substitution or replay. Duplicated credentials saved under different vendor IDs have independent windows.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "vendor",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "before_revision",
///         "in": "query",
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 9223372036854775807
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
///     "responses": {
///       "200": {
///         "description": "Current policy or descending immutable history.",
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
///                     "$ref": "#/components/schemas/VendorRequestRateLimitRevision"
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid limit, revision or query."
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "403": {
///         "description": "Platform administration required."
///       },
///       "404": {
///         "description": "Credential configuration not found."
///       },
///       "409": {
///         "description": "Stale revision on policy update."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(vendor): Path<Uuid>,
    Query(page): Query<History>,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers).await?;
    state
        .store
        .vendor_request_rate_policy(vendor)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let data = state
        .store
        .vendor_request_rate_history(vendor, page.before_revision, page.limit.unwrap_or(50))
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":data})))
}
