//! Workspace model policies. Never forwards platform pool administration or audit.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State, rejection::JsonRejection},
    http::HeaderMap,
};
use niu_storage::{Principal, WorkspaceModelPool};
use serde::Deserialize;
use serde_json::{Value, json};

use super::management::authorize;
async fn validate_models(
    state: &AppState,
    principal: &Principal,
    pool: &WorkspaceModelPool,
) -> Result<(), ApiError> {
    let aliases = pool.validate().map_err(ApiError::from_store)?;
    let models = crate::vendors::scoped_models(state, principal.scope().organization_id).await?;
    if models.contains_key(&format!("pool/{}", pool.slug))
        || aliases.iter().any(|alias| {
            !principal.allows_model(alias)
                || !models.contains_key(alias)
                || alias.starts_with("codex/")
        })
    {
        return Err(ApiError::invalid_request(
            "Every pool candidate must be an authorized model; pool names cannot shadow an existing model",
        ));
    }
    Ok(())
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Page {
    after: Option<String>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct History {
    before: Option<i64>,
}
#[derive(Deserialize)]
#[serde(untagged)]
pub enum PreviewInput {
    Contextual(PreviewProposal),
    Configuration(WorkspaceModelPool),
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PreviewProposal {
    configuration: WorkspaceModelPool,
    context: Option<PreviewContext>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PreviewContext {
    protocol: crate::guardrails::input::Protocol,
    #[serde(default)]
    streaming: bool,
    #[serde(default)]
    vision: bool,
    #[serde(default)]
    tools: bool,
    #[serde(default)]
    structured_output: bool,
    #[serde(default)]
    reasoning: bool,
    #[serde(default)]
    embedding_dimensions: bool,
    #[serde(default)]
    embedding_base64: bool,
    estimated_input_tokens: Option<u64>,
    requested_output_tokens: Option<u64>,
}
impl PreviewContext {
    fn requirements(
        &self,
        principal: &Principal,
    ) -> Result<crate::config::ModelRequirements, ApiError> {
        use crate::guardrails::input::Protocol;
        if self.protocol == Protocol::VideoText
            || self
                .estimated_input_tokens
                .is_some_and(|value| value > 10_000_000)
            || self
                .requested_output_tokens
                .is_some_and(|value| value == 0 || value > 10_000_000)
        {
            return Err(ApiError::invalid_request(
                "Use a supported pool protocol and bounded request traits",
            ));
        }
        let messages = self.protocol == Protocol::Messages;
        Ok(crate::config::ModelRequirements {
            project_id: Some(principal.scope().project_id),
            streaming: self.streaming && !messages,
            messages_streaming: self.streaming && messages,
            messages_tools: self.tools && messages,
            messages_streaming_tools: self.tools && self.streaming && messages,
            tools: self.tools && !messages,
            streaming_tools: self.tools && self.streaming && !messages,
            structured_output: self.structured_output,
            vision: self.vision,
            reasoning: self.reasoning,
            embedding_dimensions: self.embedding_dimensions,
            embedding_base64: self.embedding_base64,
            estimated_input_tokens: self.estimated_input_tokens,
            requested_output_tokens: self.requested_output_tokens,
        })
    }
}
fn policy_candidates<'a>(
    pool: &'a WorkspaceModelPool,
    protocol: &crate::guardrails::input::Protocol,
    requirements: &crate::config::ModelRequirements,
) -> (
    Option<&'a niu_storage::RoutePoolRule>,
    &'a [niu_storage::RoutePoolCandidate],
    bool,
) {
    let rule = pool.rules.iter().find(|rule| {
        rule.enabled
            && crate::vendors::rule_conditions_match(
                &rule.conditions,
                Some(protocol),
                Some(requirements),
            )
    });
    match rule {
        Some(rule) => (Some(rule), &rule.candidates, false),
        None if matches!(
            pool.default_action,
            niu_storage::RoutePoolDefaultAction::Candidates
        ) =>
        {
            (None, &pool.candidates, false)
        }
        None => (None, &[], true),
    }
}
fn candidate_rejection(
    candidate: &niu_storage::RoutePoolCandidate,
    model: Option<&crate::config::ModelConfig>,
    principal: &Principal,
    protocol: &crate::guardrails::input::Protocol,
    requirements: &crate::config::ModelRequirements,
) -> Option<&'static str> {
    if !candidate.enabled {
        return Some("candidate_disabled");
    }
    if !principal.allows_model(&candidate.alias) {
        return Some("model_not_granted");
    }
    let Some(model) = model else {
        return Some("model_not_visible");
    };
    if !crate::vendors::supports_protocol(model, protocol) {
        return Some("protocol_not_supported");
    }
    if !requirements.allows(model) {
        return Some("request_capability_not_supported");
    }
    None
}

/// ```openapi
/// {
///   "path": "/v1/pools",
///   "method": "get",
///   "operation": {
///     "x-niu-implementation": "implemented",
///     "operationId": "listWorkspacePools",
///     "summary": "List workspace model policies",
///     "description": "Requires a current workspace API key with delegated pools:read. Platform supply pools, procurement prices and credentials are never exposed. Returns at most 100 policies ordered by slug. Continue with next_after while has_more is true.",
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
///           "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Workspace-scoped result; no-store.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/WorkspaceModelPool"
///                   }
///                 },
///                 "has_more": {
///                   "type": "boolean"
///                 },
///                 "next_after": {
///                   "type": [
///                     "string",
///                     "null"
///                   ]
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Missing, expired or revoked credential"
///       },
///       "403": {
///         "description": "Required delegated capability is absent"
///       },
///       "404": {
///         "description": "Scoped pool not found"
///       },
///       "409": {
///         "description": "Expected revision conflict"
///       }
///     }
///   },
///   "schemas": {
///     "WorkspaceModelPool": {
///       "type": "object",
///       "additionalProperties": false,
///       "required": [
///         "slug",
///         "name",
///         "description",
///         "enabled",
///         "revision",
///         "candidates"
///       ],
///       "properties": {
///         "slug": {
///           "type": "string",
///           "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
///           "maxLength": 80
///         },
///         "name": {
///           "type": "string",
///           "minLength": 1,
///           "maxLength": 200
///         },
///         "description": {
///           "type": "string",
///           "maxLength": 4000
///         },
///         "enabled": {
///           "type": "boolean"
///         },
///         "revision": {
///           "type": "integer",
///           "minimum": 0,
///           "maximum": 9007199254740990
///         },
///         "candidates": {
///           "type": "array",
///           "minItems": 1,
///           "maxItems": 64,
///           "items": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "alias",
///               "priority",
///               "weight",
///               "enabled"
///             ],
///             "properties": {
///               "alias": {
///                 "type": "string",
///                 "minLength": 1,
///                 "maxLength": 200
///               },
///               "priority": {
///                 "type": "integer",
///                 "minimum": -1000,
///                 "maximum": 1000
///               },
///               "weight": {
///                 "type": "integer",
///                 "minimum": 1,
///                 "maximum": 10000
///               },
///               "enabled": {
///                 "type": "boolean"
///               }
///             }
///           }
///         },
///         "rules": {
///           "type": "array",
///           "maxItems": 32,
///           "items": {
///             "type": "object",
///             "additionalProperties": false,
///             "required": [
///               "id",
///               "name",
///               "candidates"
///             ],
///             "properties": {
///               "id": {
///                 "type": "string"
///               },
///               "name": {
///                 "type": "string"
///               },
///               "enabled": {
///                 "type": "boolean"
///               },
///               "conditions": {
///                 "type": "object",
///                 "additionalProperties": false,
///                 "properties": {
///                   "protocol": {
///                     "type": "string",
///                     "enum": [
///                       "chat",
///                       "messages",
///                       "responses"
///                     ]
///                   },
///                   "streaming": {
///                     "type": "boolean"
///                   },
///                   "vision": {
///                     "type": "boolean"
///                   },
///                   "tools": {
///                     "type": "boolean"
///                   },
///                   "structured_output": {
///                     "type": "boolean"
///                   },
///                   "reasoning": {
///                     "type": "boolean"
///                   },
///                   "min_input_tokens": {
///                     "type": "integer",
///                     "minimum": 0
///                   },
///                   "max_input_tokens": {
///                     "type": "integer",
///                     "minimum": 0
///                   },
///                   "min_output_tokens": {
///                     "type": "integer",
///                     "minimum": 0
///                   },
///                   "max_output_tokens": {
///                     "type": "integer",
///                     "minimum": 0
///                   }
///                 }
///               },
///               "candidates": {
///                 "type": "array",
///                 "minItems": 1,
///                 "maxItems": 64,
///                 "items": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "required": [
///                     "alias",
///                     "priority",
///                     "weight",
///                     "enabled"
///                   ],
///                   "properties": {
///                     "alias": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 200
///                     },
///                     "priority": {
///                       "type": "integer",
///                       "minimum": -1000,
///                       "maximum": 1000
///                     },
///                     "weight": {
///                       "type": "integer",
///                       "minimum": 1,
///                       "maximum": 10000
///                     },
///                     "enabled": {
///                       "type": "boolean"
///                     }
///                   }
///                 }
///               }
///             }
///           }
///         },
///         "default_action": {
///           "type": "string",
///           "enum": [
///             "candidates",
///             "reject"
///           ]
///         }
///       }
///     },
///     "WorkspacePoolPreviewRequest": {
///       "type": "object",
///       "additionalProperties": false,
///       "properties": {
///         "configuration": {
///           "$ref": "#/components/schemas/WorkspaceModelPool"
///         },
///         "context": {
///           "type": "object",
///           "additionalProperties": false,
///           "required": [
///             "protocol"
///           ],
///           "properties": {
///             "protocol": {
///               "type": "string",
///               "enum": [
///                 "chat",
///                 "responses",
///                 "messages",
///                 "embeddings",
///                 "generate_content"
///               ]
///             },
///             "streaming": {
///               "type": "boolean"
///             },
///             "vision": {
///               "type": "boolean"
///             },
///             "tools": {
///               "type": "boolean"
///             },
///             "structured_output": {
///               "type": "boolean"
///             },
///             "reasoning": {
///               "type": "boolean"
///             },
///             "embedding_dimensions": {
///               "type": "boolean"
///             },
///             "embedding_base64": {
///               "type": "boolean"
///             },
///             "estimated_input_tokens": {
///               "type": "integer",
///               "minimum": 0,
///               "maximum": 10000000
///             },
///             "requested_output_tokens": {
///               "type": "integer",
///               "minimum": 1,
///               "maximum": 10000000
///             }
///           }
///         }
///       },
///       "required": [
///         "configuration"
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
    let principal = authorize(&state, &headers, "pools:read").await?;
    if query
        .after
        .as_ref()
        .is_some_and(|value| !niu_storage::is_valid_pool_slug(value))
    {
        return Err(ApiError::invalid_request(
            "Use the returned pool slug cursor",
        ));
    }
    let mut rows = state
        .store
        .workspace_model_pools(principal.scope(), query.after.as_deref())
        .await
        .map_err(ApiError::from_store)?;
    let has_more = rows.len() > 100;
    rows.truncate(100);
    let next = has_more.then(|| rows.last().unwrap().slug.clone());
    Ok(Json(
        json!({"data":rows,"has_more":has_more,"next_after":next}),
    ))
}
/// ```openapi
/// {
///   "path": "/v1/pools/{slug}",
///   "method": "get",
///   "operation": {
///     "x-niu-implementation": "implemented",
///     "operationId": "getWorkspacePool",
///     "summary": "Read a workspace model policy",
///     "description": "Requires a current workspace API key with delegated pools:read. Platform supply pools, procurement prices and credentials are never exposed. A pool is invoked as pool/<slug>, subject to the calling key permitting the selected concrete candidate. A saved policy does not establish live qualification.",
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
///           "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Workspace-scoped result; no-store.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/WorkspaceModelPool"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Missing, expired or revoked credential"
///       },
///       "403": {
///         "description": "Required delegated capability is absent"
///       },
///       "404": {
///         "description": "Scoped pool not found"
///       },
///       "409": {
///         "description": "Expected revision conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "pools:read").await?;
    let pool = state
        .store
        .workspace_model_pool(principal.scope(), &slug)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data":pool})))
}
/// ```openapi
/// {
///   "path": "/v1/pools/{slug}",
///   "method": "put",
///   "operation": {
///     "x-niu-implementation": "implemented",
///     "operationId": "setWorkspacePool",
///     "summary": "Create or replace a workspace model policy",
///     "description": "Requires a current workspace API key with delegated pools:write. Platform supply pools, procurement prices and credentials are never exposed. Use revision zero to create, otherwise the current expected revision. Conflicts require read/reconcile; no automatic replay. Candidate aliases must be allowed by the key and visible in the workspace. This operation does not invoke a model. Read back the saved revision. Restore a prior configuration using the current expected revision.",
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
///           "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Workspace-scoped result; no-store.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "$ref": "#/components/schemas/WorkspaceModelPool"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Missing, expired or revoked credential"
///       },
///       "403": {
///         "description": "Required delegated capability is absent"
///       },
///       "404": {
///         "description": "Scoped pool not found"
///       },
///       "409": {
///         "description": "Expected revision conflict"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "$ref": "#/components/schemas/WorkspaceModelPool"
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
    Path(slug): Path<String>,
    input: Result<Json<WorkspaceModelPool>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "pools:write").await?;
    let Json(input) = input
        .map_err(|_| ApiError::invalid_request("Provide a workspace model pool configuration"))?;
    if slug != input.slug {
        return Err(ApiError::invalid_request("Pool slug must match its URL"));
    }
    validate_models(&state, &principal, &input).await?;
    let saved = state
        .store
        .set_workspace_model_pool(&principal, &input)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":saved})))
}
/// ```openapi
/// {
///   "path": "/v1/pools/{slug}/history",
///   "method": "get",
///   "operation": {
///     "x-niu-implementation": "implemented",
///     "operationId": "getWorkspacePoolHistory",
///     "summary": "Read immutable workspace policy revisions",
///     "description": "Requires a current workspace API key with delegated pools:read. Platform supply pools, procurement prices and credentials are never exposed. Returns at most 100 revisions descending. Use next_before when present. Prior configurations remain immutable.",
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
///           "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       },
///       {
///         "name": "before",
///         "in": "query",
///         "required": false,
///         "schema": {
///           "type": "integer",
///           "minimum": 1
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Workspace-scoped result; no-store.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "$ref": "#/components/schemas/WorkspaceModelPool"
///                   }
///                 },
///                 "next_before": {
///                   "type": [
///                     "integer",
///                     "null"
///                   ]
///                 }
///               }
///             }
///           }
///         }
///       },
///       "400": {
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Missing, expired or revoked credential"
///       },
///       "403": {
///         "description": "Required delegated capability is absent"
///       },
///       "404": {
///         "description": "Scoped pool not found"
///       },
///       "409": {
///         "description": "Expected revision conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
    Query(query): Query<History>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "pools:read").await?;
    if query.before.is_some_and(|revision| revision < 1) {
        return Err(ApiError::invalid_request("Use a positive history revision"));
    }
    let rows = state
        .store
        .workspace_model_pool_history(principal.scope(), &slug, query.before)
        .await
        .map_err(ApiError::from_store)?;
    let next = (rows.len() == 100).then(|| rows.last().unwrap().revision);
    Ok(Json(json!({"data":rows,"next_before":next})))
}
/// ```openapi
/// {
///   "path": "/v1/pools/preview",
///   "method": "post",
///   "operation": {
///     "x-niu-implementation": "implemented",
///     "operationId": "previewWorkspacePool",
///     "summary": "Validate a workspace model policy without dispatch",
///     "description": "Requires delegated pools:read. Validates a proposed workspace policy without saving or dispatching inference. Optional context simulates the same rule matching, declared-protocol/capability filters and priority/weight bands used by selection. Weights describe a distribution, not a promise of the next selected model. A zero denominator means no selection. This does not validate a complete protocol input, prove live upstream access, reserve capacity, estimate charges or judge quality/value. Legacy bare configuration bodies remain accepted. Unknown context fields, unsupported protocols and out-of-bounds token traits are rejected.",
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
///         "description": "Workspace-scoped result; no-store.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "object",
///                   "properties": {
///                     "configuration_valid": {
///                       "type": "boolean"
///                     },
///                     "persisted": {
///                       "type": "boolean",
///                       "const": false
///                     },
///                     "live_model_verification": {
///                       "type": "string",
///                       "const": "not_performed"
///                     },
///                     "candidate_count": {
///                       "type": "integer"
///                     },
///                     "rule_count": {
///                       "type": "integer"
///                     },
///                     "simulation": {
///                       "type": "object",
///                       "properties": {
///                         "protocol": {
///                           "type": "string",
///                           "enum": [
///                             "chat",
///                             "responses",
///                             "messages",
///                             "embeddings",
///                             "generate_content"
///                           ]
///                         },
///                         "matched_rule": {
///                           "type": [
///                             "string",
///                             "null"
///                           ]
///                         },
///                         "outcome": {
///                           "type": "string",
///                           "enum": [
///                             "pool_disabled",
///                             "default_reject",
///                             "no_eligible_candidates",
///                             "candidates"
///                           ]
///                         },
///                         "live_dispatch": {
///                           "type": "boolean",
///                           "const": false
///                         },
///                         "candidates": {
///                           "type": "array",
///                           "items": {
///                             "type": "object",
///                             "properties": {
///                               "alias": {
///                                 "type": "string"
///                               },
///                               "priority": {
///                                 "type": "integer"
///                               },
///                               "weight": {
///                                 "type": "integer"
///                               },
///                               "eligible": {
///                                 "type": "boolean"
///                               },
///                               "exclusion_reason": {
///                                 "type": [
///                                   "string",
///                                   "null"
///                                 ]
///                               },
///                               "selection_weight": {
///                                 "type": "object",
///                                 "properties": {
///                                   "numerator": {
///                                     "type": "integer",
///                                     "minimum": 0
///                                   },
///                                   "denominator": {
///                                     "type": "integer",
///                                     "minimum": 0
///                                   }
///                                 }
///                               }
///                             }
///                           }
///                         }
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
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Missing, expired or revoked credential"
///       },
///       "403": {
///         "description": "Required delegated capability is absent"
///       },
///       "404": {
///         "description": "Scoped pool not found"
///       },
///       "409": {
///         "description": "Expected revision conflict"
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "oneOf": [
///               {
///                 "$ref": "#/components/schemas/WorkspacePoolPreviewRequest"
///               },
///               {
///                 "$ref": "#/components/schemas/WorkspaceModelPool"
///               }
///             ]
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn preview(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Json<PreviewInput>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "pools:read").await?;
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Provide a pool configuration to preview"))?;
    let (configuration, context) = match input {
        PreviewInput::Contextual(input) => (input.configuration, input.context),
        PreviewInput::Configuration(configuration) => (configuration, None),
    };
    validate_models(&state, &principal, &configuration).await?;
    let mut data = json!({"configuration_valid":true,"persisted":false,"live_model_verification":"not_performed","candidate_count":configuration.candidates.len(),"rule_count":configuration.rules.len()});
    if let Some(context) = context {
        let requirements = context.requirements(&principal)?;
        let (rule, candidates, rejected) =
            policy_candidates(&configuration, &context.protocol, &requirements);
        let models =
            crate::vendors::scoped_models(&state, principal.scope().organization_id).await?;
        let reasons: Vec<_> = candidates
            .iter()
            .map(|candidate| {
                if !configuration.enabled {
                    Some("pool_disabled")
                } else {
                    candidate_rejection(
                        candidate,
                        models.get(&candidate.alias),
                        &principal,
                        &context.protocol,
                        &requirements,
                    )
                }
            })
            .collect();
        let priority = candidates
            .iter()
            .zip(&reasons)
            .filter(|(_, reason)| reason.is_none())
            .map(|(candidate, _)| candidate.priority)
            .max();
        let total: u64 = candidates
            .iter()
            .zip(&reasons)
            .filter(|(candidate, reason)| reason.is_none() && Some(candidate.priority) == priority)
            .map(|(candidate, _)| u64::from(candidate.weight))
            .sum();
        let rows: Vec<_> = candidates.iter().zip(reasons).map(|(candidate, reason)| {
            let weight = if reason.is_none() && Some(candidate.priority) == priority { candidate.weight } else { 0 };
            json!({"alias":candidate.alias,"priority":candidate.priority,"weight":candidate.weight,"eligible":reason.is_none(),"exclusion_reason":reason,"selection_weight":{"numerator":weight,"denominator":total}})
        }).collect();
        let outcome = if !configuration.enabled {
            "pool_disabled"
        } else if rejected {
            "default_reject"
        } else if total == 0 {
            "no_eligible_candidates"
        } else {
            "candidates"
        };
        data["simulation"] = json!({"protocol":context.protocol,"matched_rule":rule.map(|rule| &rule.id),"outcome":outcome,"candidates":rows,"live_dispatch":false});
    }
    Ok(Json(json!({"data":data})))
}

