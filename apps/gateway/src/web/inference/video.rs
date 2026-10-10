use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use serde_json::Value;
use uuid::Uuid;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::web) struct HistoryQuery {
    pub(super) before: Option<Uuid>,
    pub(super) limit: Option<i64>,
}

/// ```openapi
/// {
///   "path": "/v1/video/jobs",
///   "method": "get",
///   "operation": {
///     "operationId": "listVideoJobHistory",
///     "summary": "List durable workspace video jobs",
///     "description": "Reads saved dispatched jobs, including uncertain submissions, in newest-first creation order with an ID tie-breaker. Applies current key workspace/model grants and returns no upstream references, prompts, credentials or procurement terms. Listing does not poll or regenerate videos. Cursor jobs must remain accessible under the current key. New head entries do not move existing cursor positions.",
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
///         "name": "before",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         },
///         "description": "next_before from the preceding page; scoped to currently accessible jobs."
///       },
///       {
///         "name": "limit",
///         "in": "query",
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 100,
///           "default": 25
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Saved scoped job history",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data",
///                 "has_more",
///                 "next_before"
///               ],
///               "properties": {
///                 "has_more": {
///                   "type": "boolean"
///                 },
///                 "next_before": {
///                   "type": [
///                     "string",
///                     "null"
///                   ],
///                   "format": "uuid"
///                 },
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "id",
///                       "object",
///                       "model",
///                       "status",
///                       "created_at_ms"
///                     ],
///                     "properties": {
///                       "id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "object": {
///                         "const": "video.job"
///                       },
///                       "model": {
///                         "type": "string"
///                       },
///                       "created_at_ms": {
///                         "type": "string",
///                         "pattern": "^-?[0-9]+$",
///                         "description": "Exact Unix milliseconds from the saved attempt."
///                       },
///                       "status": {
///                         "type": "string",
///                         "enum": [
///                           "submission_unknown",
///                           "queued",
///                           "running",
///                           "succeeded",
///                           "failed",
///                           "unknown",
///                           "reconciliation_required"
///                         ]
///                       }
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid limit, unknown query field, malformed or inaccessible cursor"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked credential"
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "x-niu-status": "Reads persisted scoped evidence without upstream dispatch. Available results and customer charge settlement require separate evidence."
///   }
/// }
/// ```
pub(in crate::web) async fn history(
    State(state): State<AppState>,
    headers: HeaderMap,
    query: Result<axum::extract::Query<HistoryQuery>, axum::extract::rejection::QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    let principal = state.authorize_api_headers(&headers).await?;
    let axum::extract::Query(query) = query
        .map_err(|_| ApiError::invalid_request("Invalid video history cursor or page size"))?;
    state
        .store
        .media_jobs_for_key(&principal, query.before, query.limit.unwrap_or(25))
        .await
        .map(Json)
        .map_err(ApiError::from_store)
}

