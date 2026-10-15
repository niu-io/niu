//! Platform-only configuration reads, never customer billing projections.
use super::{ApiError, AppState, HeaderMap, Json, Path, Query, State, TenantScope, Uuid, Value};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TargetPage {
    after: Option<Uuid>,
    limit: Option<i64>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TariffPage {
    after: Option<String>,
    limit: Option<i64>,
}

/// ```openapi
/// {
///   "path": "/api/v1/pricing/targets",
///   "method": "get",
///   "operation": {
///     "operationId": "listPlatformPricingTargets",
///     "summary": "Discover named platform pricing targets",
///     "description": "Explicit platform administration required; ordinary company/workspace roles do not grant access. Configuration only, without usage, balances, statements, content, credentials or procurement. Keyset order is workspace UUID ascending for targets, model alias ascending for tariffs. Pass next_after unchanged as after; null means complete. Limit defaults to 50, maximum 100. Each page is one database snapshot; concurrent inserts before the cursor require refreshing the first page. Missing cursor returns 409. Identifiers are API references, never display labels. Cache-Control no-store. Tariff token rates are exact nanounits per million tokens; minimum and request fees are exact currency nanounits. Empty valid workspace returns an empty page.",
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
///         "schema": {
///           "type": "string",
///           "format": "uuid"
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
///         "description": "Configuration page",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "next_after"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "organization_id",
///                       "workspace_id",
///                       "organization_name",
///                       "workspace_name"
///                     ],
///                     "properties": {
///                       "organization_id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "workspace_id": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "organization_name": {
///                         "type": "string"
///                       },
///                       "workspace_name": {
///                         "type": "string"
///                       }
///                     }
///                   }
///                 },
///                 "next_after": {
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
///         "description": "Invalid query"
///       },
///       "401": {
///         "description": "Invalid management credential"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Cursor absent from selected directory"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       }
///     }
///   }
/// }
/// ```
pub async fn targets(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(page): Query<TargetPage>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .pricing_targets(page.after, page.limit.unwrap_or(50))
        .await
        .map_err(ApiError::from_store)?;
    Ok(([("cache-control", "no-store")], Json(data)))
}

/// ```openapi
/// {
///   "path": "/api/v1/pricing/organizations/{organization}/workspaces/{project}/tariffs",
///   "method": "get",
///   "operation": {
///     "operationId": "listPlatformCustomerTariffs",
///     "summary": "Page current customer selling tariffs",
///     "description": "Explicit platform administration required; ordinary company/workspace roles do not grant access. Configuration only, without usage, balances, statements, content, credentials or procurement. Keyset order is workspace UUID ascending for targets, model alias ascending for tariffs. Pass next_after unchanged as after; null means complete. Limit defaults to 50, maximum 100. Each page is one database snapshot; concurrent inserts before the cursor require refreshing the first page. Missing cursor returns 409. Identifiers are API references, never display labels. Cache-Control no-store. Tariff token rates are exact nanounits per million tokens; minimum and request fees are exact currency nanounits. Empty valid workspace returns an empty page.",
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
///         "schema": {
///           "type": "string"
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
///       },
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
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Configuration page",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "data",
///                 "next_after"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "type": "object",
///                     "required": [
///                       "model_alias",
///                       "revision",
///                       "currency",
///                       "created_at",
///                       "prompt_rate",
///                       "completion_rate",
///                       "minimum_charge_nanos",
///                       "request_fee_nanos",
///                       "cached_prompt_rate",
///                       "reasoning_completion_rate",
///                       "cache_write_prompt_rate",
///                       "context_tiers"
///                     ],
///                     "properties": {
///                       "model_alias": {
///                         "type": "string"
///                       },
///                       "revision": {
///                         "type": "string",
///                         "format": "uuid"
///                       },
///                       "currency": {
///                         "type": "string"
///                       },
///                       "created_at": {
///                         "type": "string",
///                         "format": "date-time"
///                       },
///                       "prompt_rate": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "completion_rate": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "minimum_charge_nanos": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "request_fee_nanos": {
///                         "type": "string",
///                         "pattern": "^[0-9]+$"
///                       },
///                       "cached_prompt_rate": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^[0-9]+$"
///                       },
///                       "reasoning_completion_rate": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^[0-9]+$",
///                         "description": "Reported reasoning output is a subset of total completion tokens. A configured rate prices that subset separately; missing quantity remains unresolved."
///                       },
///                       "cache_write_prompt_rate": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "pattern": "^[0-9]+$",
///                         "description": "Reported cache-write input is a disjoint subset of aggregate input. A configured rate prices it separately; missing quantity remains unresolved."
///                       },
///                       "context_tiers": {
///                         "type": "array",
///                         "maxItems": 32,
///                         "items": {
///                           "type": "object",
///                           "additionalProperties": false,
///                           "required": [
///                             "minimum_input_tokens",
///                             "prompt_rate",
///                             "completion_rate"
///                           ],
///                           "properties": {
///                             "minimum_input_tokens": {
///                               "type": "string",
///                               "pattern": "^[0-9]+$",
///                               "description": "Positive inclusive aggregate input threshold, at most 9223372036854775807."
///                             },
///                             "prompt_rate": {
///                               "type": "string",
///                               "pattern": "^[0-9]+$",
///                               "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                             },
///                             "completion_rate": {
///                               "type": "string",
///                               "pattern": "^[0-9]+$",
///                               "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                             },
///                             "cached_prompt_rate": {
///                               "type": [
///                                 "string",
///                                 "null"
///                               ],
///                               "pattern": "^[0-9]+$",
///                               "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                             },
///                             "cache_write_prompt_rate": {
///                               "type": [
///                                 "string",
///                                 "null"
///                               ],
///                               "pattern": "^[0-9]+$",
///                               "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                             },
///                             "reasoning_completion_rate": {
///                               "type": [
///                                 "string",
///                                 "null"
///                               ],
///                               "pattern": "^[0-9]+$",
///                               "description": "Integer currency nanounits per million tokens, at most 1000000000000000."
///                             }
///                           }
///                         },
///                         "description": "Complete whole-request schedules; highest inclusive input threshold wins. Null category rates do not inherit the base schedule. Empty array clears tiers; omitting existing tiers conflicts."
///                       },
///                       "discount_baseline_revision": {
///                         "type": [
///                           "string",
///                           "null"
///                         ],
///                         "format": "uuid",
///                         "description": "Original selling-price revision for an explicit discount. API reference only; never a UI label. Resulting rates, currency, category presence and context thresholds are checked against the original. Existing requests retain their pinned revision."
///                       }
///                     }
///                   }
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
///         "description": "Invalid query"
///       },
///       "401": {
///         "description": "Invalid management credential"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Cursor absent from selected directory"
///       },
///       "503": {
///         "description": "Storage unavailable"
///       },
///       "404": {
///         "description": "Company/workspace pair does not exist"
///       }
///     }
///   }
/// }
/// ```
pub async fn tariffs(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    Query(page): Query<TariffPage>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let data = state
        .store
        .platform_customer_tariffs(
            TenantScope {
                organization_id,
                project_id,
            },
            page.after.as_deref(),
            page.limit.unwrap_or(50),
        )
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(([("cache-control", "no-store")], Json(data)))
}

/// ```openapi
/// {
///   "path": "/api/v1/pricing/models",
///   "method": "get",
///   "operation": {
///     "operationId": "listPlatformPricingModels",
///     "summary": "List models eligible for customer tariff publication",
///     "description": "Explicit platform administration required. Uses the same shared catalog as customer tariff publication, excluding personal owner-funded and unavailable aliases. This is a current eligibility read, not a price, supply qualification or dispatch guarantee. Publication rechecks eligibility. Sorted by model alias; limit defaults to 50, maximum 100. Pass next_after unchanged; null means complete. An unavailable cursor returns 409: restart pagination. No credentials, upstream mappings or procurement prices. Cache-Control no-store.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "after",
///         "in": "query",
///         "schema": {
///           "type": "string",
///           "maxLength": 200
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
///         "description": "Current eligible alias page",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "additionalProperties": false,
///               "required": [
///                 "data",
///                 "next_after"
///               ],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "maxItems": 100,
///                   "items": {
///                     "type": "object",
///                     "additionalProperties": false,
///                     "required": [
///                       "model_alias"
///                     ],
///                     "properties": {
///                       "model_alias": {
///                         "type": "string"
///                       }
///                     }
///                   }
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
///         "description": "Invalid page size or alias cursor"
///       },
///       "401": {
///         "description": "Authentication required"
///       },
///       "403": {
///         "description": "Platform administration required"
///       },
///       "409": {
///         "description": "Cursor no longer eligible; restart pagination"
///       }
///     }
///   }
/// }
/// ```
pub async fn models(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(page): Query<TariffPage>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    state.authorize_platform_headers(&headers).await?;
    let limit = page.limit.unwrap_or(50);
    if !(1..=100).contains(&limit)
        || page
            .after
            .as_ref()
            .is_some_and(|alias| alias.is_empty() || alias.len() > 200)
    {
        return Err(ApiError::invalid_request(
            "Choose a page size from 1 to 100 and a valid model cursor",
        ));
    }
    let models = crate::vendors::effective_models(&state).await?;
    if page
        .after
        .as_ref()
        .is_some_and(|alias| !models.contains_key(alias))
    {
        return Err(ApiError::from_store(niu_storage::StoreError::Conflict));
    }
    let mut aliases: Vec<_> = models
        .into_keys()
        .filter(|alias| page.after.as_ref().is_none_or(|after| alias > after))
        .take(limit as usize + 1)
        .collect();
    let next_after = if aliases.len() > limit as usize {
        aliases.pop();
        aliases.last().cloned()
    } else {
        None
    };
    let data: Vec<_> = aliases
        .into_iter()
        .map(|alias| serde_json::json!({"model_alias":alias}))
        .collect();
    Ok((
        [("cache-control", "no-store")],
        Json(serde_json::json!({"data":data,"next_after":next_after})),
    ))
}
