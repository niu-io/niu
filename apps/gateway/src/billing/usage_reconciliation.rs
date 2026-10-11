//! Installation-triggered, bounded lookup of previously captured generation evidence.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, State},
    http::{HeaderMap, header},
    response::{IntoResponse, Response},
};
use niu_storage::{AdminPermission, OpenRouterUsageObservation, TenantScope};
use serde::Deserialize;
use std::time::Duration;
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct ReconcileInput {}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}/usage-reconciliation",
///   "method": "post",
///   "operation": {
///     "operationId": "reconcileRequestUsage",
///     "summary": "Supplement unknown native request usage from captured OpenRouter evidence",
///     "description": "Installation write access only. Empty object input; no client-supplied generation identifier, quantities or costs. Uses the stored server response reference and original managed credential only while its vendor revision remains current and enabled. New captured references pin the dispatched upstream model independently of later mapping edits; legacy references without that binding still require the unchanged enabled model revision. Exact upstream model match required; aliases are not inferred equivalent. Bounded metadata lookup can return 502 while metadata is unavailable. Confirmed-completed or uncertain dispatched attempts with unknown aggregate usage are eligible only when canonical metadata confirms not-cancelled execution with stop/length/tool_calls and an exact model/reference match. Cancelled or nonterminal metadata remains unresolved. Atomically retains the original execution/usage and immutable supplemental terminal evidence, then marks execution confirmed-completed. Existing completion timestamps are preserved; absent timestamps record the time confirmation is stored. Original failure and delivery timing remain unchanged. Recorded does not mean settled: existing financial recovery applies the request-bound tariffs; missing required categories keep liability unresolved. Never resubmits inference. Identical replay returns the saved receipt without upstream access. Cache-Control no-store. New v2 receipts retain terminal finish/cancellation evidence. Legacy v1 receipts retain null terminal fields without invented backfill.",
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
///         "name": "attempt",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "additionalProperties": false,
///             "properties": {}
///           }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Supplemental usage recorded; settlement may remain pending.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "status",
///                 "source_version",
///                 "recorded_at",
///                 "prompt_tokens",
///                 "completion_tokens",
///                 "cached_input_tokens",
///                 "reasoning_output_tokens",
///                 "cache_write_input_tokens",
///                 "original_execution",
///                 "upstream_finish_reason",
///                 "upstream_cancelled"
///               ],
///               "properties": {
///                 "status": {
///                   "type": "string",
///                   "enum": [
///                     "recorded"
///                   ]
///                 },
///                 "source_version": {
///                   "type": "string",
///                   "enum": [
///                     "openrouter-native-generation-v1",
///                     "openrouter-native-generation-v2"
///                   ]
///                 },
///                 "recorded_at": {
///                   "type": "string",
///                   "format": "date-time"
///                 },
///                 "prompt_tokens": {
///                   "type": "string",
///                   "pattern": "^[0-9]+$"
///                 },
///                 "completion_tokens": {
///                   "type": "string",
///                   "pattern": "^[0-9]+$"
///                 },
///                 "cached_input_tokens": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "pattern": "^[0-9]+$"
///                 },
///                 "reasoning_output_tokens": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "pattern": "^[0-9]+$"
///                 },
///                 "cache_write_input_tokens": {
///                   "type": "null"
///                 },
///                 "original_execution": {
///                   "type": "string",
///                   "enum": [
///                     "confirmed_completed",
///                     "may_have_executed"
///                   ]
///                 },
///                 "upstream_finish_reason": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "enum": [
///                     "stop",
///                     "length",
///                     "tool_calls",
///                     null
///                   ],
///                   "description": "Null for legacy v1 receipts; never backfilled."
///                 },
///                 "upstream_cancelled": {
///                   "type": [
///                     "boolean",
///                     "null"
///                   ],
///                   "enum": [
///                     false,
///                     null
///                   ],
///                   "description": "Explicit false for v2 terminal evidence; null for legacy v1 receipts."
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Malformed JSON input."
///       },
///       "422": {
///         "description": "Input must be an empty JSON object; unknown fields are rejected."
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "403": {
///         "description": "Installation write access required."
///       },
///       "404": {
///         "description": "Scope unavailable."
///       },
///       "409": {
///         "description": "Ineligible completion, changed route, conflicting evidence or model/reference mismatch."
///       },
///       "502": {
///         "description": "Upstream metadata unavailable, refused, malformed, oversized or timed out."
///       },
///       "503": {
///         "description": "Storage or credential decryption unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(crate) async fn reconcile(
    State(state): State<AppState>,
    Path((organization, project, attempt)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    Json(_input): Json<ReconcileInput>,
) -> Result<Response, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !auth.is_installation() {
        return Err(ApiError::forbidden());
    }
    let scope = TenantScope {
        organization_id: organization,
        project_id: project,
    };
    if !auth.permits_project(scope) {
        return Err(ApiError::not_found());
    }
    if let Some(receipt) = state
        .store
        .openrouter_usage_receipt(scope, attempt)
        .await
        .map_err(ApiError::from_store)?
    {
        return Ok(([(header::CACHE_CONTROL, "no-store")], Json(receipt)).into_response());
    }
    let context = match state
        .store
        .openrouter_reconciliation_context(scope, attempt)
        .await
    {
        Ok(context) => context,
        Err(niu_storage::StoreError::Conflict) => {
            // Another caller can commit between the initial receipt read and
            // context lookup. Re-read the immutable scoped receipt before refusing.
            if let Some(receipt) = state
                .store
                .openrouter_usage_receipt(scope, attempt)
                .await
                .map_err(ApiError::from_store)?
            {
                return Ok(([(header::CACHE_CONTROL, "no-store")], Json(receipt)).into_response());
            }
            return Err(ApiError::from_store(niu_storage::StoreError::Conflict));
        }
        Err(error) => return Err(ApiError::from_store(error)),
    };
    let key = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?
        .open(context.vendor_id, &context.credential_ciphertext)
        .map_err(|_| ApiError::unavailable())?;
    let body = tokio::time::timeout(Duration::from_secs(10), async {
        let endpoint = "https://openrouter.ai/api/v1/generation";
        let client = crate::upstream::client_for_endpoint(endpoint, Duration::from_secs(10))
            .await
            .map_err(|_| ApiError::upstream_message("Usage metadata endpoint is unavailable"))?;
        let mut response = client
            .get(endpoint)
            .query(&[("id", &context.generation_id)])
            .bearer_auth(&key)
            .send()
            .await
            .map_err(|_| ApiError::upstream_message("Usage metadata lookup failed"))?;
        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(ApiError::upstream_message(
                "Usage metadata is not available yet; retry this reconciliation later",
            ));
        }
        if !response.status().is_success() {
            return Err(ApiError::upstream_message(
                "Usage metadata lookup was refused",
            ));
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| ApiError::upstream_message("Usage metadata could not be read"))?
        {
            if bytes.len() + chunk.len() > 256 * 1024 {
                return Err(ApiError::upstream_message(
                    "Usage metadata exceeds the supported size",
                ));
            }
            bytes.extend_from_slice(&chunk);
        }
        serde_json::from_slice(&bytes)
            .map_err(|_| ApiError::upstream_message("Usage metadata is invalid"))
    })
    .await
    .map_err(|_| ApiError::upstream_message("Usage metadata lookup timed out"))??;
    let usage =
        OpenRouterUsageObservation::from_generation(&body, &context).map_err(
            |error| match error {
                niu_storage::StoreError::InvalidUsage => {
                    ApiError::upstream_message("Usage metadata contains invalid native quantities")
                }
                other => ApiError::from_store(other),
            },
        )?;
    state
        .store
        .record_openrouter_usage(scope, attempt, &context, &usage)
        .await
        .map_err(ApiError::from_store)?;
    let receipt = state
        .store
        .openrouter_usage_receipt(scope, attempt)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::unavailable)?;
    Ok(([(header::CACHE_CONTROL, "no-store")], Json(receipt)).into_response())
}