/// ```openapi
/// {
///   "path": "/v1/video/jobs/{id}/billing",
///   "method": "get",
///   "operation": {
///     "operationId": "retrieveVideoJobBilling",
///     "summary": "Read saved customer video billing",
///     "description": "Current workspace/model authorization applies. This read performs no upstream query or settlement. Exact amounts are decimal strings in billionths of the declared currency. Only a posted customer debit is a charge; unresolved liability remains explicit. Personal owner-funded jobs have no Niu customer price or charge. Procurement terms and internal revision identifiers are excluded.",
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
///         "name": "id",
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
///         "description": "Saved customer accounting snapshot",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/VideoJobBilling"
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Invalid credential"
///       },
///       "404": {
///         "description": "Missing job or workspace/model access denied"
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "x-niu-status": "Reads persisted scoped evidence without upstream dispatch. Available results and customer charge settlement require separate evidence."
///   },
///   "schemas": {
///     "VideoJobBilling": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "mode",
///         "state",
///         "currency",
///         "reserved_nanos",
///         "charge_nanos",
///         "usage",
///         "price",
///         "bound_exceeded",
///         "effective_output",
///         "estimate"
///       ],
///       "properties": {
///         "mode": {
///           "type": "string",
///           "enum": [
///             "owner_funded",
///             "customer",
///             "unavailable"
///           ]
///         },
///         "state": {
///           "type": "string",
///           "enum": [
///             "owner_funded",
///             "unavailable",
///             "reserved",
///             "awaiting_usage",
///             "awaiting_settlement",
///             "settled",
///             "reconciliation_required"
///           ]
///         },
///         "currency": {
///           "type": [
///             "string",
///             "null"
///           ]
///         },
///         "reserved_nanos": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         },
///         "charge_nanos": {
///           "type": [
///             "string",
///             "null"
///           ],
///           "pattern": "^[0-9]+$"
///         },
///         "settled_usage": {
///           "type": [
///             "object",
///             "null"
///           ],
///           "additionalProperties": false,
///           "description": "Immutable quantity behind a posted customer charge, distinct from later usage observations or conflicts.",
///           "required": [
///             "meter",
///             "quantity",
///             "billable_quantity",
///             "provenance"
///           ],
///           "properties": {
///             "meter": {
///               "type": "string"
///             },
///             "quantity": {
///               "$ref": "#/components/schemas/VideoBillingQuantity"
///             },
///             "billable_quantity": {
///               "$ref": "#/components/schemas/VideoBillingQuantity"
///             },
///             "provenance": {
///               "type": "string",
///               "enum": [
///                 "Reported"
///               ]
///             }
///           }
///         },
///         "bound_exceeded": {
///           "type": [
///             "boolean",
///             "null"
///           ]
///         },
///         "effective_output": {
///           "type": [
///             "object",
///             "null"
///           ],
///           "additionalProperties": false,
///           "description": "Immutable effective output from submission; absent for legacy jobs. Revisions identify calculation evidence, not current availability.",
///           "required": [
///             "specification",
///             "duration_seconds",
///             "frames_per_second",
///             "schema_revision",
///             "estimator",
///             "estimator_revision"
///           ],
///           "properties": {
///             "specification": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "resolution",
///                 "ratio",
///                 "width",
///                 "height"
///               ],
///               "properties": {
///                 "resolution": {
///                   "type": "string"
///                 },
///                 "ratio": {
///                   "type": "string"
///                 },
///                 "width": {
///                   "type": "integer",
///                   "minimum": 1,
///                   "maximum": 4294967295
///                 },
///                 "height": {
///                   "type": "integer",
///                   "minimum": 1,
///                   "maximum": 4294967295
///                 }
///               }
///             },
///             "duration_seconds": {
///               "type": "integer",
///               "minimum": 1
///             },
///             "frames_per_second": {
///               "type": [
///                 "integer",
///                 "null"
///               ],
///               "minimum": 1,
///               "maximum": 4294967295,
///               "description": "Null when the seconds estimator has no configured frame rate; required for pixel-based estimation."
///             },
///             "schema_revision": {
///               "type": "string"
///             },
///             "estimator": {
///               "type": "string",
///               "enum": [
///                 "SeedancePixelsV1",
///                 "OutputSecondsV1"
///               ]
///             },
///             "estimator_revision": {
///               "type": "string"
///             }
///           }
///         },
///         "estimate": {
///           "type": [
///             "object",
///             "null"
///           ],
///           "additionalProperties": false,
///           "description": "Saved estimated quantity priced using the original customer tariff. Neither confirmed usage, maximum liability nor a final charge. Owner-funded or unpriceable amounts remain null.",
///           "required": [
///             "meter",
///             "quantity",
///             "provenance",
///             "currency",
///             "amount_nanos"
///           ],
///           "properties": {
///             "meter": {
///               "type": "string"
///             },
///             "quantity": {
///               "$ref": "#/components/schemas/VideoBillingQuantity"
///             },
///             "provenance": {
///               "type": "string",
///               "enum": [
///                 "Estimate"
///               ]
///             },
///             "currency": {
///               "type": [
///                 "string",
///                 "null"
///               ]
///             },
///             "amount_nanos": {
///               "type": [
///                 "string",
///                 "null"
///               ],
///               "pattern": "^[0-9]+$"
///             }
///           }
///         },
///         "usage": {
///           "type": [
///             "object",
///             "null"
///           ],
///           "additionalProperties": false,
///           "required": [
///             "meter",
///             "quantity"
///           ],
///           "properties": {
///             "meter": {
///               "type": "string"
///             },
///             "quantity": {
///               "$ref": "#/components/schemas/VideoBillingQuantity"
///             }
///           }
///         },
///         "price": {
///           "type": [
///             "object",
///             "null"
///           ],
///           "additionalProperties": false,
///           "required": [
///             "meter",
///             "amount_units",
///             "decimal_places",
///             "per_quantity",
///             "minimum_quantity",
///             "rounding",
///             "resolution",
///             "reference_video",
///             "effective_from",
///             "effective_until",
///             "discounts"
///           ],
///           "properties": {
///             "meter": {
///               "type": "string"
///             },
///             "amount_units": {
///               "type": "string",
///               "pattern": "^[0-9]+$"
///             },
///             "decimal_places": {
///               "type": "integer",
///               "minimum": 0,
///               "maximum": 9
///             },
///             "per_quantity": {
///               "$ref": "#/components/schemas/VideoBillingQuantity"
///             },
///             "minimum_quantity": {
///               "$ref": "#/components/schemas/VideoBillingQuantity"
///             },
///             "rounding": {
///               "type": "string",
///               "enum": [
///                 "Down",
///                 "Up",
///                 "HalfEven"
///               ]
///             },
///             "resolution": {
///               "type": "string"
///             },
///             "reference_video": {
///               "type": "boolean"
///             },
///             "effective_from": {
///               "type": "string",
///               "pattern": "^-?[0-9]+$"
///             },
///             "effective_until": {
///               "type": [
///                 "string",
///                 "null"
///               ],
///               "pattern": "^-?[0-9]+$"
///             },
///             "discounts": {
///               "type": "array",
///               "items": {
///                 "type": "object",
///                 "additionalProperties": false,
///                 "required": [
///                   "multiplier",
///                   "stacking",
///                   "effective_from",
///                   "effective_until"
///                 ],
///                 "properties": {
///                   "multiplier": {
///                     "$ref": "#/components/schemas/VideoBillingQuantity"
///                   },
///                   "stacking": {
///                     "type": "string",
///                     "enum": [
///                       "Exclusive",
///                       "Multiply"
///                     ]
///                   },
///                   "effective_from": {
///                     "type": "string",
///                     "pattern": "^-?[0-9]+$"
///                   },
///                   "effective_until": {
///                     "type": [
///                       "string",
///                       "null"
///                     ],
///                     "pattern": "^-?[0-9]+$"
///                   }
///                 }
///               }
///             }
///           }
///         }
///       }
///     },
///     "VideoBillingQuantity": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "numerator",
///         "denominator"
///       ],
///       "properties": {
///         "numerator": {
///           "type": "string",
///           "pattern": "^[0-9]+$"
///         },
///         "denominator": {
///           "type": "string",
///           "pattern": "^[1-9][0-9]*$"
///         }
///       }
///     }
///   }
/// }
/// ```
pub(in crate::web) async fn billing(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let principal = state.authorize_api_headers(&headers).await?;
    state
        .store
        .media_billing_for_key(&principal, id)
        .await
        .map_err(ApiError::from_store)?
        .map(Json)
        .ok_or_else(ApiError::not_found)
}

