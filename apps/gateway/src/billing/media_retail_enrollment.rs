//! Workspace media selling configuration; procurement and route eligibility stay separate.
use super::{ApiError, AppState, HeaderMap, Json, Path, Query, State, Uuid, Value};
use niu_storage::{
    MediaBillingDimensions, OperatorAuditActor, RetailMediaEnrollmentPublication, TenantScope,
};
use serde::Deserialize;
use serde_json::json;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IdentityQuery {
    model: String,
    channel: String,
    resolution: String,
    reference_video: bool,
    meter: String,
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/billing/media-retail-price-enrollment",
///   "method": "post",
///   "operation": {
///     "operationId": "setRetailMediaEnrollment",
///     "summary": "Set workspace media selling-price enrollment",
///     "description": "Exact workspace/media dimensions/meter identity; currency follows the enrolled price. Platform administration is required for changes. Reads require this workspace authority or platform administration and reveal only its own effective selling price. No procurement or other customer promotions are returned. price_id must be explicitly present: null restores legacy media-card selection for future operations. The published media price must exactly match dimensions and meter and have an existing customer currency account. No balance, credit, route, qualification or operation is created. expected_version is zero initially; exact idempotent retries preserve their original outcome, changed reuse and stale versions conflict. Read effective_price is advisory, not a pinned task price or dispatch qualification. UTC epoch times and amounts are exact strings. Cache-Control: no-store for reads. Video admission reselects at a shared database time and atomically pins customer/Provider prices, independently qualified quantity, provenance and funds. Enrolling a price alone does not enable generation; exact current qualified supply and a supported route remain required. Existing task prices are not reselected after admission.",
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
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Committed configuration or own advisory read",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "properties": {
///                     "revision": {
///                       "type": "string",
///                       "format": "uuid"
///                     },
///                     "version": {
///                       "type": "string",
///                       "pattern": "^[0-9]+$"
///                     },
///                     "dimensions": {
///                       "type": "object",
///                       "additionalProperties": false,
///                       "properties": {
///                         "model": {
///                           "type": "string"
///                         },
///                         "channel": {
///                           "type": "string"
///                         },
///                         "resolution": {
///                           "type": "string"
///                         },
///                         "reference_video": {
///                           "type": "boolean"
///                         }
///                       },
///                       "required": [
///                         "model",
///                         "channel",
///                         "resolution",
///                         "reference_video"
///                       ]
///                     },
///                     "meter": {
///                       "type": "string"
///                     },
///                     "price_id": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "format": "uuid"
///                     }
///                   },
///                   "required": [
///                     "revision",
///                     "version",
///                     "dimensions",
///                     "meter",
///                     "price_id"
///                   ]
///                 }
///               },
///               "required": [
///                 "data"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid exact identity, reason or version"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Explicit platform administration required for changes"
///       },
///       "404": {
///         "description": "Workspace outside authority"
///       },
///       "409": {
///         "description": "Stale version, conflicting key, mismatched price or absent existing currency account"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "properties": {
///               "dimensions": {
///                 "type": "object",
///                 "additionalProperties": false,
///                 "properties": {
///                   "model": {
///                     "type": "string"
///                   },
///                   "channel": {
///                     "type": "string"
///                   },
///                   "resolution": {
///                     "type": "string"
///                   },
///                   "reference_video": {
///                     "type": "boolean"
///                   }
///                 },
///                 "required": [
///                   "model",
///                   "channel",
///                   "resolution",
///                   "reference_video"
///                 ]
///               },
///               "meter": {
///                 "type": "string"
///               },
///               "price_id": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "format": "uuid"
///               },
///               "expected_version": {
///                 "type": "string",
///                 "pattern": "^[0-9]+$"
///               },
///               "idempotency_key": {
///                 "type": "string",
///                 "format": "uuid"
///               },
///               "reason": {
///                 "type": "string"
///               }
///             },
///             "required": [
///               "dimensions",
///               "meter",
///               "price_id",
///               "expected_version",
///               "idempotency_key",
///               "reason"
///             ]
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn publish(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, project)): Path<(Uuid, Uuid)>,
    Json(input): Json<RetailMediaEnrollmentPublication>,
) -> Result<Json<Value>, ApiError> {
    let actor = match state.authorize_platform_headers(&headers).await? {
        crate::state::AdminAuthorization::Installation => OperatorAuditActor::Installation,
        crate::state::AdminAuthorization::Operator(member) => {
            OperatorAuditActor::Operator(member.id)
        }
    };
    let scope = TenantScope {
        organization_id: organization,
        project_id: project,
    };
    let result = state
        .store
        .publish_retail_media_enrollment(scope, &input, actor)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":result})))
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/billing/media-retail-price-enrollment",
///   "method": "get",
///   "operation": {
///     "operationId": "getRetailMediaEnrollment",
///     "summary": "Read workspace media selling-price enrollment",
///     "description": "Exact workspace/media dimensions/meter identity; currency follows the enrolled price. Platform administration is required for changes. Reads require this workspace authority or platform administration and reveal only its own effective selling price. No procurement or other customer promotions are returned. price_id must be explicitly present: null restores legacy media-card selection for future operations. The published media price must exactly match dimensions and meter and have an existing customer currency account. No balance, credit, route, qualification or operation is created. expected_version is zero initially; exact idempotent retries preserve their original outcome, changed reuse and stale versions conflict. Read effective_price is advisory, not a pinned task price or dispatch qualification. UTC epoch times and amounts are exact strings. Cache-Control: no-store for reads. Video admission reselects at a shared database time and atomically pins customer/Provider prices, independently qualified quantity, provenance and funds. Enrolling a price alone does not enable generation; exact current qualified supply and a supported route remain required. Existing task prices are not reselected after admission.",
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
///         "name": "model",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       },
///       {
///         "name": "channel",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       },
///       {
///         "name": "resolution",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       },
///       {
///         "name": "reference_video",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "boolean"
///         }
///       },
///       {
///         "name": "meter",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string"
///         }
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "responses": {
///       "200": {
///         "description": "Committed configuration or own advisory read",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "properties": {
///                     "dimensions": {
///                       "type": "object",
///                       "additionalProperties": false,
///                       "properties": {
///                         "model": {
///                           "type": "string"
///                         },
///                         "channel": {
///                           "type": "string"
///                         },
///                         "resolution": {
///                           "type": "string"
///                         },
///                         "reference_video": {
///                           "type": "boolean"
///                         }
///                       },
///                       "required": [
///                         "model",
///                         "channel",
///                         "resolution",
///                         "reference_video"
///                       ]
///                     },
///                     "meter": {
///                       "type": "string"
///                     },
///                     "price_id": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "format": "uuid"
///                     },
///                     "version": {
///                       "type": "string",
///                       "pattern": "^[0-9]+$"
///                     },
///                     "pricing_source": {
///                       "type": "string",
///                       "enum": [
///                         "workspace",
///                         "platform"
///                       ]
///                     },
///                     "effective_price": {
///                       "oneOf": [
///                         {
///                           "$ref": "#/components/schemas/RetailSelection"
///                         },
///                         {
///                           "type": "null"
///                         }
///                       ]
///                     }
///                   },
///                   "required": [
///                     "dimensions",
///                     "meter",
///                     "price_id",
///                     "version",
///                     "pricing_source",
///                     "effective_price"
///                   ]
///                 }
///               },
///               "required": [
///                 "data"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid exact identity, reason or version"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Explicit platform administration required for changes"
///       },
///       "404": {
///         "description": "Workspace outside authority"
///       },
///       "409": {
///         "description": "Stale version, conflicting key, mismatched price or absent existing currency account"
///       }
///     }
///   }
/// }
/// ```
pub async fn read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, project)): Path<(Uuid, Uuid)>,
    Query(query): Query<IdentityQuery>,
) -> Result<impl axum::response::IntoResponse, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, niu_storage::AdminPermission::Read)
        .await?;
    let scope = TenantScope {
        organization_id: organization,
        project_id: project,
    };
    if !auth.can_manage_platform() && !auth.permits_project(scope) {
        return Err(ApiError::not_found());
    }
    let dimensions = MediaBillingDimensions {
        model: query.model,
        channel: query.channel,
        resolution: query.resolution,
        reference_video: query.reference_video,
    };
    let result = state
        .store
        .retail_media_enrollment(scope, &dimensions, &query.meter)
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"data":result})),
    ))
}
