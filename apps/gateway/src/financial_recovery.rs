//! Platform-only recovery diagnostics, independent of customer accounting views.
use crate::{error::ApiError, state::AppState};
use axum::{Json, extract::State, http::HeaderMap};
use serde_json::Value;

/// ```openapi
/// {
///   "path": "/api/v1/platform/financial-recovery",
///   "method": "get",
///   "operation": {
///     "x-niu-implementation": "implemented",
///     "operationId": "getFinancialRecoveryDiagnostics",
///     "summary": "Read committed financial recovery progress",
///     "description": "Platform administrators only. Stages are ordered by name. Null step fields mean no durable worker step has committed since diagnostics were installed. Counts describe the last committed candidate page, not settled rows, total backlog or throughput. A cursor indicates traversal position, not remaining recoverable debt. Zero failures does not establish settlement. Storage failures leave previous committed diagnostics unchanged and are reported separately in worker logs. No attempt IDs, amounts or credentials.",
///     "tags": [
///       "Platform administration"
///     ],
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Committed stage diagnostics",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "observed_at",
///                 "data"
///               ],
///               "properties": {
///                 "observed_at": {
///                   "type": "string",
///                   "format": "date-time"
///                 },
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "stage",
///                       "last_step_at",
///                       "last_candidate_count",
///                       "last_failure_count",
///                       "has_cursor"
///                     ],
///                     "properties": {
///                       "stage": {
///                         "type": "string",
///                         "enum": [
///                           "balance_release",
///                           "customer_charge",
///                           "customer_media_charge",
///                           "media_completion",
///                           "supplier_earning",
///                           "upstream_cost"
///                         ]
///                       },
///                       "last_step_at": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "date-time"
///                       },
///                       "last_candidate_count": {
///                         "type": [
///                           "integer",
///                           "null"
///                         ],
///                         "minimum": 0
///                       },
///                       "last_failure_count": {
///                         "type": [
///                           "integer",
///                           "null"
///                         ],
///                         "minimum": 0
///                       },
///                       "has_cursor": {
///                         "type": "boolean"
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
///         "description": "Platform administration required"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub async fn diagnostics(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    state
        .store
        .financial_recovery_diagnostics()
        .await
        .map(Json)
        .map_err(ApiError::from_store)
}
