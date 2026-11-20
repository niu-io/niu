//! Delegated task-specific evidence. Inference remains separately authorized.
use super::management::authorize;
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State, rejection::JsonRejection},
    http::HeaderMap,
};
use niu_storage::{EvaluationDefinition, EvaluationRunSubmission};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Page {
    after: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Revision {
    revision: Option<i64>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Attempts {
    revision: i64,
    sample: String,
    after: Option<Uuid>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Comparison {
    left: String,
    right: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Fingerprint {
    protocol: String,
    request: Value,
}
fn slug(value: &str) -> Result<(), ApiError> {
    if !niu_storage::is_valid_pool_slug(value) {
        return Err(ApiError::invalid_request(
            "Use a readable evaluation or run slug",
        ));
    }
    Ok(())
}
fn page(mut rows: Vec<Value>, cursor: &str) -> Value {
    let more = rows.len() > 100;
    rows.truncate(100);
    let next = if more {
        rows.last().and_then(|row| row.get(cursor)).cloned()
    } else {
        None
    };
    json!({"data":rows,"next_after":next})
}
/// ```openapi
/// {
///   "path": "/v1/evaluations",
///   "method": "get",
///   "operation": {
///     "operationId": "listEvaluations",
///     "summary": "List workspace evaluation definitions",
///     "description": "Requires a current workspace API key with explicitly delegated evaluations:read. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged.",
///     "x-niu-implementation": "implemented",
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
///         "name": "after",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped evidence",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "$ref": "#/components/schemas/EvaluationDefinition"
///                   }
///                 },
///                 "next_after": {
///                   "type": [
///                     "string",
///                     "null"
///                   ]
///                 }
///               },
///               "required": [
///                 "data",
///                 "next_after"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid input or mismatched evaluation binding"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Current delegated capability required"
///       },
///       "404": {
///         "description": "Scoped definition or run not found"
///       },
///       "409": {
///         "description": "Revision or immutable submission conflict"
///       }
///     }
///   },
///   "schemas": {
///     "EvaluationDefinition": {
///       "type": "object",
///       "properties": {
///         "slug": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         },
///         "name": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200
///         },
///         "task": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 4000
///         },
///         "rubric": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 8000
///         },
///         "protocol": {
///           "type": "string",
///           "enum": [
///             "chat",
///             "responses",
///             "messages",
///             "embeddings",
///             "generate_content"
///           ]
///         },
///         "revision": {
///           "type": "integer",
///           "minimum": 0,
///           "maximum": 9007199254740990
///         },
///         "samples": {
///           "type": "array",
///           "minItems": 1,
///           "maxItems": 64,
///           "items": {
///             "type": "object",
///             "properties": {
///               "reference": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 100,
///                 "pattern": "^[A-Za-z0-9_.-]+$"
///               },
///               "request_sha256": {
///                 "type": "string",
///                 "pattern": "^[0-9a-f]{64}$"
///               }
///             },
///             "required": [
///               "reference",
///               "request_sha256"
///             ],
///             "additionalProperties": false
///           }
///         }
///       },
///       "required": [
///         "slug",
///         "name",
///         "task",
///         "rubric",
///         "protocol",
///         "revision",
///         "samples"
///       ],
///       "additionalProperties": false
///     },
///     "EvaluationRunSubmission": {
///       "type": "object",
///       "properties": {
///         "slug": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         },
///         "name": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200
///         },
///         "evaluation_revision": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 9007199254740991
///         },
///         "evaluator": {
///           "type": "object",
///           "properties": {
///             "kind": {
///               "type": "string",
///               "enum": [
///                 "agent",
///                 "check"
///               ]
///             },
///             "name": {
///               "type": "string",
///               "minLength": 1,
///               "maxLength": 200
///             },
///             "version": {
///               "type": "string",
///               "minLength": 1,
///               "maxLength": 200
///             }
///           },
///           "required": [
///             "kind",
///             "name",
///             "version"
///           ],
///           "additionalProperties": false
///         },
///         "results": {
///           "type": "array",
///           "minItems": 1,
///           "maxItems": 64,
///           "items": {
///             "type": "object",
///             "properties": {
///               "sample": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 100
///               },
///               "attempt_id": {
///                 "type": "string",
///                 "format": "uuid"
///               },
///               "verdict": {
///                 "type": "string",
///                 "enum": [
///                   "accepted",
///                   "rejected",
///                   "unknown"
///                 ]
///               },
///               "reason": {
///                 "type": [
///                   "string",
///                   "null"
///                 ],
///                 "maxLength": 2000
///               }
///             },
///             "required": [
///               "sample",
///               "attempt_id",
///               "verdict"
///             ],
///             "additionalProperties": false
///           }
///         }
///       },
///       "required": [
///         "slug",
///         "name",
///         "evaluation_revision",
///         "evaluator",
///         "results"
///       ],
///       "additionalProperties": false
///     },
///     "EvaluationSummary": {
///       "type": "object",
///       "properties": {
///         "samples": {
///           "type": "integer"
///         },
///         "verified_inputs": {
///           "type": "integer"
///         },
///         "unverified_inputs": {
///           "type": "integer"
///         },
///         "verdicts": {
///           "type": "object",
///           "additionalProperties": {
///             "type": "integer"
///           }
///         },
///         "attempts": {
///           "type": "integer"
///         },
///         "unknown_charge_attempts": {
///           "type": "integer"
///         },
///         "customer_charge_totals": {
///           "type": "array",
///           "items": {
///             "type": "object",
///             "properties": {
///               "dimension": {
///                 "type": "string"
///               },
///               "amount": {
///                 "type": "string"
///               }
///             },
///             "required": [
///               "dimension",
///               "amount"
///             ]
///           }
///         },
///         "cost_per_accepted": {
///           "oneOf": [
///             {
///               "type": "null"
///             },
///             {
///               "type": "object",
///               "properties": {
///                 "dimension": {
///                   "type": "string"
///                 },
///                 "numerator": {
///                   "type": "string"
///                 },
///                 "denominator": {
///                   "type": "integer"
///                 }
///               },
///               "required": [
///                 "dimension",
///                 "numerator",
///                 "denominator"
///               ]
///             }
///           ]
///         },
///         "cost_per_accepted_basis": {
///           "const": "all_attempts_in_submitted_operations"
///         },
///         "duration_basis": {
///           "const": "evaluated_attempt_only"
///         }
///       },
///       "required": [
///         "samples",
///         "verified_inputs",
///         "unverified_inputs",
///         "verdicts",
///         "attempts",
///         "unknown_charge_attempts",
///         "customer_charge_totals",
///         "cost_per_accepted",
///         "cost_per_accepted_basis",
///         "duration_basis"
///       ]
///     },
///     "EvaluationReceipt": {
///       "type": "object",
///       "properties": {
///         "slug": {
///           "type": "string"
///         },
///         "name": {
///           "type": "string"
///         },
///         "evaluation": {
///           "type": "string"
///         },
///         "evaluation_revision": {
///           "type": "integer"
///         },
///         "definition": {
///           "$ref": "#/components/schemas/EvaluationDefinition"
///         },
///         "evaluator": {
///           "type": "object"
///         },
///         "submitter": {
///           "type": "object",
///           "description": "Attributed delegated API key; internal identifiers are API evidence, not UI labels."
///         },
///         "capture": {
///           "type": "object",
///           "properties": {
///             "consistency": {
///               "const": "repeatable_read"
///             },
///             "started_at": {
///               "type": "string"
///             },
///             "finished_at": {
///               "type": "string"
///             }
///           },
///           "required": [
///             "consistency",
///             "started_at",
///             "finished_at"
///           ]
///         },
///         "results": {
///           "type": "array",
///           "items": {
///             "type": "object",
///             "properties": {
///               "sample": {
///                 "type": "string"
///               },
///               "request_sha256": {
///                 "type": "string"
///               },
///               "input_match": {
///                 "enum": [
///                   "verified",
///                   "unverified"
///                 ]
///               },
///               "source_binding": {
///                 "type": [
///                   "object",
///                   "null"
///                 ]
///               },
///               "evaluated_attempt_id": {
///                 "type": "string"
///               },
///               "operation_id": {
///                 "type": "string"
///               },
///               "judgment": {
///                 "type": "object"
///               },
///               "duration_ms": {
///                 "type": [
///                   "integer",
///                   "null"
///                 ]
///               },
///               "attempts": {
///                 "type": "array",
///                 "items": {
///                   "type": "object",
///                   "description": "Customer-safe execution, routing revisions, usage, timing and charge coverage. No procurement information."
///                 }
///               },
///               "pool_selections": {
///                 "type": "array",
///                 "items": {
///                   "type": "object"
///                 }
///               }
///             },
///             "required": [
///               "sample",
///               "request_sha256",
///               "input_match",
///               "source_binding",
///               "evaluated_attempt_id",
///               "operation_id",
///               "judgment",
///               "duration_ms",
///               "attempts",
///               "pool_selections"
///             ]
///           }
///         },
///         "summary": {
///           "$ref": "#/components/schemas/EvaluationSummary"
///         }
///       },
///       "required": [
///         "slug",
///         "name",
///         "evaluation",
///         "evaluation_revision",
///         "definition",
///         "evaluator",
///         "submitter",
///         "capture",
///         "results",
///         "summary"
///       ]
///     }
///   }
/// }
/// ```
pub async fn list(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<Page>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "evaluations:read").await?;
    if let Some(after) = &query.after {
        slug(after)?;
    }
    let rows = state
        .store
        .evaluation_definitions(principal.scope(), query.after.as_deref())
        .await
        .map_err(ApiError::from_store)?;
    let data = rows
        .into_iter()
        .map(serde_json::to_value)
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| ApiError::storage_unavailable())?;
    Ok(Json(page(data, "slug")))
}
/// ```openapi
/// {
///   "path": "/v1/evaluations/{slug}",
///   "method": "get",
///   "operation": {
///     "operationId": "getEvaluation",
///     "summary": "Read a current or historical evaluation definition",
///     "description": "Requires a current workspace API key with explicitly delegated evaluations:read. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged.",
///     "x-niu-implementation": "implemented",
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
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       },
///       {
///         "name": "revision",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 9007199254740991
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped evidence",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/EvaluationDefinition"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid input or mismatched evaluation binding"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Current delegated capability required"
///       },
///       "404": {
///         "description": "Scoped definition or run not found"
///       },
///       "409": {
///         "description": "Revision or immutable submission conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Query(query): Query<Revision>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "evaluations:read").await?;
    slug(&name)?;
    if query
        .revision
        .is_some_and(|revision| !(1..=9_007_199_254_740_991).contains(&revision))
    {
        return Err(ApiError::invalid_request("Invalid evaluation revision"));
    }
    let row = state
        .store
        .evaluation_definition(principal.scope(), &name, query.revision)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!(row)))
}
/// ```openapi
/// {
///   "path": "/v1/evaluations/{slug}",
///   "method": "put",
///   "operation": {
///     "operationId": "setEvaluation",
///     "summary": "Save an evaluation definition with optimistic revision",
///     "description": "Requires a current workspace API key with explicitly delegated evaluations:write. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged.",
///     "x-niu-implementation": "implemented",
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
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped evidence",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/EvaluationDefinition"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid input or mismatched evaluation binding"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Current delegated capability required"
///       },
///       "404": {
///         "description": "Scoped definition or run not found"
///       },
///       "409": {
///         "description": "Revision or immutable submission conflict"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "$ref": "#/components/schemas/EvaluationDefinition"
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn put(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    body: Result<Json<EvaluationDefinition>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "evaluations:write").await?;
    slug(&name)?;
    let Json(input) =
        body.map_err(|_| ApiError::invalid_request("Invalid evaluation definition"))?;
    if name != input.slug {
        return Err(ApiError::invalid_request(
            "Path and definition slug must match",
        ));
    }
    Ok(Json(json!(
        state
            .store
            .set_evaluation_definition(&principal, &input)
            .await
            .map_err(ApiError::from_store)?
    )))
}
/// ```openapi
/// {
///   "path": "/v1/evaluations/fingerprint",
///   "method": "post",
///   "operation": {
///     "operationId": "fingerprintEvaluationRequest",
///     "summary": "Fingerprint effective task input without inference",
///     "description": "Requires a current workspace API key with explicitly delegated evaluations:read. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged. Version 1 removes only top-level model, stream, stream_options, metadata and user, recursively canonicalizes JSON, and hashes the protocol-bound request. The request body is not saved by this operation. It is not live qualification.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       },
///       {
///         "niuApiKeyAuth": []
///       }
///     ],
///     "parameters": [],
///     "responses": {
///       "200": {
///         "description": "Scoped evidence",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "request_sha256": {
///                   "type": "string",
///                   "pattern": "^[0-9a-f]{64}$"
///                 },
///                 "fingerprint_version": {
///                   "const": 1
///                 },
///                 "protocol": {
///                   "type": "string"
///                 },
///                 "inference_performed": {
///                   "const": false
///                 }
///               },
///               "required": [
///                 "request_sha256",
///                 "fingerprint_version",
///                 "protocol",
///                 "inference_performed"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid input or mismatched evaluation binding"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Current delegated capability required"
///       },
///       "404": {
///         "description": "Scoped definition or run not found"
///       },
///       "409": {
///         "description": "Revision or immutable submission conflict"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "properties": {
///               "protocol": {
///                 "type": "string",
///                 "enum": [
///                   "chat",
///                   "responses",
///                   "messages",
///                   "embeddings",
///                   "generate_content"
///                 ]
///               },
///               "request": {
///                 "type": "object"
///               }
///             },
///             "required": [
///               "protocol",
///               "request"
///             ],
///             "additionalProperties": false
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn fingerprint(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Result<Json<Fingerprint>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers, "evaluations:read").await?;
    let Json(input) = body.map_err(|_| ApiError::invalid_request("Invalid fingerprint request"))?;
    let digest = niu_storage::evaluation_request_fingerprint(&input.protocol, &input.request)
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"request_sha256":digest,"fingerprint_version":1,"protocol":input.protocol,"inference_performed":false}),
    ))
}
/// ```openapi
/// {
///   "path": "/v1/evaluations/{slug}/attempts",
///   "method": "get",
///   "operation": {
///     "operationId": "listEvaluationAttempts",
///     "summary": "Discover admitted attempts for an evaluation sample",
///     "description": "Requires a current workspace API key with explicitly delegated evaluations:read. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged. Snapshot pagination is lexical by attempt ID; restart pagination to discover newly admitted work. Absence does not prove that no execution occurred. Do not automatically replay paid inference after an uncertain response.",
///     "x-niu-implementation": "implemented",
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
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       },
///       {
///         "name": "revision",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "integer",
///           "minimum": 1,
///           "maximum": 9007199254740991
///         }
///       },
///       {
///         "name": "sample",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 100,
///           "pattern": "^[A-Za-z0-9_.-]+$"
///         }
///       },
///       {
///         "name": "after",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped evidence",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "type": "object",
///                     "properties": {
///                       "attempt_id": {
///                         "type": "string"
///                       },
///                       "operation_id": {
///                         "type": "string"
///                       },
///                       "bound_at": {
///                         "type": "string"
///                       },
///                       "request_sha256": {
///                         "type": "string"
///                       },
///                       "execution": {
///                         "type": "string"
///                       },
///                       "completed_at": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       }
///                     },
///                     "required": [
///                       "attempt_id",
///                       "operation_id",
///                       "bound_at",
///                       "request_sha256",
///                       "execution",
///                       "completed_at"
///                     ]
///                   }
///                 },
///                 "next_after": {
///                   "type": [
///                     "string",
///                     "null"
///                   ]
///                 },
///                 "discovery_semantics": {
///                   "type": "string"
///                 }
///               },
///               "required": [
///                 "data",
///                 "next_after",
///                 "discovery_semantics"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid input or mismatched evaluation binding"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Current delegated capability required"
///       },
///       "404": {
///         "description": "Scoped definition or run not found"
///       },
///       "409": {
///         "description": "Revision or immutable submission conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn attempts(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Query(query): Query<Attempts>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "evaluations:read").await?;
    slug(&name)?;
    let definition = state
        .store
        .evaluation_definition(principal.scope(), &name, Some(query.revision))
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    if !definition
        .samples
        .iter()
        .any(|sample| sample.reference == query.sample)
    {
        return Err(ApiError::invalid_request("Unknown evaluation sample"));
    }
    let rows = state
        .store
        .evaluation_attempts(
            principal.scope(),
            &name,
            query.revision,
            &query.sample,
            query.after,
        )
        .await
        .map_err(ApiError::from_store)?;
    let mut result = page(rows, "attempt_id");
    result["discovery_semantics"] = json!(
        "snapshot; restart pagination to discover newly admitted attempts; absence does not prove no execution"
    );
    Ok(Json(result))
}
/// ```openapi
/// {
///   "path": "/v1/evaluations/{slug}/runs",
///   "method": "get",
///   "operation": {
///     "operationId": "listEvaluationRuns",
///     "summary": "List immutable evaluation run receipts",
///     "description": "Requires a current workspace API key with explicitly delegated evaluations:read. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged.",
///     "x-niu-implementation": "implemented",
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
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       },
///       {
///         "name": "after",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped evidence",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "type": "object",
///                     "properties": {
///                       "slug": {
///                         "type": "string"
///                       },
///                       "name": {
///                         "type": "string"
///                       },
///                       "evaluation_revision": {
///                         "type": "integer"
///                       },
///                       "created_at": {
///                         "type": "string"
///                       },
///                       "evaluator": {
///                         "type": "object"
///                       },
///                       "summary": {
///                         "$ref": "#/components/schemas/EvaluationSummary"
///                       }
///                     },
///                     "required": [
///                       "slug",
///                       "name",
///                       "evaluation_revision",
///                       "created_at",
///                       "evaluator",
///                       "summary"
///                     ]
///                   }
///                 },
///                 "next_after": {
///                   "type": [
///                     "string",
///                     "null"
///                   ]
///                 }
///               },
///               "required": [
///                 "data",
///                 "next_after"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid input or mismatched evaluation binding"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Current delegated capability required"
///       },
///       "404": {
///         "description": "Scoped definition or run not found"
///       },
///       "409": {
///         "description": "Revision or immutable submission conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn runs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Query(query): Query<Page>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "evaluations:read").await?;
    slug(&name)?;
    if let Some(after) = &query.after {
        slug(after)?;
    }
    if state
        .store
        .evaluation_definition(principal.scope(), &name, None)
        .await
        .map_err(ApiError::from_store)?
        .is_none()
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(page(
        state
            .store
            .evaluation_runs(principal.scope(), &name, query.after.as_deref())
            .await
            .map_err(ApiError::from_store)?,
        "slug",
    )))
}
/// ```openapi
/// {
///   "path": "/v1/evaluations/{slug}/runs",
///   "method": "post",
///   "operation": {
///     "operationId": "recordEvaluationRun",
///     "summary": "Record attributed judgments and customer-safe execution evidence",
///     "description": "Requires a current workspace API key with explicitly delegated evaluations:write. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged. Same run slug and identical submission returns the original immutable receipt; changed submission conflicts. Includes every attempt in each selected operation. Pending, owner-funded and unavailable charges remain unknown. No inference is performed.",
///     "x-niu-implementation": "implemented",
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
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped evidence",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/EvaluationReceipt"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid input or mismatched evaluation binding"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Current delegated capability required"
///       },
///       "404": {
///         "description": "Scoped definition or run not found"
///       },
///       "409": {
///         "description": "Revision or immutable submission conflict"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "$ref": "#/components/schemas/EvaluationRunSubmission"
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn record(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    body: Result<Json<EvaluationRunSubmission>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "evaluations:write").await?;
    slug(&name)?;
    let Json(input) = body.map_err(|_| ApiError::invalid_request("Invalid evaluation run"))?;
    Ok(Json(
        state
            .store
            .record_evaluation_run(&principal, &name, &input)
            .await
            .map_err(ApiError::from_store)?,
    ))
}
/// ```openapi
/// {
///   "path": "/v1/evaluations/{slug}/runs/{run}",
///   "method": "get",
///   "operation": {
///     "operationId": "getEvaluationRun",
///     "summary": "Read an immutable evaluation receipt",
///     "description": "Requires a current workspace API key with explicitly delegated evaluations:read. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged.",
///     "x-niu-implementation": "implemented",
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
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       },
///       {
///         "name": "run",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped evidence",
///         "content": {
///           "application/json": {
///             "schema": {
///               "$ref": "#/components/schemas/EvaluationReceipt"
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid input or mismatched evaluation binding"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Current delegated capability required"
///       },
///       "404": {
///         "description": "Scoped definition or run not found"
///       },
///       "409": {
///         "description": "Revision or immutable submission conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn run(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((name, run)): Path<(String, String)>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "evaluations:read").await?;
    slug(&name)?;
    slug(&run)?;
    Ok(Json(
        state
            .store
            .evaluation_run(principal.scope(), &name, &run)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(ApiError::not_found)?,
    ))
}
/// ```openapi
/// {
///   "path": "/v1/evaluations/{slug}/compare",
///   "method": "get",
///   "operation": {
///     "operationId": "compareEvaluationRuns",
///     "summary": "Compare verified matched evaluation samples",
///     "description": "Requires a current workspace API key with explicitly delegated evaluations:read. No-store response. Judgments are submitter-reported, not platform guarantees. Inference is separately authorized and charged. Intersects verified sample references and request hashes only when task, protocol and rubric match. Reports evaluator changes and shared operations; never selects a universal winner.",
///     "x-niu-implementation": "implemented",
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
///         "name": "slug",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       },
///       {
///         "name": "left",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       },
///       {
///         "name": "right",
///         "in": "query",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Scoped evidence",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "left": {
///                   "type": "string"
///                 },
///                 "right": {
///                   "type": "string"
///                 },
///                 "same_task_protocol_and_rubric": {
///                   "type": "boolean"
///                 },
///                 "same_evaluator": {
///                   "type": "boolean"
///                 },
///                 "quality_comparable": {
///                   "type": "boolean"
///                 },
///                 "matched_verified_samples": {
///                   "type": "integer"
///                 },
///                 "shared_operations": {
///                   "type": "integer"
///                 },
///                 "left_unmatched_samples": {
///                   "type": "integer"
///                 },
///                 "right_unmatched_samples": {
///                   "type": "integer"
///                 },
///                 "left_summary": {
///                   "$ref": "#/components/schemas/EvaluationSummary"
///                 },
///                 "right_summary": {
///                   "$ref": "#/components/schemas/EvaluationSummary"
///                 }
///               },
///               "required": [
///                 "left",
///                 "right",
///                 "same_task_protocol_and_rubric",
///                 "same_evaluator",
///                 "quality_comparable",
///                 "matched_verified_samples",
///                 "shared_operations",
///                 "left_unmatched_samples",
///                 "right_unmatched_samples",
///                 "left_summary",
///                 "right_summary"
///               ]
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid input or mismatched evaluation binding"
///       },
///       "401": {
///         "description": "Invalid, expired or revoked key"
///       },
///       "403": {
///         "description": "Current delegated capability required"
///       },
///       "404": {
///         "description": "Scoped definition or run not found"
///       },
///       "409": {
///         "description": "Revision or immutable submission conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn compare(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(name): Path<String>,
    Query(query): Query<Comparison>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "evaluations:read").await?;
    slug(&name)?;
    slug(&query.left)?;
    slug(&query.right)?;
    Ok(Json(
        state
            .store
            .compare_evaluation_runs(principal.scope(), &name, &query.left, &query.right)
            .await
            .map_err(ApiError::from_store)?
            .ok_or_else(ApiError::not_found)?,
    ))
}