pub(super) struct Selection {
    id: uuid::Uuid,
    scope: niu_storage::TenantScope,
    slug: String,
    revision: i64,
    selected_model: String,
}

/// Select before the normal inference/billing pipeline. Candidates never expand
/// the requesting key's model grants and no customer price is synthesized.
pub(super) async fn select_for_request(
    state: &AppState,
    principal: &Principal,
    public_model: &mut String,
    body: &mut Value,
    protocol: crate::guardrails::input::Protocol,
    requirements: &crate::config::ModelRequirements,
) -> Result<Option<Selection>, ApiError> {
    let Some(slug) = public_model.strip_prefix("pool/") else {
        return Ok(None);
    };
    let pool = state
        .store
        .workspace_model_pool(principal.scope(), slug)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    if !pool.enabled {
        return Err(ApiError::route_pool_unavailable());
    }
    let (_, candidates, rejected) = policy_candidates(&pool, &protocol, requirements);
    if rejected {
        return Err(ApiError::route_pool_unavailable());
    }
    let models = crate::vendors::scoped_models(state, principal.scope().organization_id).await?;
    let eligible = candidates
        .iter()
        .filter_map(|candidate| {
            candidate_rejection(
                candidate,
                models.get(&candidate.alias),
                principal,
                &protocol,
                requirements,
            )
            .is_none()
            .then_some((candidate, candidate.alias.clone()))
        })
        .collect();
    let selected_model =
        crate::vendors::select_candidate(eligible).ok_or_else(ApiError::route_pool_unavailable)?;
    let id = state
        .store
        .record_workspace_pool_selection(principal, &pool, &selected_model)
        .await
        .map_err(ApiError::from_store)?;
    *public_model = selected_model.clone();
    if let Some(model) = body.get_mut("model") {
        *model = json!(selected_model);
    }
    Ok(Some(Selection {
        id,
        scope: principal.scope(),
        slug: pool.slug,
        revision: pool.revision,
        selected_model,
    }))
}

