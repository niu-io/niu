//! Platform-only operational diagnostics, separate from Provider financial history.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, header},
    response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct UsageQuery {
    from_ms: i64,
    to_ms: i64,
    after: Option<String>,
    #[serde(default = "default_limit")]
    limit: u32,
}
fn default_limit() -> u32 {
    50
}

/// ```openapi
/// {
///   "path": "/api/v1/providers/{provider}/configuration-usage",
///   "method": "get",
///   "operation": {
///     "operationId": "getProviderConfigurationUsage",
///     "summary": "Inspect operational usage of Provider-owned configurations",
///     "description": "Installation credential or explicit platform administrator required. Provider membership and customer roles do not grant access. Uses current explicit configuration ownership and persisted managed/media request routes; includes disabled configurations and does not infer unbound legacy/static traffic. This is current-configuration operational history, not historical financial attribution, qualified commercial supply, earnings or settlement. Counts each dispatched attempt once, including retry attempts. From is inclusive, to exclusive, in epoch milliseconds; maximum range 90 days. Token sums include only complete provider-reported aggregate token usage; unknown requests and non-token media remain separately counted. Failures count persisted safe failure observations, not an inference that every unsuccessful request has one. Timing counts refer to recorded HTTP delivery, not video job completion. Totals cover the whole range regardless of model page. after is an exclusive lexical model-alias boundary, not an identity lookup; pages are live statement snapshots. No customer identity, request/key IDs, endpoint, credentials, costs or prices are returned. No upstream call or mutation. Cache-Control no-store.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "provider",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "name": "from_ms",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "integer",
///           "minimum": 0,
///           "maximum": 253402300799999
///         }
///       },
///       {
///         "name": "to_ms",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 253402300799999
///         }
///       },
///       {
///         "name": "after",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 256
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
///         "description": "Scoped operational counts; not supply or financial qualification.",
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
///                     "from_ms",
///                     "to_ms",
///                     "observed_at",
///                     "totals",
///                     "models",
///                     "next_after"
///                   ],
///                   "properties": {
///                     "from_ms": {
///                       "type": "integer"
///                     },
///                     "to_ms": {
///                       "type": "integer"
///                     },
///                     "observed_at": {
///                       "type": "string",
///                       "format": "date-time"
///                     },
///                     "totals": {
///                       "type": "object",
///                       "additionalProperties": false,
///                       "required": [
///                         "requests",
///                         "completed",
///                         "execution_unknown",
///                         "known_token_usage_requests",
///                         "unknown_token_usage_requests",
///                         "prompt_tokens",
///                         "completion_tokens",
///                         "failures",
///                         "observed_timing_requests",
///                         "complete_timing_requests",
///                         "complete_total_ms"
///                       ],
///                       "properties": {
///                         "requests": {
///                           "type": "string",
///                           "pattern": "^[0-9]+$"
///                         },
///                         "completed": {
///                           "type": "string",
///                           "pattern": "^[0-9]+$"
///                         },
///                         "execution_unknown": {
///                           "type": "string",
///                           "pattern": "^[0-9]+$"
///                         },
///                         "known_token_usage_requests": {
///                           "type": "string",
///                           "pattern": "^[0-9]+$"
///                         },
///                         "unknown_token_usage_requests": {
///                           "type": "string",
///                           "pattern": "^[0-9]+$"
///                         },
///                         "prompt_tokens": {
///                           "type": "string",
///                           "pattern": "^[0-9]+$"
///                         },
///                         "completion_tokens": {
///                           "type": "string",
///                           "pattern": "^[0-9]+$"
///                         },
///                         "failures": {
///                           "type": "string",
///                           "pattern": "^[0-9]+$"
///                         },
///                         "observed_timing_requests": {
///                           "type": "string",
///                           "pattern": "^[0-9]+$"
///                         },
///                         "complete_timing_requests": {
///                           "type": "string",
///                           "pattern": "^[0-9]+$"
///                         },
///                         "complete_total_ms": {
///                           "type": [
///                             "string",
///                             "null"
///                           ],
///                           "pattern": "^[0-9]+$",
///                           "description": "Sum of complete observed HTTP delivery durations; null without any complete timing. Not asynchronous job duration."
///                         }
///                       }
///                     },
///                     "models": {
///                       "type": "array",
///                       "items": {
///                         "type": "object",
///                         "additionalProperties": false,
///                         "required": [
///                           "requests",
///                           "completed",
///                           "execution_unknown",
///                           "known_token_usage_requests",
///                           "unknown_token_usage_requests",
///                           "prompt_tokens",
///                           "completion_tokens",
///                           "failures",
///                           "observed_timing_requests",
///                           "complete_timing_requests",
///                           "complete_total_ms",
///                           "model"
///                         ],
///                         "properties": {
///                           "requests": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "completed": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "execution_unknown": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "known_token_usage_requests": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "unknown_token_usage_requests": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "prompt_tokens": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "completion_tokens": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "failures": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "observed_timing_requests": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "complete_timing_requests": {
///                             "type": "string",
///                             "pattern": "^[0-9]+$"
///                           },
///                           "complete_total_ms": {
///                             "type": [
///                               "string",
///                               "null"
///                             ],
///                             "pattern": "^[0-9]+$",
///                             "description": "Sum of complete observed HTTP delivery durations; null without any complete timing. Not asynchronous job duration."
///                           },
///                           "model": {
///                             "type": "string"
///                           }
///                         }
///                       }
///                     },
///                     "next_after": {
///                       "type": [
///                         "string",
///                         "null"
///                       ]
///                     }
///                   }
///                 }
///               },
///               "additionalProperties": false
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid interval, cursor boundary, limit or query."
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "403": {
///         "description": "Platform administration required."
///       },
///       "404": {
///         "description": "Provider does not exist or is deleted."
///       },
///       "503": {
///         "description": "Storage unavailable or diagnostic query deadline exceeded; no partial totals."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(crate) async fn read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(supplier): Path<Uuid>,
    Query(query): Query<UsageQuery>,
) -> Result<Response, ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .supplier_configuration_usage(
            supplier,
            query.from_ms,
            query.to_ms,
            query.after.as_deref(),
            query.limit,
        )
        .await
        .map_err(|error| match error {
            niu_storage::StoreError::InvalidObservation => ApiError::invalid_request(
                "Invalid Supplier usage interval, model boundary or page limit",
            ),
            other => ApiError::from_store(other),
        })?
        .ok_or_else(ApiError::not_found)?;
    Ok((
        [(header::CACHE_CONTROL, "no-store")],
        Json(json!({"data":data})),
    )
        .into_response())
}
