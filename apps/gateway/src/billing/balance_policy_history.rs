//! Read-only company financial policy history, distinct from platform pricing.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use niu_storage::AdminPermission;
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;

#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub(crate) struct Page {
    before: Option<String>,
    limit: Option<i64>,
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/accounts/{currency}/policy/history",
///   "method": "get",
///   "operation": {
///     "operationId": "getCustomerBalancePolicyHistory",
///     "summary": "Read immutable company credit and warning policy revisions",
///     "description": "Organization-wide owner/admin or installation administration required, using the same authorization as company balance reads. Workspace-only sessions and company viewers cannot read shared financial policy. No account IDs, payment references or Supplier prices. Exact amounts and revisions are decimal strings. Revision-descending keyset pages use one database snapshot per request; separate pages do not share a snapshot. Missing currency account returns 404; missing revision cursor returns 409. Revision zero with empty history denotes an account with no policy writes. This read does not change funds or credit. Cache-Control no-store.",
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
///         "name": "currency",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         }
///       },
///       {
///         "name": "before",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "pattern": "^[1-9][0-9]*$"
///         },
///         "description": "Exclusive existing revision cursor."
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
///         "description": "Current revision and history page",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "current_revision",
///                 "data",
///                 "next_before"
///               ],
///               "properties": {
///                 "current_revision": {
///                   "type": "string",
///                   "pattern": "^[0-9]+$"
///                 },
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "revision",
///                       "credit_limit_nanos",
///                       "warning_threshold_nanos",
///                       "created_at",
///                       "is_current"
///                     ],
///                     "properties": {
///                       "revision": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "credit_limit_nanos": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "warning_threshold_nanos": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^[0-9]+$"
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "is_current": {
///                         "type": "boolean"
///                       }
///                     },
///                     "additionalProperties": false
///                   }
///                 },
///                 "next_before": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "pattern": "^[1-9][0-9]*$"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid currency, revision or page query"
///       },
///       "401": {
///         "description": "Invalid session"
///       },
///       "404": {
///         "description": "Account absent or company billing access denied"
///       },
///       "409": {
///         "description": "Cursor revision does not exist for this account"
///       }
///     }
///   }
/// }
/// ```
pub(crate) async fn history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization, currency)): Path<(Uuid, String)>,
    page: Result<Query<Page>, axum::extract::rejection::QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !auth.permits_billing_account(organization) {
        return Err(ApiError::not_found());
    }
    let Query(page) =
        page.map_err(|_| ApiError::invalid_request("Invalid policy history query"))?;
    let before = page
        .before
        .as_deref()
        .map(super::exact_nonnegative_integer)
        .transpose()?;
    state
        .store
        .customer_balance_policy_history(organization, &currency, before, page.limit.unwrap_or(50))
        .await
        .map_err(ApiError::from_store)?
        .map(Json)
        .ok_or_else(ApiError::not_found)
}