/// Reads persisted evidence only: no upstream poll, paid submission or refund.
/// ```openapi
/// {
///   "path": "/v1/video/jobs/{id}",
///   "method": "get",
///   "operation": {
///     "operationId": "retrieveVideoJobState",
///     "summary": "Read persisted video job state",
///     "description": "Requires a current workspace API key with access to the original model. Reads saved evidence only; performs no upstream poll, generation or settlement. Succeeded does not guarantee available results, reported usage or a settled charge. No upstream identifiers, credentials or procurement values are returned.",
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
///         "name": "id",
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
///         "description": "Durable scoped state",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "id",
///                 "object",
///                 "model",
///                 "status"
///               ],
///               "properties": {
///                 "id": {
///                   "type": "string",
///                   "format": "uuid"
///                 },
///                 "object": {
///                   "const": "video.job"
///                 },
///                 "model": {
///                   "type": "string"
///                 },
///                 "status": {
///                   "type": "string",
///                   "enum": [
///                     "submission_unknown",
///                     "queued",
///                     "running",
///                     "succeeded",
///                     "failed",
///                     "unknown",
///                     "reconciliation_required"
///                   ]
///                 }
///               }
///             }
///           }
///         }
///       },
///       "401": {
///         "description": "Invalid, expired or revoked credential"
///       },
///       "404": {
///         "description": "Missing job, workspace mismatch or model access denied"
///       }
///     },
///     "x-niu-implementation": "implemented",
///     "x-niu-status": "Reads persisted scoped evidence without upstream dispatch. Available results and customer charge settlement require separate evidence."
///   }
/// }
/// ```
pub(in crate::web) async fn status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let principal = state.authorize_api_headers(&headers).await?;
    state
        .store
        .media_job_state_for_key(&principal, id)
        .await
        .map_err(ApiError::from_store)?
        .map(Json)
        .ok_or_else(ApiError::not_found)
}

/// Direct-channel submission with separate personal and prepaid admission.
/// Media inspection remains required before reference inputs become available.
/// Shared authorization, capability and tariff checks for estimates and creates.
pub(super) async fn validate_admission(
    state: &AppState,
    principal: &niu_storage::Principal,
    body: &Value,
    model: &str,
) -> Result<
    (
        niu_storage::VendorRoute,
        niu_media::ValidatedVideoRequest,
        Option<niu_storage::SelectedCustomerMediaRate>,
        niu_storage::GuardrailSnapshot,
        bool,
    ),
    ApiError,
> {
    let scope = principal.scope();
    let personal = state
        .store
        .personal_vendor_route(scope.organization_id, model)
        .await
        .map_err(ApiError::from_store)?;
    let owner_funded = personal.is_some();
    // Personal upstream bills belong to the credential owner. Only shared
    // routes need platform procurement admission; legacy video procurement
    // reservations are not supported. Customer retail caps remain separate.
    if !owner_funded
        && state
            .store
            .budget(scope)
            .await
            .map_err(ApiError::from_store)?
            .is_some()
    {
        return Err(ApiError::unsupported_message(
            "Video admission under this workspace budget is not supported",
        ));
    }
    let route = if let Some(route) = personal {
        route
    } else {
        let route = state
            .store
            .vendor_route(model)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(ApiError::not_found)?;
        if !route.vendor.enabled
            || !route.model.enabled
            || state
                .store
                .personal_vendor_organization(route.vendor.id)
                .await
                .map_err(ApiError::from_store)?
                .is_some()
        {
            return Err(ApiError::not_found());
        }
        if !state
            .store
            .supplier_model_available(model)
            .await
            .map_err(ApiError::from_store)?
        {
            return Err(ApiError::unavailable());
        }
        route
    };
    let schema: niu_media::VideoSchema = serde_json::from_value(
        route
            .model
            .capabilities
            .get("video_schema")
            .cloned()
            .ok_or_else(ApiError::unsupported)?,
    )
    .map_err(|_| ApiError::unsupported())?;
    let openrouter = schema.channel == niu_media::openrouter::REVISION;
    if (schema.channel != "ark-direct-v1" && !openrouter) || body.get("callback_url").is_some() {
        return Err(ApiError::unsupported_message(
            "This video channel or notification contract is not implemented",
        ));
    }
    if openrouter && (!owner_funded || route.vendor.adapter != "openrouter") {
        return Err(ApiError::unsupported_message(
            "OpenRouter video requires a personal route; customer billing is not qualified",
        ));
    }
    let request = schema
        .validate_request(
            &serde_json::to_vec(&body)
                .map_err(|_| ApiError::invalid_request("Invalid video request"))?,
        )
        .map_err(|_| {
            ApiError::invalid_request("The request does not match this model's video schema")
        })?;
    if openrouter {
        niu_media::openrouter::submission_body(&request).map_err(|_| {
            ApiError::unsupported_message("This OpenRouter video control or input is not supported")
        })?;
    }
    if request.effective_output().is_some_and(|output| {
        output.estimator.meter()
            != if openrouter {
                "seconds"
            } else {
                "video_tokens"
            }
    }) {
        return Err(ApiError::unsupported_message(
            "This video adapter does not qualify the configured media meter",
        ));
    }
    if body
        .get("content")
        .and_then(Value::as_array)
        .is_none_or(|items| {
            items.iter().any(|item| {
                !matches!(
                    item.get("type").and_then(Value::as_str),
                    Some("text" | "image_url")
                ) || item["type"] == "image_url"
                    && !item["image_url"]["url"]
                        .as_str()
                        .is_some_and(|url| url.starts_with("data:image/"))
            })
        })
    {
        return Err(ApiError::unsupported_message(
            "Media-reference video input requires qualified media inspection",
        ));
    }
    let selling = if owner_funded {
        None
    } else {
        let resolution = request
            .effective_controls()
            .get("resolution")
            .and_then(Value::as_str)
            .ok_or_else(|| {
                ApiError::invalid_request(
                    "A configured effective video resolution is required for billing",
                )
            })?;
        let dimensions = niu_storage::MediaBillingDimensions {
            model: model.into(),
            channel: schema.channel.clone(),
            resolution: resolution.into(),
            reference_video: false,
        };
        let at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .ok()
            .and_then(|v| i64::try_from(v.as_secs()).ok())
            .ok_or_else(ApiError::unavailable)?;
        let selected = state
            .store
            .select_customer_media_rate(scope.organization_id, &dimensions, at)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(|| {
                ApiError::unsupported_message("No effective customer video tariff is configured")
            })?;
        if selected.vendor_id != route.vendor.id
            || selected.vendor_revision != route.vendor.revision
            || selected.model_revision != route.model.revision
            || selected.schema_revision != request.schema_revision()
            || selected.liability.meter != "video_tokens"
        {
            return Err(ApiError::unavailable());
        }
        Some(selected)
    };
    let snapshot = state
        .store
        .guardrail_snapshot(scope, principal.key_id())
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::forbidden)?;
    let images = has_images(body);
    if !policy_permits_video_with_images(&snapshot, model, &route.vendor.adapter, images)
        || images && !super::video_images::permitted(state, &snapshot, principal)
    {
        return Err(ApiError::forbidden());
    }
    Ok((route, request, selling, snapshot, owner_funded))
}

