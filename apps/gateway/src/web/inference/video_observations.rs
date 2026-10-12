//! Saved receipt diagnosis; no upstream work or financial mutation.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use serde::Deserialize;
use serde_json::Value;
use uuid::Uuid;
#[derive(Deserialize, Default)]
#[serde(deny_unknown_fields)]
pub(in crate::web) struct ObservationQuery {
    pub(super) after: Option<String>,
    pub(super) limit: Option<u16>,
}
impl ObservationQuery {
    pub(super) fn parse(
        input: Result<Query<Self>, axum::extract::rejection::QueryRejection>,
    ) -> Result<Self, ApiError> {
        let Query(query) = input
            .map_err(|_| ApiError::invalid_request("Invalid observation cursor or page size"))?;
        let limit = query.limit.unwrap_or(50);
        if !(1..=100).contains(&limit)
            || query
                .after
                .as_ref()
                .is_some_and(|s| s.len() != 64 || !s.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return Err(ApiError::invalid_request(
                "Invalid observation cursor or page size",
            ));
        }
        Ok(query)
    }
}

/// ```openapi
/// {
///   "path": "/v1/video/jobs/{id}/observations",
///   "method": "get",
///   "operation": {
///     "summary": "Read saved video query observations",
///     "description": "Reads immutable, content-free saved query receipts in descending observation-time/receipt order. Reported quantity is not a customer charge or settled usage. Missing/invalid quantities remain explicit; provider timestamps are epoch seconds, not measured transport spans. Does not poll upstream, submit work, reserve funds or mutate financial state. No upstream identity, URL, credential, raw error, cost, procurement price or protocol configuration is returned. Cursor and receipt page share a bounded read-only snapshot (250 ms lock / 2 s statement limits); authorization and whole-request deadlines are separate. Separate pages are live views. Cache-Control no-store.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "in": "path",
///         "name": "id",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
///       {
///         "in": "query",
///         "name": "after",
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-fA-F0-9]{64}$"
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
///         "description": "Saved observations only; empty data means no saved query receipt in this range.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/VideoQueryObservationPage"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed cursor or page size."
///       },
///       "401": {
///         "description": "Invalid, expired or revoked credential."
///       },
///       "403": {
///         "description": "Source or workspace permission denied."
///       },
///       "404": {
///         "description": "Unknown job or outside authorized workspace/model scope."
///       },
///       "409": {
///         "description": "Cursor absent from this job scope."
///       },
///       "503": {
///         "description": "Storage read unavailable; never empty successful history."
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "operationId": "videoQueryObservations"
///   },
///   "schemas": {
///     "VideoQueryObservationPage": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "data",
///         "next_cursor"
///       ],
///       "properties": {
///         "data": {
///           "type": "array",
///           "maxItems": 100,
///           "items": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "cursor",
///               "observed_at_ms",
///               "meter",
///               "status",
///               "quantity",
///               "provider_times"
///             ],
///             "properties": {
///               "cursor": {
///                 "type": "string",
///                 "pattern": "^[a-f0-9]{64}$",
///                 "description": "Internal continuation reference; never a product label."
///               },
///               "observed_at_ms": {
///                 "type": "integer",
///                 "format": "int64"
///               },
///               "meter": {
///                 "type": "string"
///               },
///               "status": {
///                 "type": "string",
///                 "enum": [
///                   "queued",
///                   "running",
///                   "succeeded",
///                   "failed",
///                   "cancelled",
///                   "expired",
///                   "unknown"
///                 ]
///               },
///               "quantity": {
///                 "oneOf": [
///                   {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "state"
///                     ],
///                     "properties": {
///                       "state": {
///                         "type": "string",
///                         "enum": [
///                           "missing",
///                           "invalid"
///                         ]
///                       }
///                     }
///                   },
///                   {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "state",
///                       "value"
///                     ],
///                     "properties": {
///                       "state": {
///                         "type": "string",
///                         "const": "reported"
///                       },
///                       "value": {
///                         "type": "string",
///                         "pattern": "^(0|[1-9][0-9]*)$"
///                       }
///                     }
///                   }
///                 ]
///               },
///               "provider_times": {
///                 "oneOf": [
///                   {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "state"
///                     ],
///                     "properties": {
///                       "state": {
///                         "type": "string",
///                         "enum": [
///                           "missing",
///                           "invalid"
///                         ]
///                       }
///                     }
///                   },
///                   {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "state",
///                       "created_at",
///                       "updated_at"
///                     ],
///                     "properties": {
///                       "state": {
///                         "type": "string",
///                         "const": "reported"
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "pattern": "^(0|[1-9][0-9]*)$"
///                       },
///                       "updated_at": {
///                         "type": "string",
///                         "pattern": "^(0|[1-9][0-9]*)$"
///                       }
///                     }
///                   }
///                 ]
///               }
///             }
///           }
///         },
///         "next_cursor": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[a-f0-9]{64}$"
///         }
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn observations(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
    query: Result<Query<ObservationQuery>, axum::extract::rejection::QueryRejection>,
) -> Result<([(String, String); 1], Json<Value>), ApiError> {
    let principal = state.authorize_api_headers(&headers).await?;
    let query = ObservationQuery::parse(query)?;
    let limit = query.limit.unwrap_or(50);
    let result = state
        .store
        .media_query_observations_for_key(&principal, id, query.after.as_deref(), limit)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(([("cache-control".into(), "no-store".into())], Json(result)))
}
