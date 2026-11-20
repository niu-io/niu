//! Workspace model policies. Never forwards platform pool administration or audit.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State, rejection::JsonRejection},
    http::{HeaderMap, StatusCode},
};
use niu_storage::{Principal, RoutePoolCandidate, WorkspaceModelPool, WorkspaceRoutingMode};
use serde::Deserialize;
use serde_json::{Value, json};

use super::management::authorize;
use super::routing_prices;
async fn validate_models(
    state: &AppState,
    principal: &Principal,
    pool: &WorkspaceModelPool,
) -> Result<(), ApiError> {
    if pool.strategy.validate().is_err() {
        return Err(ApiError::invalid_request(
            "Use strategy version 1 priority/weight or customer-price, or version 2 Auto with declared paths, a comparable decider currency and bounded decision limits",
        ));
    }
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
    if let Some(decider) = pool.strategy.auto().and_then(|auto| auto.decider.as_ref()) {
        let decider_model = models.get(&decider.model).ok_or_else(|| {
            ApiError::invalid_request("The Auto decider model must be a visible workspace model")
        })?;
        if !principal.allows_model(&decider.model)
            || !crate::vendors::supports_protocol(
                decider_model,
                &crate::guardrails::input::Protocol::Chat,
            )
        {
            return Err(ApiError::invalid_request(
                "The Auto decider model must be an authorized Chat model for the saving key",
            ));
        }
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
pub enum PreviewInput {
    Contextual(PreviewProposal),
    Configuration(WorkspaceModelPool),
}
// Deserialize through a Value first. Serde's generic untagged buffering can
// reject otherwise-valid version 2 Auto payloads; explicit variant attempts
// keep contextual preview and the legacy bare-configuration form both working
// without changing either closed schema.
impl<'de> Deserialize<'de> for PreviewInput {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = Value::deserialize(deserializer)?;
        if let Ok(contextual) = serde_json::from_value::<PreviewProposal>(value.clone()) {
            return Ok(Self::Contextual(contextual));
        }
        serde_json::from_value::<WorkspaceModelPool>(value)
            .map(Self::Configuration)
            .map_err(serde::de::Error::custom)
    }
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
    task: Option<String>,
    stage: Option<String>,
}
impl PreviewContext {
    /// Optional caller task context for Auto previews. It uses the same
    /// bounded normalization and closed schema as the routing request header.
    fn auto_context(&self) -> Result<Option<niu_storage::AutoTaskContext>, ApiError> {
        if self.task.is_none() && self.stage.is_none() {
            return Ok(None);
        }
        niu_storage::AutoTaskContext {
            task: self.task.clone(),
            stage: self.stage.clone(),
        }
        .normalized()
        .map(Some)
        .map_err(|_| {
            ApiError::invalid_request("Use bounded lowercase task and stage routing context values")
        })
    }

    pub(crate) fn requirements(
        &self,
        project_id: Option<uuid::Uuid>,
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
        let traits = self.traits();
        // Preview must reject the same protocol/trait combinations that dispatch
        // rejects instead of routing a hypothetical request the adapter cannot
        // express.
        crate::routing_traits::require_supported(self.protocol, &traits)?;
        Ok(traits.requirements(project_id, self.protocol))
    }

    fn traits(&self) -> crate::routing_traits::RequestTraits {
        crate::routing_traits::RequestTraits {
            streaming: self.streaming,
            vision: self.vision,
            tools: self.tools,
            structured_output: self.structured_output,
            reasoning: self.reasoning,
            embedding_dimensions: self.embedding_dimensions,
            embedding_base64: self.embedding_base64,
            estimated_input_tokens: self.estimated_input_tokens,
            requested_output_tokens: self.requested_output_tokens,
        }
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
///   "path": "/v1/routing",
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
///         },
///         "strategy": {
///           "type": "object",
///           "additionalProperties": false,
///           "description": "Versioned selection strategy. Omitted legacy configurations use version 1 priority/weight. Version 1 supports priority/weight and customer price. Version 2 requires Auto with 2-8 declared response-compatible paths and an optional bounded decider. Auto evaluates caller routing context first and invokes the decider only when no context path matches. The decider may return only a declared, request-compatible path; unknown or incompatible decisions are failures, never silent substitutions. Missing or incomparable customer prices stay unknown and are never treated as free. Provider procurement rates never participate.",
///           "required": [
///             "version",
///             "mode"
///           ],
///           "properties": {
///             "version": {
///               "type": "integer",
///               "enum": [
///                 1,
///                 2
///               ]
///             },
///             "mode": {
///               "type": "string",
///               "enum": [
///                 "priority_weight",
///                 "customer_price",
///                 "auto"
///               ]
///             },
///             "customer_price": {
///               "type": "object",
///               "additionalProperties": false,
///               "description": "Required exactly when version is 1 and mode is customer_price. Estimates an ordinary request in one explicit currency and unit. Estimates include the selected whole-request context tier, the request fee and the minimum charge; cached and reasoning discounts are never assumed. Ties use higher priority, then higher weight, then alias order.",
///               "required": [
///                 "currency",
///                 "unit",
///                 "input_tokens",
///                 "output_tokens"
///               ],
///               "properties": {
///                 "currency": {
///                   "type": "string",
///                   "pattern": "^[A-Z]{3}$"
///                 },
///                 "unit": {
///                   "type": "string",
///                   "enum": [
///                     "nanounits_per_million_tokens"
///                   ]
///                 },
///                 "input_tokens": {
///                   "type": "integer",
///                   "minimum": 1,
///                   "maximum": 10000000
///                 },
///                 "output_tokens": {
///                   "type": "integer",
///                   "minimum": 0,
///                   "maximum": 10000000
///                 }
///               }
///             },
///             "auto": {
///               "type": "object",
///               "additionalProperties": false,
///               "description": "Required exactly when version is 2 and mode is auto. Paths reference top-level candidate aliases so Auto cannot expand the saved model inventory or the caller's grants. Caller context (task/stage) is evaluated before any decider call. The optional decider runs once, with the caller's key, grants and spending authority, under the declared timeout, token and customer-charge bounds. If the decider abstains, fails, times out, is cancelled or returns an unknown or response-incompatible path, the configured action either falls back to deterministic priority/weight or rejects the request before dispatch.",
///               "required": [
///                 "paths"
///               ],
///               "properties": {
///                 "paths": {
///                   "type": "array",
///                   "minItems": 2,
///                   "maxItems": 8,
///                   "items": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "id",
///                       "response_type",
///                       "candidates"
///                     ],
///                     "properties": {
///                       "id": {
///                         "type": "string",
///                         "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$",
///                         "maxLength": 64
///                       },
///                       "name": {
///                         "type": "string",
///                         "minLength": 1,
///                         "maxLength": 120
///                       },
///                       "description": {
///                         "type": "string",
///                         "minLength": 1,
///                         "maxLength": 280
///                       },
///                       "response_type": {
///                         "type": "string",
///                         "enum": [
///                           "text",
///                           "structured",
///                           "embedding"
///                         ]
///                       },
///                       "candidates": {
///                         "type": "array",
///                         "minItems": 1,
///                         "maxItems": 64,
///                         "items": {
///                           "type": "string",
///                           "minLength": 1,
///                           "maxLength": 200
///                         }
///                       },
///                       "task": {
///                         "type": "array",
///                         "maxItems": 16,
///                         "items": {
///                           "type": "string",
///                           "pattern": "^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$",
///                           "maxLength": 64
///                         }
///                       },
///                       "stage": {
///                         "type": "array",
///                         "maxItems": 16,
///                         "items": {
///                           "type": "string",
///                           "pattern": "^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$",
///                           "maxLength": 64
///                         }
///                       }
///                     }
///                   }
///                 },
///                 "decider": {
///                   "type": "object",
///                   "additionalProperties": false,
///                   "description": "Optional single-round semantic decider. The model must be a visible Chat model granted to the invoking key and have a comparable customer selling price in the declared currency and unit; otherwise no paid call is made and the configured failure action applies. max_calls is fixed at one. max_input_tokens bounds the constructed decision prompt by a character estimate, not exact tokenization. max_output_tokens bounds the decision completion. max_spend_nanos is a customer-charge ceiling verified from the current customer price before the call and from reported usage afterwards. A missing, foreign-currency or non-nanounit customer price leaves the bound unverifiable and prevents the call.",
///                   "required": [
///                     "model",
///                     "currency",
///                     "timeout_ms",
///                     "max_calls",
///                     "max_input_tokens",
///                     "max_output_tokens",
///                     "max_spend_nanos",
///                     "min_confidence"
///                   ],
///                   "properties": {
///                     "model": {
///                       "type": "string",
///                       "minLength": 1,
///                       "maxLength": 200
///                     },
///                     "currency": {
///                       "type": "string",
///                       "pattern": "^[A-Z]{3}$"
///                     },
///                     "timeout_ms": {
///                       "type": "integer",
///                       "minimum": 50,
///                       "maximum": 5000
///                     },
///                     "max_calls": {
///                       "type": "integer",
///                       "minimum": 1,
///                       "maximum": 1
///                     },
///                     "max_input_tokens": {
///                       "type": "integer",
///                       "minimum": 1,
///                       "maximum": 4096
///                     },
///                     "max_output_tokens": {
///                       "type": "integer",
///                       "minimum": 1,
///                       "maximum": 1024
///                     },
///                     "max_spend_nanos": {
///                       "type": "integer",
///                       "minimum": 1,
///                       "maximum": 100000000
///                     },
///                     "min_confidence": {
///                       "type": "number",
///                       "minimum": 0,
///                       "maximum": 1
///                     },
///                     "on_abstain": {
///                       "type": "string",
///                       "enum": [
///                         "fallback",
///                         "reject"
///                       ]
///                     },
///                     "on_failure": {
///                       "type": "string",
///                       "enum": [
///                         "fallback",
///                         "reject"
///                       ]
///                     }
///                   }
///                 }
///               }
///             }
///           }
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
///             },
///             "task": {
///               "type": "string",
///               "pattern": "^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$",
///               "maxLength": 64,
///               "description": "Optional caller task context for Auto preview. It uses the same bounded normalization as x-niu-routing-context. Preview never invokes the decider."
///             },
///             "stage": {
///               "type": "string",
///               "pattern": "^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$",
///               "maxLength": 64,
///               "description": "Optional caller workflow-stage context for Auto preview."
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
    let next = has_more
        .then(|| rows.last())
        .flatten()
        .map(|row| row.slug.clone());
    Ok(Json(
        json!({"data":rows,"has_more":has_more,"next_after":next}),
    ))
}
/// ```openapi
/// {
///   "path": "/v1/routing/{slug}",
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
///   "path": "/v1/routing/{slug}",
///   "method": "put",
///   "operation": {
///     "x-niu-implementation": "implemented",
///     "operationId": "setWorkspacePool",
///     "summary": "Create or replace a workspace model policy",
///     "description": "Requires a current workspace API key with delegated pools:write. Platform supply pools, procurement prices and credentials are never exposed. Use revision zero to create, otherwise the current expected revision. Conflicts require read/reconcile; no automatic replay. Candidate aliases must be allowed by the key and visible in the workspace. The optional versioned strategy must be version 1 priority/weight or customer-price, or version 2 Auto. Version 1 customer-price mode requires explicit currency, unit, input-token and output-token assumptions. Version 2 Auto requires 2-8 declared response-compatible paths that reference top-level candidates, and an optional decider with an explicit customer currency, timeout, single-call, token and customer-charge bounds. The decider model must be a visible Chat model authorized for the saving key. Auto paths never add model grants. This operation does not invoke a model or resolve prices. Read back the saved revision. Restore a prior configuration using the current expected revision.",
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
#[derive(Deserialize)]
pub struct DeletePoolQuery {
    pub revision: i64,
}

/// Soft-delete a customer custom model. The named slug and immutable history
/// remain reserved so historical selections stay resolvable.
pub async fn remove(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(slug): Path<String>,
    Query(query): Query<DeletePoolQuery>,
) -> Result<StatusCode, ApiError> {
    let principal = authorize(&state, &headers, "pools:write").await?;
    state
        .store
        .delete_workspace_model_pool(&principal, &slug, query.revision)
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

/// ```openapi
/// {
///   "path": "/v1/routing/{slug}/history",
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
    let next = (rows.len() == 100)
        .then(|| rows.last())
        .flatten()
        .map(|row| row.revision);
    Ok(Json(json!({"data":rows,"next_before":next})))
}
/// ```openapi
/// {
///   "path": "/v1/routing/preview",
///   "method": "post",
///   "operation": {
///     "x-niu-implementation": "implemented",
///     "operationId": "previewWorkspacePool",
///     "summary": "Validate a workspace model policy without dispatch",
///     "description": "Requires delegated pools:read. Validates a proposed workspace policy without saving or dispatching inference. Optional context simulates the same rule matching, declared-protocol/capability filters, versioned strategy and priority/weight bands used by selection. Context traits are normalized with the same protocol support matrix used by dispatch: image inputs, tools, structured output and reasoning controls that the selected protocol cannot express are rejected explicitly instead of being silently dropped. In customer-price mode, only eligible candidates with a comparable customer selling price are ranked; missing or incomparable prices stay explicitly unknown and are never treated as free. The evaluation uses the strategy's explicit currency, unit, input-token and output-token assumptions and includes the selected whole-request context tier, request fee and minimum charge. Selection is deterministic: lower estimate, then higher priority, then higher weight, then alias order. When no candidate has a comparable price, selection falls back to priority/weight and reports why. In Auto mode, preview evaluates optional task/stage caller context against response-compatible paths without invoking the decider. It reports whether runtime would select from context, require the bounded decider, fall back or reject, plus the decider grant, comparable-price and input-bound checks. Preview calls are always zero and never dispatch inference or incur a decision charge. Weights describe a distribution, not a promise of the next selected model. A zero denominator means no selection. Provider procurement prices, offers and margins are never read. This does not validate a complete protocol input, prove live upstream access, reserve capacity, estimate actual charges or judge quality/value. Legacy bare configuration bodies remain accepted. Unknown context fields, unsupported protocols and out-of-bounds token traits are rejected.",
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
///                     "strategy": {
///                       "type": "object"
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
///                         "strategy": {
///                           "type": "object"
///                         },
///                         "selection_basis": {
///                           "type": "string",
///                           "enum": [
///                             "not_evaluated",
///                             "priority_weight",
///                             "priority_weight_fallback",
///                             "customer_price",
///                             "auto_context",
///                             "auto_decider_required",
///                             "auto_rejected"
///                           ]
///                         },
///                         "selected_path": {
///                           "type": [
///                             "string",
///                             "null"
///                           ],
///                           "description": "Auto path selected deterministically from caller context. Null when the runtime would require the decider, fall back or reject."
///                         },
///                         "selected_candidate": {
///                           "type": [
///                             "string",
///                             "null"
///                           ]
///                         },
///                         "fallback_reason": {
///                           "type": [
///                             "string",
///                             "null"
///                           ]
///                         },
///                         "price_evaluation": {
///                           "type": [
///                             "object",
///                             "null"
///                           ]
///                         },
///                         "decision": {
///                           "type": [
///                             "object",
///                             "null"
///                           ],
///                           "description": "Bounded Auto decision evidence from preview. Preview reports calls as zero and live_dispatch as false because it never invokes the decider."
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
///                               },
///                               "estimated_customer_charge_nanos": {
///                                 "type": [
///                                   "string",
///                                   "null"
///                                 ]
///                               },
///                               "price_unknown_reason": {
///                                 "type": [
///                                   "string",
///                                   "null"
///                                 ]
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
    let mut data = json!({"configuration_valid":true,"persisted":false,"live_model_verification":"not_performed","candidate_count":configuration.candidates.len(),"rule_count":configuration.rules.len(),"strategy":configuration.strategy});
    if let Some(context) = context {
        let requirements = context.requirements(Some(principal.scope().project_id))?;
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

        // Preview and runtime share the same eligibility, context and price
        // evaluation. Preview never invokes a decider and never dispatches
        // inference.
        let mut selection_basis = if !configuration.enabled || rejected || total == 0 {
            "not_evaluated"
        } else if matches!(
            configuration.strategy.mode,
            WorkspaceRoutingMode::CustomerPrice | WorkspaceRoutingMode::Auto
        ) {
            "priority_weight_fallback"
        } else {
            "priority_weight"
        };
        let mut selected_candidate: Option<String> = None;
        let mut selected_path: Option<String> = None;
        let mut fallback_reason: Option<&'static str> = None;
        let mut price_evaluation = Value::Null;
        let mut decision_evidence = Value::Null;
        let mut price_by_alias: std::collections::BTreeMap<
            String,
            (Option<i64>, Option<&'static str>),
        > = std::collections::BTreeMap::new();
        let mut auto_path_aliases: Option<Vec<String>> = None;
        let mut auto_path_priority: Option<i32> = None;
        let mut auto_path_total = 0_u64;
        if configuration.enabled && !rejected && total > 0 {
            match configuration.strategy.mode {
                WorkspaceRoutingMode::CustomerPrice => {
                    let price_strategy =
                        configuration.strategy.customer_price().ok_or_else(|| {
                            ApiError::invalid_request(
                                "Customer-price strategy requires currency and request-size assumptions",
                            )
                        })?;
                    let eligible_candidates: Vec<RoutePoolCandidate> = candidates
                        .iter()
                        .zip(&reasons)
                        .filter(|(_, reason)| reason.is_none())
                        .map(|(candidate, _)| (*candidate).clone())
                        .collect();
                    if !eligible_candidates.is_empty() {
                        let prices = routing_prices::load_workspace_customer_prices(
                            &state,
                            principal.scope(),
                        )
                        .await?;
                        let evaluation =
                            routing_prices::evaluate(price_strategy, &prices, &eligible_candidates);
                        if let Some(alias) = &evaluation.selected_alias {
                            selection_basis = "customer_price";
                            selected_candidate = Some(alias.clone());
                        }
                        fallback_reason = evaluation.fallback_reason.map(|reason| reason.as_str());
                        for entry in &evaluation.candidates {
                            price_by_alias.insert(
                                entry.alias.clone(),
                                (
                                    entry.estimated_charge_nanos,
                                    entry.unknown_reason.map(|reason| reason.as_str()),
                                ),
                            );
                        }
                        price_evaluation = json!({
                            "source": "customer_selling_price",
                            "billing_mode": prices.billing_mode,
                            "currency": price_strategy.currency,
                            "unit": price_strategy.unit.as_str(),
                            "input_tokens": price_strategy.input_tokens,
                            "output_tokens": price_strategy.output_tokens,
                            "basis": selection_basis,
                            "fallback_reason": fallback_reason,
                            "selected_candidate": evaluation.selected_alias,
                            "candidates": evaluation.candidates.iter().map(|candidate| json!({
                                "alias": candidate.alias,
                                "estimated_customer_charge_nanos": candidate.estimated_charge_nanos.map(|value| value.to_string()),
                                "price_unknown_reason": candidate.unknown_reason.map(|reason| reason.as_str()),
                            })).collect::<Vec<_>>(),
                        });
                    }
                }
                WorkspaceRoutingMode::Auto => {
                    let auto = configuration.strategy.auto().ok_or_else(|| {
                        ApiError::invalid_request(
                            "Auto strategy requires declared paths and bounded decider policy",
                        )
                    })?;
                    let eligible_aliases: std::collections::BTreeSet<String> = candidates
                        .iter()
                        .zip(&reasons)
                        .filter(|(_, reason)| reason.is_none())
                        .map(|(candidate, _)| candidate.alias.clone())
                        .collect();
                    let preview = Box::pin(crate::web::routing_auto::preview(
                        &state,
                        &principal,
                        auto,
                        context.protocol,
                        &requirements,
                        &eligible_aliases,
                        context.auto_context()?.as_ref(),
                    ))
                    .await?;
                    selection_basis = preview.selection_basis;
                    selected_path = preview.selected_path;
                    fallback_reason = preview.fallback_reason;
                    decision_evidence = preview.evidence;
                    if let Some(path_id) = &selected_path
                        && let Some(path) = auto.path(path_id)
                    {
                        auto_path_aliases = Some(path.candidates.clone());
                        auto_path_priority = candidates
                            .iter()
                            .zip(&reasons)
                            .filter(|(candidate, reason)| {
                                reason.is_none() && path.candidates.contains(&candidate.alias)
                            })
                            .map(|(candidate, _)| candidate.priority)
                            .max();
                        auto_path_total = candidates
                            .iter()
                            .zip(&reasons)
                            .filter(|(candidate, reason)| {
                                reason.is_none()
                                    && path.candidates.contains(&candidate.alias)
                                    && Some(candidate.priority) == auto_path_priority
                            })
                            .map(|(candidate, _)| u64::from(candidate.weight))
                            .sum();
                    }
                }
                WorkspaceRoutingMode::PriorityWeight => {}
            }
        }

        let rows: Vec<_> = candidates.iter().zip(reasons).map(|(candidate, reason)| {
            let (weight, denominator) = if selection_basis == "customer_price" {
                (
                    u32::from(
                        reason.is_none()
                            && selected_candidate.as_deref() == Some(candidate.alias.as_str()),
                    ),
                    1,
                )
            } else if selection_basis == "auto_context" {
                let in_path = auto_path_aliases
                    .as_ref()
                    .is_some_and(|aliases| aliases.contains(&candidate.alias));
                if reason.is_none()
                    && in_path
                    && Some(candidate.priority) == auto_path_priority
                {
                    (candidate.weight, auto_path_total)
                } else {
                    (0, auto_path_total)
                }
            } else if matches!(
                selection_basis,
                "auto_decider_required" | "auto_rejected"
            ) {
                (0, 0)
            } else if reason.is_none() && Some(candidate.priority) == priority {
                (candidate.weight, total)
            } else {
                (0, total)
            };
            let (estimated_customer_charge_nanos, price_unknown_reason) = price_by_alias
                .get(&candidate.alias)
                .copied()
                .unwrap_or((None, None));
            json!({"alias":candidate.alias,"priority":candidate.priority,"weight":candidate.weight,"eligible":reason.is_none(),"exclusion_reason":reason,"selection_weight":{"numerator":weight,"denominator":denominator},"estimated_customer_charge_nanos":estimated_customer_charge_nanos.map(|value| value.to_string()),"price_unknown_reason":price_unknown_reason})
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
        data["simulation"] = json!({"protocol":context.protocol,"matched_rule":rule.map(|rule| &rule.id),"outcome":outcome,"strategy":configuration.strategy,"selection_basis":selection_basis,"selected_path":selected_path,"selected_candidate":selected_candidate,"fallback_reason":fallback_reason,"price_evaluation":price_evaluation,"decision":decision_evidence,"candidates":rows,"live_dispatch":false});
    }
    Ok(Json(json!({"data":data})))
}

pub(super) struct Selection {
    id: uuid::Uuid,
    scope: niu_storage::TenantScope,
    slug: String,
    revision: i64,
    selected_model: String,
    decision: Option<Value>,
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
    headers: &HeaderMap,
) -> Result<Option<Selection>, ApiError> {
    let Some(slug) = public_model.strip_prefix("pool/") else {
        return Ok(None);
    };
    // Validate caller routing context even for non-Auto policies. An ignored
    // malformed header would let a caller believe context was applied when it
    // was not.
    let routing_context = crate::web::routing_auto::task_context(headers)?;
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
    let eligible: Vec<(&RoutePoolCandidate, String)> = candidates
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
    let eligible_aliases: std::collections::BTreeSet<String> =
        eligible.iter().map(|(_, alias)| alias.clone()).collect();
    let mut decision_evidence = None;
    let selected_model = match pool.strategy.mode {
        WorkspaceRoutingMode::Auto => {
            let auto = pool.strategy.auto().ok_or_else(ApiError::unavailable)?;
            let decision = Box::pin(crate::web::routing_auto::decide_with_context(
                state,
                principal,
                auto,
                protocol,
                requirements,
                &eligible_aliases,
                routing_context.as_ref(),
                None,
            ))
            .await?;
            let selected = match decision.outcome {
                niu_storage::AutoDecisionOutcome::Cancelled => {
                    return Err(ApiError::unavailable());
                }
                niu_storage::AutoDecisionOutcome::Rejected => {
                    return Err(ApiError::routing_decision_rejected());
                }
                niu_storage::AutoDecisionOutcome::ContextMatch
                | niu_storage::AutoDecisionOutcome::DeciderSelected => {
                    let path_id = decision
                        .selected_path
                        .as_deref()
                        .ok_or_else(ApiError::unavailable)?;
                    let path = auto.path(path_id).ok_or_else(ApiError::unavailable)?;
                    let path_eligible: Vec<(&RoutePoolCandidate, String)> = eligible
                        .iter()
                        .filter(|(candidate, _)| path.candidates.contains(&candidate.alias))
                        .map(|(candidate, alias)| (*candidate, alias.clone()))
                        .collect();
                    crate::vendors::select_candidate(path_eligible)
                        .ok_or_else(ApiError::route_pool_unavailable)?
                }
                niu_storage::AutoDecisionOutcome::PriorityWeightFallback => {
                    // Deterministic fallback over the same eligible candidates.
                    // An unknown or failed decision never silently changes the
                    // request's response type or expands model grants.
                    crate::vendors::select_candidate(eligible.clone())
                        .ok_or_else(ApiError::route_pool_unavailable)?
                }
            };
            decision_evidence = Some(decision.evidence());
            selected
        }
        WorkspaceRoutingMode::CustomerPrice => {
            let price_strategy = pool
                .strategy
                .customer_price()
                .ok_or_else(ApiError::unavailable)?;
            let prices =
                routing_prices::load_workspace_customer_prices(state, principal.scope()).await?;
            let eligible_candidates: Vec<RoutePoolCandidate> = eligible
                .iter()
                .map(|(candidate, _)| (*candidate).clone())
                .collect();
            let evaluation =
                routing_prices::evaluate(price_strategy, &prices, &eligible_candidates);
            if let Some(alias) = evaluation.selected_alias {
                alias
            } else {
                // No candidate has a comparable customer selling price. Preserve
                // the existing deterministic priority/weight fallback instead of
                // treating an unknown price as free or failing the request.
                crate::vendors::select_candidate(eligible)
                    .ok_or_else(ApiError::route_pool_unavailable)?
            }
        }
        WorkspaceRoutingMode::PriorityWeight => crate::vendors::select_candidate(eligible)
            .ok_or_else(ApiError::route_pool_unavailable)?,
    };
    let id = state
        .store
        .record_workspace_pool_selection(
            principal,
            &pool,
            &selected_model,
            decision_evidence.as_ref(),
        )
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
        decision: decision_evidence,
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
    if let Ok(value) = HeaderValue::from_str(&selection.slug) {
        response.headers_mut().insert("x-niu-pool", value);
    }
    if let Ok(value) = HeaderValue::from_str(&selection.revision.to_string()) {
        response.headers_mut().insert("x-niu-pool-revision", value);
    }
    if let Ok(value) = HeaderValue::from_str(&selection.selected_model) {
        response.headers_mut().insert("x-niu-selected-model", value);
    }
    if let Some(decision) = &selection.decision {
        insert_decision_headers(response.headers_mut(), decision);
    }
    Ok(response)
}

/// Expose bounded Auto decision overhead on the customer response. These are
/// observability fields only; they never change the response body or extend
/// the selected model's authority. Internal references and prompts are absent.
fn insert_decision_headers(headers: &mut axum::http::HeaderMap, decision: &Value) {
    use axum::http::HeaderValue;
    let insert = |headers: &mut axum::http::HeaderMap, name: &'static str, value: String| {
        if let Ok(value) = HeaderValue::from_str(&value) {
            headers.insert(name, value);
        }
    };
    if let Some(outcome) = decision["outcome"].as_str() {
        insert(headers, "x-niu-routing-decision", outcome.to_owned());
        let path = decision["path"].as_str().unwrap_or("fallback");
        insert(headers, "x-niu-routing-path", path.to_owned());
    }
    if let Some(calls) = decision["calls"].as_u64() {
        insert(headers, "x-niu-routing-decision-calls", calls.to_string());
    }
    if let Some(latency) = decision["latency_ms"].as_u64() {
        insert(
            headers,
            "x-niu-routing-decision-latency-ms",
            latency.to_string(),
        );
    }
    for (field, name) in [
        ("input_tokens", "x-niu-routing-decision-input-tokens"),
        ("output_tokens", "x-niu-routing-decision-output-tokens"),
    ] {
        if let Some(tokens) = decision[field].as_u64() {
            insert(headers, name, tokens.to_string());
        }
    }
    if let Some(charge) = decision["estimated_customer_charge_nanos"].as_str() {
        insert(
            headers,
            "x-niu-routing-decision-charge-nanos",
            charge.to_owned(),
        );
    }
    if let Some(reason) = decision["failure"]
        .as_str()
        .or_else(|| decision["fallback_reason"].as_str())
    {
        insert(headers, "x-niu-routing-decision-reason", reason.to_owned());
    }
}

/// ```openapi
/// {
///   "path": "/v1/routing/{slug}/selections",
///   "method": "get",
///   "operation": {
///     "x-niu-implementation": "implemented",
///     "operationId": "getWorkspacePoolSelections",
///     "summary": "Read the latest 100 workspace pool selections",
///     "description": "Requires a current workspace API key with delegated pools:read. Platform supply pools, procurement prices and credentials are never exposed. Links selected concrete model and policy revision to operation/attempt evidence when available. Auto selections include bounded decision outcome, path, fallback reason, failure, calls, tokens, latency and estimated customer decision charge when available; missing references remain unknown. HTTP status is not generation completion. Inspect generation diagnostics for terminal state, usage and customer charge coverage.",
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
///                       },
///                       "reference": {
///                         "type": [
///                           "string",
///                           "null"
///                         ]
///                       },
///                       "decision": {
///                         "type": [
///                           "object",
///                           "null"
///                         ],
///                         "description": "Bounded Auto decision outcome, path, fallback or failure reason, calls, tokens, latency and estimated customer decision charge. Null for non-Auto selections. No prompts, content, Provider identifiers or procurement prices."
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