/// Video supports local text rules, but not media detectors or output buffering.
/// Discovery and admission use the same policy boundary.
pub(super) fn policy_permits_video(
    snapshot: &niu_storage::GuardrailSnapshot,
    model: &str,
    adapter: &str,
) -> bool {
    policy_permits_video_with_images(snapshot, model, adapter, false)
}

fn has_images(body: &Value) -> bool {
    body["content"]
        .as_array()
        .is_some_and(|items| items.iter().any(|item| item["type"] == "image_url"))
}

pub(super) fn policy_permits_video_with_images(
    snapshot: &niu_storage::GuardrailSnapshot,
    model: &str,
    adapter: &str,
    images: bool,
) -> bool {
    [&snapshot.workspace_policy, &snapshot.key_policy]
        .into_iter()
        .flatten()
        .all(|stored| {
            let Ok(policy) =
                serde_json::from_value::<crate::guardrails::PolicyDraft>(stored.clone())
            else {
                return false;
            };
            policy.validate_shape().is_ok()
                && crate::guardrails::EffectiveAccess::compose([policy.models]).permits(model)
                && crate::guardrails::EffectiveAccess::compose([policy.providers]).permits(adapter)
                && (policy.image_detectors.is_empty() || images)
                && policy.input_detectors.is_empty()
                && policy.output.is_none()
        })
}

fn estimated_nanos(receipt: &niu_metered_cost::Receipt) -> Result<String, ApiError> {
    let scale = 9_u8
        .checked_sub(receipt.decimal_places)
        .ok_or_else(ApiError::unavailable)?;
    let amount = u128::from(receipt.amount_units)
        .checked_mul(10_u128.pow(u32::from(scale)))
        .and_then(|amount| i64::try_from(amount).ok())
        .ok_or_else(ApiError::unavailable)?;
    Ok(amount.to_string())
}

/// Read-only estimate: no attempt, reservation, credentials or upstream call.
pub(in crate::web) async fn estimate(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<Json<Value>, ApiError> {
    let principal = state.authorize_api_headers(&headers).await?;
    estimate_as(state, body, principal).await
}

pub(super) async fn estimate_as(
    state: AppState,
    body: Value,
    principal: niu_storage::Principal,
) -> Result<Json<Value>, ApiError> {
    let model = body
        .get("model")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::invalid_request("A video model is required"))?;
    if !principal.allows_model(model) {
        return Err(ApiError::not_found());
    }
    let (_, request, selling, _, owner_funded) =
        validate_admission(&state, &principal, &body, model).await?;
    let output = request.effective_output().ok_or_else(|| {
        ApiError::unsupported_message("No effective video output estimator is configured")
    })?;
    let usage = output
        .estimate(niu_metered_cost::Quantity::integer(0))
        .map_err(|_| ApiError::unavailable())?;
    let niu_metered_cost::Usage::Known {
        ref meter,
        quantity,
        ..
    } = usage
    else {
        return Err(ApiError::unavailable());
    };
    let (currency, amount, maximum, selected_at) = if let Some(rate) = selling {
        let receipt = rate
            .pricing
            .calculate(&usage)
            .map_err(|_| ApiError::unavailable())?;
        let maximum = rate
            .pricing
            .calculate(&niu_metered_cost::Usage::Known {
                meter: rate.liability.meter,
                quantity: rate.liability.maximum_quantity,
                provenance: niu_metered_cost::Provenance::Estimate,
            })
            .map_err(|_| ApiError::unavailable())?;
        (
            Some(receipt.currency.clone()),
            Some(estimated_nanos(&receipt)?),
            Some(estimated_nanos(&maximum)?),
            Some(rate.pricing.selected_at().to_string()),
        )
    } else {
        (None, None, None, None)
    };
    Ok(Json(
        serde_json::json!({"object":"video.estimate","model":model,
        "mode":if owner_funded {"owner_funded"} else {"customer"},
        "effective_output":output,"estimate":{"meter":meter,"quantity":quantity,
            "provenance":"Estimate","currency":currency,"amount_nanos":amount},
        "maximum_charge_nanos":maximum,"selected_at":selected_at}),
    ))
}

