//! Platform-only inspection of the fixed safe-failure cooldown policy.
use super::{AdminPermission, ApiError, AppState, HeaderMap, Json, Path, State, Uuid, Value, json};

/// ```openapi
/// {
///   "path": "/admin/v1/vendors/{vendor}/cooldown",
///   "method": "get",
///   "operation": {
///     "operationId": "getVendorCooldown",
///     "summary": "Read credential safe-failure cooldown",
///     "description": "Platform administration only. Fixed policy: three new canonical OpenRouter text authentication rejections with pinned nonexecution qualification within 60 seconds pause new selection for 60 seconds. Further qualifying in-flight failures may extend the deadline; unknown execution never counts. State is shared in PostgreSQL, independent per credential, and survives restart and credential edits. Expiry automatically restores eligibility without a health probe or republish. Does not cancel pinned requests or saved video recovery. No historical failures are backfilled. This read performs no upstream request.",
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
///         "description": "Current state and fixed policy. Expired deadlines may remain in history while active is false.",
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
///                     "policy_revision",
///                     "failure_threshold",
///                     "window_seconds",
///                     "cooldown_seconds",
///                     "active",
///                     "cooldown_until",
///                     "qualifying_failures"
///                   ],
///                   "properties": {
///                     "policy_revision": {
///                       "type": "string",
///                       "const": "openrouter-auth-cooldown-v1"
///                     },
///                     "failure_threshold": {
///                       "type": "integer",
///                       "const": 3
///                     },
///                     "window_seconds": {
///                       "type": "integer",
///                       "const": 60
///                     },
///                     "cooldown_seconds": {
///                       "type": "integer",
///                       "const": 60
///                     },
///                     "active": {
///                       "type": "boolean"
///                     },
///                     "cooldown_until": {
///                       "type": [
///                         "string",
///                         "null"
///                       ],
///                       "format": "date-time"
///                     },
///                     "qualifying_failures": {
///                       "type": "integer",
///                       "minimum": 0,
///                       "description": "New qualifying failures recorded in the current rolling window, not total upstream failures."
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Invalid administrative credential."
///       },
///       "403": {
///         "description": "Platform permission required."
///       },
///       "404": {
///         "description": "Credential not found."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub async fn read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(vendor): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !auth.can_manage_platform() {
        return Err(ApiError::forbidden());
    }
    let data = state
        .store
        .vendor_cooldown(vendor)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data": data})))
}