pub(super) async fn finish_selection(
    state: &AppState,
    selection: Selection,
    result: Result<axum::response::Response, ApiError>,
) -> Result<axum::response::Response, ApiError> {
    use axum::http::HeaderValue;
    use axum::response::IntoResponse;
    let mut response = result.unwrap_or_else(IntoResponse::into_response);
    let operation = response
        .headers()
        .get("x-niu-operation-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| uuid::Uuid::parse_str(value).ok());
    let attempt = response
        .headers()
        .get("x-niu-attempt-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| uuid::Uuid::parse_str(value).ok());
    if state
        .store
        .finish_workspace_pool_selection(
            selection.scope,
            selection.id,
            operation,
            attempt,
            response.status().as_u16(),
        )
        .await
        .is_err()
    {
        // Never discard an already-executed or streaming model result because
        // linking the diagnostic reference failed. Missing evidence stays explicit.
        tracing::error!("workspace pool response evidence could not be linked");
        response.headers_mut().insert(
            "x-niu-pool-evidence",
            HeaderValue::from_static("incomplete"),
        );
    }
    response.headers_mut().insert(
        "x-niu-pool",
        HeaderValue::from_str(&selection.slug).unwrap(),
    );
    response.headers_mut().insert(
        "x-niu-pool-revision",
        HeaderValue::from_str(&selection.revision.to_string()).unwrap(),
    );
    if let Ok(value) = HeaderValue::from_str(&selection.selected_model) {
        response.headers_mut().insert("x-niu-selected-model", value);
    }
    Ok(response)
}

/// ```openapi
/// {
///   "path": "/v1/pools/{slug}/selections",
///   "method": "get",
///   "operation": {
///     "x-niu-implementation": "implemented",
///     "operationId": "getWorkspacePoolSelections",
///     "summary": "Read the latest 100 workspace pool selections",
///     "description": "Requires a current workspace API key with delegated pools:read. Platform supply pools, procurement prices and credentials are never exposed. Links selected concrete model and policy revision to operation/attempt evidence when available. Missing references remain unknown. HTTP status is not generation completion. Inspect generation diagnostics for terminal state, usage and customer charge coverage.",
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
///           "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
///           "maxLength": 80
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Workspace-scoped result; no-store.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object",
///                     "properties": {
///                       "pool_revision": {
///                         "type": "integer"
///                       },
///                       "selected_model": {
///                         "type": "string"
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "operation_id": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "uuid"
///                       },
///                       "attempt_id": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "uuid"
///                       },
///                       "response_status": {
///                         "type": [
///                           "integer",
///                           "null"
///                         ],
///                         "description": "Returned HTTP status, not terminal stream completion or task acceptance."
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
///         "description": "Invalid configuration or cursor"
///       },
///       "401": {
///         "description": "Missing, expired or revoked credential"
///       },
///       "403": {
///         "description": "Required delegated capability is absent"
///       },
///       "404": {
///         "description": "Scoped pool not found"
///       },
///       "409": {
///         "description": "Expected revision conflict"
///       }
///     }
///   }
/// }
/// ```
pub async fn selections(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
) -> Result<Json<Value>, ApiError> {
    let principal = authorize(&state, &headers, "pools:read").await?;
    let rows = state
        .store
        .workspace_pool_selections(principal.scope(), &slug)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":rows})))
}