/// ```openapi
/// {
///   "path": "/v1/video/jobs",
///   "method": "post",
///   "operation": {
///     "operationId": "createOwnerFundedVideoJob",
///     "summary": "Submit a schema-validated video job",
///     "description": "Personal routes support configured ark-direct-v1 or openrouter-video-v1 channels. Customer-funded video currently requires a qualified ark-direct-v1 route and video_tokens pricing; OpenRouter remains personal-only. Shared routes with a legacy procurement budget are unsupported, while personal routes retain ordinary authorization and key limits. Exactly one upstream submission follows durable dispatch intent. HTTP or transport errors retain submission_unknown and any unresolved liability. Observed non-success HTTP statuses are saved as upstream_http_error in scoped request diagnostics, without upstream bodies or credentials; they do not prove nonexecution or authorize a retry. Optional workspace-scoped Idempotency-Key supports text-only creation: identical replay returns the original reference and current saved status, including after restart. Changed input conflicts. Unkeyed requests are not idempotent. Configured controls, reference inputs and required inspection remain subject to the selected schema and supported channel.",
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
///         "name": "Idempotency-Key",
///         "in": "header",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 128
///         },
///         "description": "Reuse only with the same JSON document in the same workspace; object field order is ignored."
///       }
///     ],
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "required": [
///               "model",
///               "content"
///             ],
///             "properties": {
///               "model": {
///                 "type": "string",
///                 "minLength": 1
///               },
///               "content": {
///                 "type": "array",
///                 "minItems": 1,
///                 "maxItems": 32,
///                 "items": {
///                   "oneOf": [
///                     {
///                       "type": "object",
///                       "required": [
///                         "type",
///                         "text"
///                       ],
///                       "properties": {
///                         "type": {
///                           "const": "text"
///                         },
///                         "text": {
///                           "type": "string",
///                           "minLength": 1
///                         },
///                         "role": {
///                           "type": "string",
///                           "description": "Only roles explicitly supported by the selected schema are accepted."
///                         }
///                       },
///                       "additionalProperties": false
///                     },
///                     {
///                       "type": "object",
///                       "required": [
///                         "type",
///                         "image_url"
///                       ],
///                       "properties": {
///                         "type": {
///                           "const": "image_url"
///                         },
///                         "image_url": {
///                           "type": "object",
///                           "required": [
///                             "url"
///                           ],
///                           "properties": {
///                             "url": {
///                               "type": "string",
///                               "pattern": "^data:image/(png|jpeg|webp);base64,"
///                             }
///                           },
///                           "additionalProperties": false
///                         },
///                         "role": {
///                           "type": "string",
///                           "description": "Only roles explicitly supported by the selected schema are accepted."
///                         }
///                       },
///                       "additionalProperties": false
///                     }
///                   ]
///                 },
///                 "description": "Ordered input blocks matching the configured video schema. Text input is supported; inline image inputs additionally require a qualified channel and current inspection consent. Idempotent submission supports text only."
///               }
///             },
///             "additionalProperties": true
///           }
///         }
///       }
///     },
///     "responses": {
///       "202": {
///         "description": "Durable Niu reference; acceptance alone does not establish upstream execution or billing.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "id",
///                 "object",
///                 "model",
///                 "status"
///               ],
///               "properties": {
///                 "id": {
///                   "type": "string",
///                   "format": "uuid"
///                 },
///                 "object": {
///                   "const": "video.job"
///                 },
///                 "model": {
///                   "type": "string"
///                 },
///                 "status": {
///                   "type": "string",
///                   "enum": [
///                     "unknown",
///                     "submission_unknown",
///                     "queued",
///                     "running",
///                     "succeeded",
///                     "failed",
///                     "reconciliation_required"
///                   ]
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid request/schema or idempotency header."
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key."
///       },
///       "402": {
///         "description": "Customer capacity or spending limit denied before submission."
///       },
///       "403": {
///         "description": "Current workspace/model policy cannot be satisfied."
///       },
///       "404": {
///         "description": "Model or original job is unavailable to this scope."
///       },
///       "409": {
///         "description": "Changed idempotent input or conflicting route/key/policy/offer revision."
///       },
///       "429": {
///         "description": "Current key request/concurrency limit exceeded."
///       },
///       "501": {
///         "description": "Unsupported channel, billing, reference-input or callback contract."
///       },
///       "503": {
///         "description": "Qualified offer, original route or storage unavailable."
///       }
///     },
///     "x-niu-implementation": "implemented"
///   }
/// }
/// ```
pub(in crate::web) async fn create(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> Result<(axum::http::StatusCode, Json<Value>), ApiError> {
    let _in_flight = state.track_inference();
    let principal = state.authorize_api_headers(&headers).await?;
    let identity = submission_identity(&headers, &body)?;
    create_as(state, body, principal, identity, None).await
}

pub(super) struct SubmissionIdentity {
    pub(super) key: Vec<u8>,
    pub(super) request: Vec<u8>,
}

pub(super) fn submission_identity(
    headers: &HeaderMap,
    body: &Value,
) -> Result<Option<SubmissionIdentity>, ApiError> {
    use sha2::{Digest, Sha256};
    let mut values = headers.get_all("idempotency-key").iter();
    let Some(value) = values.next() else {
        return Ok(None);
    };
    let key = value.as_bytes();
    if values.next().is_some()
        || key.is_empty()
        || key.len() > 128
        || !key.iter().all(|b| b.is_ascii_graphic())
    {
        return Err(ApiError::invalid_request(
            "Use one Idempotency-Key containing 1 to 128 visible ASCII characters",
        ));
    }
    let mut canonical = body.clone();
    canonical.sort_all_objects();
    let document = serde_json::to_vec(&canonical)
        .map_err(|_| ApiError::invalid_request("Invalid video request"))?;
    Ok(Some(SubmissionIdentity {
        key: Sha256::digest(key).to_vec(),
        request: Sha256::digest(document).to_vec(),
    }))
}

async fn replay_submission(
    state: &AppState,
    principal: &niu_storage::Principal,
    attempt: Uuid,
    model: &str,
) -> Result<(axum::http::StatusCode, Json<Value>), ApiError> {
    let saved = state
        .store
        .media_job_state_for_key(principal, attempt)
        .await
        .map_err(ApiError::from_store)?;
    // Preparation may still be running, or the original process may have died
    // before dispatch. Neither case grants a retry permission to submit.
    Ok((
        axum::http::StatusCode::ACCEPTED,
        Json(saved.unwrap_or_else(|| {
            serde_json::json!({"id":attempt,"object":"video.job","model":model,
            "status":"submission_unknown"})
        })),
    ))
}

pub(super) async fn create_as(
    state: AppState,
    mut body: Value,
    principal: niu_storage::Principal,
    identity: Option<SubmissionIdentity>,
    expected_owner_funded: Option<bool>,
) -> Result<(axum::http::StatusCode, Json<Value>), ApiError> {
    let model = body
        .get("model")
        .and_then(Value::as_str)
        .ok_or_else(|| ApiError::invalid_request("A video model is required"))?
        .to_owned();
    let model = model.as_str();
    if !principal.allows_model(model) {
        return Err(ApiError::not_found());
    }
    let scope = principal.scope();
    if let Some(identity) = &identity
        && let Some(attempt) = state
            .store
            .media_submission_attempt(scope, &identity.key, &identity.request)
            .await
            .map_err(ApiError::from_store)?
    {
        return replay_submission(&state, &principal, attempt, model).await;
    }
    if identity.is_some() && has_images(&body) {
        return Err(ApiError::unsupported_message(
            "Idempotent video submission currently supports text input only",
        ));
    }
    let (route, _, selling, _, owner_funded) =
        validate_admission(&state, &principal, &body, model).await?;
    if expected_owner_funded.is_some_and(|expected| expected != owner_funded) {
        return Err(ApiError::from_store(niu_storage::StoreError::Conflict));
    }
    let images_present = has_images(&body);
    let mut text_body = body.clone();
    let text_positions: Vec<usize> = body["content"]
        .as_array()
        .unwrap()
        .iter()
        .enumerate()
        .filter(|(_, item)| item["type"] == "text")
        .map(|(position, _)| position)
        .collect();
    if images_present {
        if text_positions.is_empty() {
            return Err(ApiError::unsupported_message(
                "Reference video requires a text prompt",
            ));
        }
        text_body["content"] = Value::Array(
            text_positions
                .iter()
                .map(|position| body["content"][*position].clone())
                .collect(),
        );
    }
    let snapshot = super::common::inspect_request_input_with_image_requirements(
        &state,
        &principal,
        model,
        &route.vendor.adapter,
        crate::guardrails::input::Protocol::VideoText,
        &mut text_body,
        images_present,
    )
    .await?;
    if images_present {
        for (index, position) in text_positions.iter().enumerate() {
            body["content"][*position] = text_body["content"][index].clone();
        }
    } else {
        body = text_body;
    }
    if !policy_permits_video_with_images(&snapshot, model, &route.vendor.adapter, images_present) {
        return Err(ApiError::forbidden());
    }
    // Redaction must still satisfy the exact schema selected before inspection.
    // Never select another route or tariff after transforming the prompt.
    let schema: niu_media::VideoSchema =
        serde_json::from_value(route.model.capabilities["video_schema"].clone())
            .map_err(|_| ApiError::unsupported())?;
    let request = schema
        .validate_request(
            &serde_json::to_vec(&body)
                .map_err(|_| ApiError::invalid_request("Invalid inspected video request"))?,
        )
        .map_err(|_| {
            ApiError::invalid_request(
                "The inspected request does not match this model's video schema",
            )
        })?;
    let cipher = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?;
    let token = cipher
        .open(route.vendor.id, &route.credential_ciphertext)
        .map_err(|_| ApiError::unavailable())?;
    let endpoint = format!(
        "{}/{}",
        route.vendor.api_base.trim_end_matches('/'),
        if schema.channel == niu_media::openrouter::REVISION {
            "videos"
        } else {
            "contents/generations/tasks"
        }
    );
    let timeout =
        std::time::Duration::from_secs(state.config.server.request_timeout_seconds.min(60));
    // Verify endpoint policy before committing dispatch intent. Transport repeats
    // this check; if it later fails, intent remains conservatively unresolved.
    crate::upstream::client_for_endpoint(&endpoint, timeout)
        .await
        .map_err(ApiError::from_endpoint)?;
    let images = super::video_images::inspect(&state, &principal, &snapshot, &mut body).await?;
    let image_bindings: Vec<_> = images
        .iter()
        .map(super::video_images::InspectedImage::binding)
        .collect();
    let revision = selling
        .as_ref()
        .map(|rate| rate.pricing.offer().to_owned())
        .unwrap_or_else(|| format!("video:{}:{}", route.vendor.revision, route.model.revision));
    let attempt = if let Some(identity) = &identity {
        let (attempt, fresh) = state
            .store
            .prepare_media_submission(scope, model, &revision, &identity.key, &identity.request)
            .await
            .map_err(ApiError::from_store)?;
        if !fresh {
            return replay_submission(&state, &principal, attempt, model).await;
        }
        attempt
    } else {
        state
            .store
            .prepare_gateway_attempt(scope, model, None, &revision)
            .await
            .map_err(ApiError::from_store)?
            .1
    };
    if owner_funded {
        state
            .store
            .bind_personal_attempt_route(scope, attempt, &route)
            .await
            .map_err(ApiError::from_store)?;
    } else {
        state
            .store
            .bind_provider_offer(
                scope,
                attempt,
                model,
                &route.model.upstream_model,
                Some(&route.vendor.api_base),
            )
            .await
            .map_err(ApiError::from_store)?;
        let rate = selling.as_ref().ok_or_else(ApiError::unavailable)?;
        state
            .store
            .require_customer_media_offer(scope, attempt, rate.pricing.offer(), route.vendor.id)
            .await
            .map_err(ApiError::from_store)?;
        state
            .store
            .bind_supplier_media_rate(
                scope,
                attempt,
                &rate.pricing.tariff().dimensions,
                &rate.pricing.tariff().meter,
                rate.pricing.selected_at(),
            )
            .await
            .map_err(ApiError::from_store)?;
        state
            .store
            .bind_customer_media_pricing(scope, attempt, &rate.pricing)
            .await
            .map_err(ApiError::from_store)?;
    }
    state
        .store
        .pin_media_recovery_route(scope, attempt)
        .await
        .map_err(ApiError::from_store)?;
    state
        .store
        .pin_media_output_snapshot(scope, attempt, &request)
        .await
        .map_err(ApiError::from_store)?;
    state
        .store
        .require_media_dispatch_route(scope, attempt, &route)
        .await
        .map_err(ApiError::from_store)?;
    state
        .store
        .bind_inspected_guardrails(scope, attempt, principal.key_id(), &snapshot)
        .await
        .map_err(ApiError::from_store)?;
    state
        .store
        .set_attempt_dispatch_provider(scope, attempt, &route.vendor.adapter)
        .await
        .map_err(ApiError::from_store)?;
    if !image_bindings.is_empty() {
        state
            .store
            .bind_image_request(&principal, attempt, &snapshot, &request, &image_bindings)
            .await
            .map_err(ApiError::from_store)?;
    }
    if let Some(rate) = &selling {
        state
            .store
            .reserve_customer_media_balance(scope, attempt, &rate.liability)
            .await
            .map_err(ApiError::from_store)?;
    }
    let dispatch = if image_bindings.is_empty() {
        state.store.mark_dispatched(&principal, attempt).await
    } else {
        state
            .store
            .mark_image_dispatched(&principal, attempt, &snapshot, &request, &image_bindings)
            .await
    };
    if let Err(error) = dispatch {
        if selling.is_some() {
            // Only confirmed pre-dispatch failure can release this hold. The
            // storage method rejects ambiguous dispatch/transaction outcomes.
            let _ = state
                .store
                .release_nonexecuted_customer_balance(scope, attempt)
                .await;
        }
        return Err(ApiError::from_store(error));
    }
    let clock = TransportClock::start();
    let result = niu_media::submission::submit_job(
        &endpoint,
        &token,
        &schema.channel,
        &request,
        64 * 1024,
        timeout,
    )
    .await;
    clock
        .save(&state, scope, attempt, "submission", result.is_ok())
        .await;
    let bound = match result {
        Ok(receipt) => state
            .store
            .bind_media_job(
                scope,
                attempt,
                receipt.upstream_job(),
                request.schema_revision(),
            )
            .await
            .is_ok(),
        Err(error) => {
            if let niu_media::submission::SubmissionError::UncertainHttpStatus(status) = error {
                // Persist only a bounded status/classification, never the
                // upstream body, URL or credential. The pinned media route
                // excludes text nonexecution/retry classification in storage.
                let failure = niu_storage::RequestFailure {
                    kind: niu_storage::RequestFailureKind::UpstreamHttpError,
                    upstream_http_status: Some(status),
                };
                if state
                    .store
                    .save_request_failure(scope, attempt, failure)
                    .await
                    .is_err()
                {
                    tracing::error!(attempt_id = %attempt, "video submission failure classification persistence failed");
                }
            }
            false
        }
    };
    if !bound {
        // Dispatch intent already committed. Preserve the client recovery
        // reference even when receipt persistence temporarily fails; never
        // convert an uncertain paid submission into a retryable create error.
        if state
            .store
            .record_media_submission_uncertainty(scope, attempt)
            .await
            .is_err()
        {
            tracing::error!(attempt_id = %attempt, "video uncertainty marker persistence failed");
        }
    }
    Ok((
        axum::http::StatusCode::ACCEPTED,
        Json(serde_json::json!({
            "id":attempt,"object":"video.job","model":model,
            "status":if bound {"unknown"} else {"submission_unknown"}
        })),
    ))
}

/// Explicit single-query refresh, never a generation retry. The opt-in worker
/// uses this same durable evidence path for personal and prepaid jobs.
pub(in crate::web) async fn refresh(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let _in_flight = state.track_inference();
    let principal = state.authorize_api_headers(&headers).await?;
    refresh_for_principal(&state, &principal, id)
        .await
        .map(Json)
}

pub(crate) async fn refresh_for_principal(
    state: &AppState,
    principal: &niu_storage::Principal,
    id: Uuid,
) -> Result<Value, ApiError> {
    let scope = principal.scope();
    state
        .store
        .media_job_state_for_key(principal, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let route = state
        .store
        .media_recovery_route(scope, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(|| ApiError::from_store(niu_storage::StoreError::Unresolved))?;
    let owner = state
        .store
        .personal_vendor_organization(route.vendor_id)
        .await
        .map_err(ApiError::from_store)?;
    let priced = state
        .store
        .customer_media_pricing(scope, id)
        .await
        .map_err(ApiError::from_store)?
        .is_some();
    let openrouter = route.channel == niu_media::openrouter::REVISION;
    if (route.channel != "ark-direct-v1" && !openrouter)
        || (openrouter
            && (route.adapter != "openrouter" || priced || owner != Some(scope.organization_id)))
        || (owner != Some(scope.organization_id) && !(owner.is_none() && priced))
    {
        return Err(ApiError::unsupported_message(
            "This video recovery channel is not implemented",
        ));
    }
    let saved = state
        .store
        .media_job_state_for_key(principal, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let snapshot = state
        .store
        .guardrail_snapshot(scope, principal.key_id())
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::forbidden)?;
    for stored in [&snapshot.workspace_policy, &snapshot.key_policy]
        .into_iter()
        .flatten()
    {
        let policy: crate::guardrails::PolicyDraft =
            serde_json::from_value(stored.clone()).map_err(|_| ApiError::forbidden())?;
        if policy.validate_shape().is_err()
            || !crate::guardrails::EffectiveAccess::compose([policy.models])
                .permits(saved["model"].as_str().ok_or_else(ApiError::not_found)?)
            || !crate::guardrails::EffectiveAccess::compose([policy.providers])
                .permits(&route.adapter)
        {
            return Err(ApiError::forbidden());
        }
    }
    let cipher = state
        .vendor_cipher
        .as_ref()
        .ok_or_else(ApiError::unavailable)?;
    let token = cipher
        .open(route.vendor_id, &route.credential_ciphertext)
        .map_err(|_| ApiError::unavailable())?;
    let mut endpoint = url::Url::parse(&format!(
        "{}/contents/generations/tasks",
        route.api_base.trim_end_matches('/')
    ))
    .map_err(|_| ApiError::unavailable())?;
    endpoint
        .path_segments_mut()
        .map_err(|_| ApiError::unavailable())?
        .push(&route.upstream_job_id);
    let protocol = niu_media::query::DirectQueryProtocol {
        revision: "ark-direct-v1".into(),
        meter: "video_tokens".into(),
        maximum_body_bytes: 64 * 1024,
        maximum_url_bytes: 8192,
    };
    let clock = TransportClock::start();
    let result = if openrouter {
        niu_media::openrouter::query_job(
            &route.api_base,
            &token,
            &route.upstream_job_id,
            &route.upstream_model,
            std::time::Duration::from_secs(state.config.server.request_timeout_seconds.min(60)),
        )
        .await
    } else {
        niu_media::transport::query_job(
            &protocol,
            endpoint.as_str(),
            &token,
            &route.upstream_job_id,
            &route.upstream_model,
            std::time::Duration::from_secs(state.config.server.request_timeout_seconds.min(60)),
        )
        .await
    };
    clock.save(state, scope, id, "query", result.is_ok()).await;
    let observation = result.map_err(|_| {
        ApiError::upstream_message(
            "Video status could not be refreshed; the original job remains unchanged",
        )
    })?;
    state
        .store
        .apply_media_query_observation(scope, id, &observation)
        .await
        .map_err(ApiError::from_store)?;
    if state
        .store
        .media_job_status(scope, id)
        .await
        .map_err(ApiError::from_store)?
        == Some(niu_storage::MediaJobStatus::Succeeded)
    {
        for (kind, url) in [
            (niu_storage::MediaResultKind::Video, observation.video_url()),
            (
                niu_storage::MediaResultKind::LastFrame,
                observation.last_frame_url(),
            ),
        ] {
            if let Some(url) = url {
                let encrypted = cipher
                    .seal_media_result(scope, id, kind, url)
                    .map_err(|_| ApiError::unavailable())?;
                state
                    .store
                    .save_media_result_reference(scope, id, kind, &encrypted)
                    .await
                    .map_err(ApiError::from_store)?;
            }
        }
    }
    let saved = state
        .store
        .media_job_state_for_key(principal, id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(saved)
}

struct TransportClock {
    start: std::time::Instant,
    unix_ms: Option<i64>,
}
impl TransportClock {
    fn start() -> Self {
        Self {
            start: std::time::Instant::now(),
            unix_ms: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .ok()
                .and_then(|v| i64::try_from(v.as_millis()).ok()),
        }
    }
    async fn save(
        self,
        state: &AppState,
        scope: niu_storage::TenantScope,
        id: Uuid,
        phase: &'static str,
        received: bool,
    ) {
        let Some(started_unix_ms) = self.unix_ms else {
            return;
        };
        let Ok(elapsed_ms) = i64::try_from(self.start.elapsed().as_millis()) else {
            return;
        };
        let timing = niu_storage::MediaTransportTiming {
            id: Uuid::new_v4(),
            phase,
            started_unix_ms,
            elapsed_ms,
            received,
        };
        if state
            .store
            .record_media_transport_timing(scope, id, &timing)
            .await
            .is_err()
        {
            tracing::error!(attempt_id=%id,"video transport timing persistence failed");
        }
    }
}

pub(in crate::web) async fn timings(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>, ApiError> {
    let principal = state.authorize_api_headers(&headers).await?;
    state
        .store
        .media_transport_timings_for_key(&principal, id)
        .await
        .map_err(ApiError::from_store)?
        .map(Json)
        .ok_or_else(ApiError::not_found)
}

#[cfg(test)]
mod policy_tests {
    use super::*;
    use serde_json::json;

    fn snapshot() -> niu_storage::GuardrailSnapshot {
        niu_storage::GuardrailSnapshot {
            input_detector_decision_ids: vec![],
            input_outcome: None,
            input_elapsed_ms: None,
            workspace_revision: None,
            workspace_policy: None,
            key_assignment_revision: None,
            key_policy_revision: None,
            key_policy: None,
        }
    }
    fn policy() -> Value {
        json!({"schema_version":1,"name":"Video access","models":{"mode":"allow_all"},"providers":{"mode":"allow_all"}})
    }
    #[test]
    fn video_policy_never_weakens_key_or_workspace_access() {
        let mut snapshot = snapshot();
        assert!(policy_permits_video(&snapshot, "video", "openai"));
        let mut local_rules = policy();
        local_rules["input_rules"] = json!([{"pattern":"secret","action":"redact"}]);
        snapshot.workspace_policy = Some(local_rules);
        assert!(policy_permits_video(&snapshot, "video", "openai"));
        snapshot.workspace_policy = Some(policy());
        let mut restricted = policy();
        restricted["models"] = json!({"mode":"allow_list","values":["other"]});
        snapshot.key_policy = Some(restricted.clone());
        assert!(!policy_permits_video(&snapshot, "video", "openai"));
        snapshot.key_policy = Some(policy());
        snapshot.workspace_policy = Some(restricted);
        assert!(!policy_permits_video(&snapshot, "video", "openai"));
        let mut provider = policy();
        provider["providers"] = json!({"mode":"deny_all"});
        snapshot.workspace_policy = Some(provider);
        assert!(!policy_permits_video(&snapshot, "video", "openai"));
    }
    #[test]
    fn unsupported_inspection_and_malformed_policies_fail_closed() {
        for value in [
            json!({"output":{"mode":"observe_only","rules":[]}}),
            json!({"output":{"mode":"buffered_full","rules":[]}}),
            json!({"schema_version":999}),
            json!({"unknown_setting":true}),
        ] {
            let mut configured = policy();
            for (key, value) in value.as_object().unwrap() {
                configured[key] = value.clone();
            }
            let mut state = snapshot();
            state.workspace_policy = Some(configured.clone());
            assert!(!policy_permits_video(&state, "video", "openai"));
            state.workspace_policy = None;
            state.key_policy = Some(configured);
            assert!(!policy_permits_video(&state, "video", "openai"));
        }
    }
}
