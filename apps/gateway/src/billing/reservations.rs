//! Financial hold inspection shares company balance authorization.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, header},
    response::{IntoResponse, Response},
};
use niu_storage::AdminPermission;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Page {
    before: Option<Uuid>,
    currency: Option<String>,
    limit: Option<u32>,
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/billing/reservations",
///   "method": "get",
///   "operation": {
///     "operationId": "listCustomerBalanceReservations",
///     "summary": "Inspect open customer balance reservations",
///     "description": "Organization-wide owner/admin or installation read access required, matching company balance permissions. Newest-first keyset pages observe one statement snapshot; pages do not share a snapshot. Released reservations are omitted, but a released cursor remains usable. Unknown or foreign cursors and currency-mismatched cursors return 409. Exact nanounit strings distinguish the original reservation from outstanding liability, including known media overrun and excluding posted charge debits. This is a read-only diagnostic; states do not prove nonexecution or authorize releasing funds or retrying inference. No Supplier prices, upstream endpoints, credentials or payment references are exposed. Names are current display metadata; IDs are internal links only. Cache-Control no-store.",
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
///         "name": "before",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "currency",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "pattern": "^[A-Z]{3}$"
///         }
///       },
///       {
///         "name": "limit",
///         "in": "query",
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 100,
///           "default": 100
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Open reservations; empty data is not evidence that paid accounting works.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "next_before"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "attempt_id",
///                       "workspace_id",
///                       "api_key_id",
///                       "workspace_name",
///                       "model",
///                       "execution",
///                       "usage_confidence",
///                       "api_key_name",
///                       "currency",
///                       "reserved_nanos",
///                       "outstanding_nanos",
///                       "created_at",
///                       "observed_at",
///                       "status"
///                     ],
///                     "properties": {
///                       "attempt_id": {
///                         "type": "string",
///                         "format": "uuid",
///                         "description": "Internal API reference; do not render as a product label."
///                       },
///                       "workspace_id": {
///                         "type": "string",
///                         "format": "uuid",
///                         "description": "Internal API reference; do not render as a product label."
///                       },
///                       "api_key_id": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "uuid",
///                         "description": "Internal API reference; do not render as a product label."
///                       },
///                       "workspace_name": {
///                         "type": "string"
///                       },
///                       "model": {
///                         "type": "string"
///                       },
///                       "execution": {
///                         "type": "string"
///                       },
///                       "usage_confidence": {
///                         "type": "string"
///                       },
///                       "api_key_name": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "currency": {
///                         "type": "string",
///                         "pattern": "^[A-Z]{3}$"
///                       },
///                       "reserved_nanos": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "outstanding_nanos": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "observed_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "status": {
///                         "type": "string",
///                         "enum": [
///                           "preparing",
///                           "in_progress",
///                           "execution_unknown",
///                           "usage_unknown",
///                           "settlement_pending"
///                         ]
///                       }
///                     }
///                   }
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
///         "description": "Invalid currency, cursor, limit or query fields."
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "404": {
///         "description": "Company balance permission required."
///       },
///       "409": {
///         "description": "Cursor is unknown or does not match the company/currency."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(crate) async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(organization): Path<Uuid>,
    Query(page): Query<Page>,
) -> Result<Response, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?;
    if !auth.permits_billing_account(organization) {
        return Err(ApiError::not_found());
    }
    let (data, next_before) = state
        .store
        .customer_balance_reservation_page(
            organization,
            page.before,
            page.currency.as_deref(),
            page.limit.unwrap_or(100),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(json!({"data":data,"next_before":next_before})),
    )
        .into_response())
}