/// ```openapi
/// {
///   "path": "/admin/v1/organizations/{organization}/projects/{project}/requests/{attempt}/usage-reconciliation",
///   "method": "get",
///   "operation": {
///     "operationId": "getRequestUsageReconciliation",
///     "summary": "Read recorded supplemental request usage",
///     "description": "Workspace read access required. Returns the same customer-safe immutable receipt as reconciliation, without querying upstream or modifying usage or accounting. Absence, unknown attempt and out-of-scope attempt return 404. Quantities are decimal strings; missing categories remain null. Recorded does not guarantee settlement. No original raw upstream metadata, generation reference, credential, Supplier price or endpoint is exposed. Cache-Control no-store. New v2 receipts retain terminal finish/cancellation evidence. Legacy v1 receipts retain null terminal fields without invented backfill.",
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
///         "name": "attempt",
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
///         "description": "Supplemental usage recorded; settlement may remain pending.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "status",
///                 "source_version",
///                 "recorded_at",
///                 "prompt_tokens",
///                 "completion_tokens",
///                 "cached_input_tokens",
///                 "reasoning_output_tokens",
///                 "cache_write_input_tokens",
///                 "original_execution",
///                 "upstream_finish_reason",
///                 "upstream_cancelled"
///               ],
///               "properties": {
///                 "status": {
///                   "type": "string",
///                   "enum": [
///                     "recorded"
///                   ]
///                 },
///                 "source_version": {
///                   "type": "string",
///                   "enum": [
///                     "openrouter-native-generation-v1",
///                     "openrouter-native-generation-v2"
///                   ]
///                 },
///                 "recorded_at": {
///                   "type": "string",
///                   "format": "date-time"
///                 },
///                 "prompt_tokens": {
///                   "type": "string",
///                   "pattern": "^[0-9]+$"
///                 },
///                 "completion_tokens": {
///                   "type": "string",
///                   "pattern": "^[0-9]+$"
///                 },
///                 "cached_input_tokens": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "pattern": "^[0-9]+$"
///                 },
///                 "reasoning_output_tokens": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "pattern": "^[0-9]+$"
///                 },
///                 "cache_write_input_tokens": {
///                   "type": "null"
///                 },
///                 "original_execution": {
///                   "type": "string",
///                   "enum": [
///                     "confirmed_completed",
///                     "may_have_executed"
///                   ]
///                 },
///                 "upstream_finish_reason": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "enum": [
///                     "stop",
///                     "length",
///                     "tool_calls",
///                     null
///                   ],
///                   "description": "Null for legacy v1 receipts; never backfilled."
///                 },
///                 "upstream_cancelled": {
///                   "type": [
///                     "boolean",
///                     "null"
///                   ],
///                   "enum": [
///                     false,
///                     null
///                   ],
///                   "description": "Explicit false for v2 terminal evidence; null for legacy v1 receipts."
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "404": {
///         "description": "No recorded receipt in the authorized workspace."
///       },
///       "503": {
///         "description": "Storage or credential decryption unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(crate) async fn get(
    State(state): State<AppState>,
    Path((organization, project, attempt)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let scope = TenantScope {
        organization_id: organization,
        project_id: project,
    };
    super::authorize(&state, &headers, scope, false).await?;
    let receipt = state
        .store
        .openrouter_usage_receipt(scope, attempt)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(([(header::CACHE_CONTROL, "no-store")], Json(receipt)).into_response())
}
