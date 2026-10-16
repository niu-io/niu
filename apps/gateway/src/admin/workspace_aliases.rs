//! Workspace-ID compatibility aliases; legacy organization/workspace routes remain supported.
use super::{
    AdminPermission, ApiError, AppState, HeaderMap, Json, Name, Path, State, StatusCode, Uuid,
    Value,
};
use crate::state::AdminAuthorization;

/// Authenticate before resolving a workspace and restrict the lookup to member scope.
pub(crate) async fn authorize_workspace(
    state: &AppState,
    headers: &HeaderMap,
    workspace: Uuid,
    permission: AdminPermission,
) -> Result<(AdminAuthorization, niu_storage::TenantScope), ApiError> {
    let authorization = super::authorize(state, headers, permission).await?;
    let organization = match authorization {
        AdminAuthorization::Installation => None,
        AdminAuthorization::Operator(member) => {
            if member.scope.project_id.is_some_and(|id| id != workspace) {
                return Err(ApiError::not_found());
            }
            if permission == AdminPermission::ManageOperators && member.scope.project_id.is_some() {
                return Err(ApiError::forbidden());
            }
            Some(member.scope.organization_id)
        }
    };
    let organization_id = state
        .store
        .workspace_organization_id(organization, workspace)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok((
        authorization,
        niu_storage::TenantScope {
            organization_id,
            project_id: workspace,
        },
    ))
}

async fn organization_for_workspace(
    state: &AppState,
    headers: &HeaderMap,
    workspace: Uuid,
    permission: AdminPermission,
) -> Result<Uuid, ApiError> {
    let (_, scope) = authorize_workspace(state, headers, workspace, permission).await?;
    Ok(scope.organization_id)
}

/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}",
///   "method": "patch",
///   "operation": {
///     "operationId": "renameWorkspaceById",
///     "summary": "Rename a workspace by identity",
///     "description": "Compatibility alias for the existing organization/workspace endpoint, which remains supported. Authorization is checked before resolving the stored workspace organization; member scope filters the lookup and foreign or missing workspaces return 404. The existing handler rechecks authorization before mutation. Requires scoped workspace write access. Trims the saved name; no optimistic revision is accepted. Response matches the legacy rename endpoint. Unknown body properties retain legacy parser behavior.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "400": {
///         "description": "Invalid identifier or name."
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "403": {
///         "description": "Required management permission is missing."
///       },
///       "404": {
///         "description": "Workspace missing or outside authorized scope."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       },
///       "200": {
///         "description": "Saved workspace identity and trimmed name.",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": [
///                 "id",
///                 "name"
///               ],
///               "properties": {
///                 "id": {
///                   "type": "string",
///                   "format": "uuid"
///                 },
///                 "name": {
///                   "type": "string"
///                 }
///               }
///             }
///           }
///         }
///       },
///       "422": {
///         "description": "Invalid JSON body shape."
///       },
///       "415": {
///         "description": "JSON content type required."
///       }
///     },
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": {
///             "type": "object",
///             "required": [
///               "name"
///             ],
///             "properties": {
///               "name": {
///                 "type": "string",
///                 "description": "Must contain non-whitespace text and be at most 200 UTF-8 bytes before trimming."
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn rename(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(workspace): Path<Uuid>,
    input: Json<Name>,
) -> Result<Json<Value>, ApiError> {
    let organization =
        organization_for_workspace(&state, &headers, workspace, AdminPermission::Write).await?;
    super::rename_workspace(
        State(state),
        headers,
        Path((organization, workspace)),
        input,
    )
    .await
}

/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}",
///   "method": "delete",
///   "operation": {
///     "operationId": "deleteWorkspaceById",
///     "summary": "Delete an empty workspace by identity",
///     "description": "Compatibility alias for the existing organization/workspace endpoint, which remains supported. Authorization is checked before resolving the stored workspace organization; member scope filters the lookup and foreign or missing workspaces return 404. The existing handler rechecks authorization before mutation. Requires installation authority or company-level owner/member-management permission. Workspace-scoped owners are refused with 403 before lookup for their own scope; another workspace remains concealed with 404. Dependent business records prevent deletion with 409; no business history cascade is requested. Response is the same empty 204 as the legacy endpoint.",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "x-niu-implementation": "implemented",
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       }
///     ],
///     "responses": {
///       "400": {
///         "description": "Invalid identifier."
///       },
///       "401": {
///         "description": "Authentication required."
///       },
///       "403": {
///         "description": "Required management permission is missing."
///       },
///       "404": {
///         "description": "Workspace missing or outside authorized scope."
///       },
///       "503": {
///         "description": "Storage unavailable."
///       },
///       "204": {
///         "description": "Workspace deleted; empty response body."
///       },
///       "409": {
///         "description": "Workspace retains dependent business records."
///       }
///     }
///   }
/// }
/// ```
pub async fn delete(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(workspace): Path<Uuid>,
) -> Result<StatusCode, ApiError> {
    let organization = organization_for_workspace(
        &state,
        &headers,
        workspace,
        AdminPermission::ManageOperators,
    )
    .await?;
    super::delete_workspace(State(state), headers, Path((organization, workspace))).await
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InitialSpendingLimitInput {
    pub currency: String,
    pub limit_nanos: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UnifiedKeyCreateInput {
    pub name: String,
    #[serde(default = "super::all_model_aliases")]
    pub allowed_models: Vec<String>,
    #[serde(deserialize_with = "super::required_key_lifetime")]
    pub ttl_seconds: Option<i64>,
    #[serde(default)]
    pub spending_limit: Option<InitialSpendingLimitInput>,
    #[serde(default)]
    pub requests_per_minute: Option<i64>,
    #[serde(default)]
    pub tokens_per_minute: Option<i64>,
    #[serde(default)]
    pub max_concurrent_requests: Option<i64>,
    #[serde(default)]
    pub allowed_cidrs: Option<Vec<String>>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateSpendingLimitInput {
    pub currency: String,
    pub limit_nanos: Option<String>,
    #[serde(default)]
    pub expected_revision: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateRateLimitInput {
    pub requests_per_minute: Option<i64>,
    #[serde(default)]
    pub expected_revision: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateTokenRateLimitInput {
    pub tokens_per_minute: Option<i64>,
    #[serde(default)]
    pub expected_revision: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateConcurrencyLimitInput {
    pub max_concurrent_requests: Option<i64>,
    #[serde(default)]
    pub expected_revision: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateIpPolicyInput {
    pub allowed_cidrs: Option<Vec<String>>,
    #[serde(default)]
    pub expected_revision: Option<String>,
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UnifiedKeyUpdateInput {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub allowed_models: Option<Vec<String>>,
    #[serde(default)]
    pub expected_revision: Option<i64>,
    #[serde(default)]
    pub spending_limit: Option<UpdateSpendingLimitInput>,
    #[serde(default)]
    pub request_rate_limit: Option<UpdateRateLimitInput>,
    #[serde(default)]
    pub token_rate_limit: Option<UpdateTokenRateLimitInput>,
    #[serde(default)]
    pub concurrency_limit: Option<UpdateConcurrencyLimitInput>,
    #[serde(default)]
    pub ip_policy: Option<UpdateIpPolicyInput>,
}

fn parse_nonnegative_decimal(value: &str) -> Result<i64, ApiError> {
    if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ApiError::invalid_request(
            "Use nonnegative decimal integer strings",
        ));
    }
    value
        .parse()
        .map_err(|_| ApiError::invalid_request("Amount or revision exceeds the supported range"))
}

fn validate_currency(value: &str) -> Result<(), ApiError> {
    if value.len() != 3 || !value.bytes().all(|b| b.is_ascii_uppercase()) {
        return Err(ApiError::invalid_request(
            "A three-letter uppercase account currency is required",
        ));
    }
    Ok(())
}

fn require_owner_for_policy(auth: AdminAuthorization) -> Result<(), ApiError> {
    if matches!(
        auth,
        AdminAuthorization::Operator(ref operator)
            if operator.role != niu_storage::OperatorRole::Owner
    ) {
        return Err(ApiError::forbidden());
    }
    Ok(())
}

/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/keys",
///   "method": "get",
///   "operation": {
///     "operationId": "listWorkspaceKeys",
///     "summary": "List workspace API keys with aggregated limits and policies",
///     "description": "Returns workspace API keys along with their current spending limits, request/token rate limits, concurrency limits, IP allowlist policy, and 60-second usage window in a single response.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": {
///           "type": "string",
///           "format": "uuid"
///         }
///       },
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
///           "maximum": 100
///         }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Workspace keys with aggregated limits and policies",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": ["data"],
///               "properties": {
///                 "data": {
///                   "type": "array",
///                   "items": {
///                     "type": "object"
///                   }
///                 },
///                 "next_cursor": {
///                   "type": ["string", "null"],
///                   "format": "uuid"
///                 }
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn list_keys(
    State(state): State<AppState>,
    Path(workspace): Path<Uuid>,
    headers: HeaderMap,
    axum::extract::Query(query): axum::extract::Query<super::KeyListQuery>,
) -> Result<Json<Value>, ApiError> {
    let (_, scope) =
        authorize_workspace(&state, &headers, workspace, AdminPermission::Read).await?;
    if query.limit.is_some() || query.after.is_some() {
        let limit = query.limit.unwrap_or(50);
        if !(1..=100).contains(&limit) {
            return Err(ApiError::invalid_request(
                "Key page limit must be between 1 and 100",
            ));
        }
        let (data, next_cursor) = state
            .store
            .key_detail_directory_page(scope, query.after, limit)
            .await
            .map_err(ApiError::from_store)?;
        return Ok(Json(
            serde_json::json!({"data": data, "next_cursor": next_cursor}),
        ));
    }
    let data = state
        .store
        .list_key_details(scope)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(serde_json::json!({"data": data})))
}

/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/keys",
///   "method": "post",
///   "operation": {
///     "operationId": "createWorkspaceKey",
///     "summary": "Create a workspace API key with optional initial limits and policies",
///     "description": "Issues a new workspace API key and optionally configures initial spending limits, RPM/TPM/concurrency limits, and IP allowlist CIDRs in a single call. Explicit allowed_cidrs: [] denies every source; null or omission leaves sources unrestricted. Matches the independent IP policy endpoint.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
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
///             "required": ["name", "ttl_seconds"],
///             "properties": {
///               "name": { "type": "string" },
///               "allowed_models": {
///                 "type": "array",
///                 "items": { "type": "string" }
///               },
///               "ttl_seconds": { "type": ["integer", "null"] },
///               "spending_limit": {
///                 "type": ["object", "null"],
///                 "required": ["currency", "limit_nanos"],
///                 "properties": {
///                   "currency": { "type": "string" },
///                   "limit_nanos": { "type": ["string", "null"] }
///                 }
///               },
///               "requests_per_minute": { "type": ["integer", "null"] },
///               "tokens_per_minute": { "type": ["integer", "null"] },
///               "max_concurrent_requests": { "type": ["integer", "null"] },
///               "allowed_cidrs": {
///                 "type": ["array", "null"],
///                 "description": "Empty array denies every source; null or omission leaves sources unrestricted.",
///                 "items": { "type": "string" }
///               }
///             }
///           }
///         }
///       }
///     },
///     "responses": {
///       "201": {
///         "description": "Issued key identity, one-time secret, and full key detail",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": ["id", "token", "key"],
///               "properties": {
///                 "id": { "type": "string", "format": "uuid" },
///                 "token": { "type": "string" },
///                 "key": { "type": "object" }
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn create_key(
    State(state): State<AppState>,
    Path(workspace): Path<Uuid>,
    headers: HeaderMap,
    input: Result<Json<UnifiedKeyCreateInput>, axum::extract::rejection::JsonRejection>,
) -> Result<(StatusCode, [(String, String); 1], Json<Value>), ApiError> {
    let (auth, scope) =
        authorize_workspace(&state, &headers, workspace, AdminPermission::Write).await?;
    let Json(input) = input
        .map_err(|_| ApiError::invalid_request("Invalid workspace API key creation payload"))?;
    let has_policies = input.spending_limit.is_some()
        || input.requests_per_minute.is_some()
        || input.tokens_per_minute.is_some()
        || input.max_concurrent_requests.is_some()
        || input.allowed_cidrs.is_some();
    if has_policies {
        require_owner_for_policy(auth)?;
    }
    let spending_limit = if let Some(spending) = input.spending_limit {
        validate_currency(&spending.currency)?;
        let amount = spending
            .limit_nanos
            .as_deref()
            .map(parse_nonnegative_decimal)
            .transpose()?;
        Some(niu_storage::KeySpendingLimitUpdate {
            currency: spending.currency,
            amount,
            expected_revision: 0,
        })
    } else {
        None
    };
    let mut models = crate::vendors::scoped_models(&state, scope.organization_id).await?;
    models.extend(crate::codex::private_models(&state, scope).await?);
    let all_models = input.allowed_models.len() == 1 && input.allowed_models[0] == "*";
    if (!all_models && input.allowed_models.iter().any(|m| !models.contains_key(m)))
        || (input.allowed_models.iter().any(|model| model == "*") && !all_models)
    {
        return Err(ApiError::invalid_request("Every granted model must exist"));
    }
    let actor = super::audit_actor(auth);
    let policies = niu_storage::UnifiedKeyPoliciesInput {
        spending_limit,
        request_rate_limit: input.requests_per_minute.map(|rpm| (Some(rpm), 0)),
        token_rate_limit: input.tokens_per_minute.map(|tpm| (Some(tpm), 0)),
        concurrency_limit: input.max_concurrent_requests.map(|conc| (Some(conc), 0)),
        ip_policy: input.allowed_cidrs.map(|cidrs| (Some(cidrs), 0)),
    };
    let issued = state
        .store
        .issue_key_with_policies(
            scope,
            &input.name,
            &input.allowed_models,
            input.ttl_seconds,
            policies,
            actor,
        )
        .await
        .map_err(ApiError::from_store)?;
    let detail = state
        .store
        .key_detail(scope, issued.id)
        .await
        .map_err(ApiError::from_store)?
        .unwrap_or(Value::Null);
    Ok((
        StatusCode::CREATED,
        [("cache-control".into(), "no-store".into())],
        Json(serde_json::json!({
            "id": issued.id,
            "token": issued.token,
            "key": detail,
        })),
    ))
}

/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/keys/{key}",
///   "method": "get",
///   "operation": {
///     "operationId": "getWorkspaceKey",
///     "summary": "Retrieve a workspace API key with its policies and usage window",
///     "description": "Returns metadata, spending limits, RPM/TPM/concurrency limits, IP allowlist policy, and 60-second usage window for a single workspace API key.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": { "type": "string", "format": "uuid" }
///       },
///       {
///         "name": "key",
///         "in": "path",
///         "required": true,
///         "schema": { "type": "string", "format": "uuid" }
///       }
///     ],
///     "responses": {
///       "200": {
///         "description": "Workspace API key detail",
///         "content": {
///           "application/json": {
///             "schema": { "type": "object" }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn get_key(
    State(state): State<AppState>,
    Path((workspace, key)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let (_, scope) =
        authorize_workspace(&state, &headers, workspace, AdminPermission::Read).await?;
    let detail = state
        .store
        .key_detail(scope, key)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(detail))
}

/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/keys/{key}",
///   "method": "patch",
///   "operation": {
///     "operationId": "updateWorkspaceKey",
///     "summary": "Update workspace API key metadata and policies",
///     "description": "Updates key name, model grants, spending limit, RPM/TPM/concurrency limits, and IP allowlist policy in a single request and returns the updated key detail. Omitting ip_policy leaves it unchanged. Within ip_policy, explicit allowed_cidrs: [] denies every source and null permits any source, matching the independent IP policy endpoint. Existing saved policies are not reinterpreted.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": { "type": "string", "format": "uuid" }
///       },
///       {
///         "name": "key",
///         "in": "path",
///         "required": true,
///         "schema": { "type": "string", "format": "uuid" }
///       }
///     ],
///     "requestBody": {
///       "required": true,
///       "content": {
///         "application/json": {
///           "schema": { "type": "object" }
///         }
///       }
///     },
///     "responses": {
///       "200": {
///         "description": "Updated workspace API key detail",
///         "content": {
///           "application/json": {
///             "schema": { "type": "object" }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn update_key(
    State(state): State<AppState>,
    Path((workspace, key)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<UnifiedKeyUpdateInput>,
) -> Result<Json<Value>, ApiError> {
    let (auth, scope) =
        authorize_workspace(&state, &headers, workspace, AdminPermission::Write).await?;
    let current = state
        .store
        .key_detail(scope, key)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;

    let has_policies = input.spending_limit.is_some()
        || input.request_rate_limit.is_some()
        || input.token_rate_limit.is_some()
        || input.concurrency_limit.is_some()
        || input.ip_policy.is_some();
    if has_policies {
        require_owner_for_policy(auth)?;
    }
    let actor = super::audit_actor(auth);

    let metadata_inputs = if input.name.is_some() || input.allowed_models.is_some() {
        let name = input
            .name
            .as_deref()
            .or_else(|| current.get("name").and_then(Value::as_str))
            .ok_or_else(|| ApiError::invalid_request("Key name is required"))?
            .to_owned();
        let allowed_models: Vec<String> = match input.allowed_models {
            Some(models) => models,
            None => current
                .get("allowed_models")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(str::to_owned))
                        .collect()
                })
                .unwrap_or_else(super::all_model_aliases),
        };
        let expected_revision = input
            .expected_revision
            .or_else(|| current.get("revision").and_then(Value::as_i64))
            .unwrap_or(1);
        let mut models = crate::vendors::scoped_models(&state, scope.organization_id).await?;
        models.extend(crate::codex::private_models(&state, scope).await?);
        let all_models = allowed_models.len() == 1 && allowed_models[0] == "*";
        if (!all_models && allowed_models.iter().any(|m| !models.contains_key(m)))
            || (allowed_models.iter().any(|m| m == "*") && !all_models)
        {
            return Err(ApiError::invalid_request("Every granted model must exist"));
        }
        let actor_label = match auth {
            AdminAuthorization::Installation => "installation".to_owned(),
            AdminAuthorization::Operator(operator) => format!("operator:{}", operator.id),
        };
        Some((name, allowed_models, expected_revision, actor_label))
    } else {
        None
    };

    let spending_limit = if let Some(spending) = input.spending_limit {
        validate_currency(&spending.currency)?;
        let amount = spending
            .limit_nanos
            .as_deref()
            .map(parse_nonnegative_decimal)
            .transpose()?;
        let expected = match spending.expected_revision {
            Some(ref rev) => parse_nonnegative_decimal(rev)?,
            None => current
                .get("spending_limits")
                .and_then(Value::as_array)
                .and_then(|arr| {
                    arr.iter().find(|item| {
                        item.get("currency").and_then(Value::as_str)
                            == Some(spending.currency.as_str())
                    })
                })
                .and_then(|item| item.get("revision").and_then(Value::as_str))
                .and_then(|rev| rev.parse::<i64>().ok())
                .unwrap_or(0),
        };
        Some(niu_storage::KeySpendingLimitUpdate {
            currency: spending.currency,
            amount,
            expected_revision: expected,
        })
    } else {
        None
    };
    let request_rate_limit = if let Some(rate) = input.request_rate_limit {
        let expected = match rate.expected_revision {
            Some(ref rev) => parse_nonnegative_decimal(rev)?,
            None => current
                .pointer("/request_rate_limit/revision")
                .and_then(Value::as_str)
                .and_then(|rev| rev.parse::<i64>().ok())
                .unwrap_or(0),
        };
        Some((rate.requests_per_minute, expected))
    } else {
        None
    };
    let token_rate_limit = if let Some(token_rate) = input.token_rate_limit {
        let expected = match token_rate.expected_revision {
            Some(ref rev) => parse_nonnegative_decimal(rev)?,
            None => current
                .pointer("/token_rate_limit/revision")
                .and_then(Value::as_str)
                .and_then(|rev| rev.parse::<i64>().ok())
                .unwrap_or(0),
        };
        Some((token_rate.tokens_per_minute, expected))
    } else {
        None
    };
    let concurrency_limit = if let Some(conc) = input.concurrency_limit {
        let expected = match conc.expected_revision {
            Some(ref rev) => parse_nonnegative_decimal(rev)?,
            None => current
                .pointer("/concurrency_limit/revision")
                .and_then(Value::as_str)
                .and_then(|rev| rev.parse::<i64>().ok())
                .unwrap_or(0),
        };
        Some((conc.max_concurrent_requests, expected))
    } else {
        None
    };
    let ip_policy = if let Some(ip) = input.ip_policy {
        let expected = match ip.expected_revision {
            Some(ref rev) => parse_nonnegative_decimal(rev)?,
            None => current
                .pointer("/ip_policy/revision")
                .and_then(Value::as_str)
                .and_then(|rev| rev.parse::<i64>().ok())
                .unwrap_or(0),
        };
        Some((ip.allowed_cidrs, expected))
    } else {
        None
    };

    let metadata =
        metadata_inputs
            .as_ref()
            .map(|(name, allowed_models, expected_revision, actor_label)| {
                niu_storage::KeyMetadataUpdate {
                    name,
                    models: allowed_models,
                    expected_revision: *expected_revision,
                    actor: actor_label,
                }
            });
    let policies = niu_storage::UnifiedKeyPoliciesInput {
        spending_limit,
        request_rate_limit,
        token_rate_limit,
        concurrency_limit,
        ip_policy,
    };
    state
        .store
        .update_key_with_policies(scope, key, metadata, policies, actor)
        .await
        .map_err(ApiError::from_store)?;

    let updated = state
        .store
        .key_detail(scope, key)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(updated))
}

/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/keys/{key}",
///   "method": "delete",
///   "operation": {
///     "operationId": "revokeWorkspaceKey",
///     "summary": "Revoke a workspace API key",
///     "description": "Idempotently revokes a workspace API key within the authorized workspace scope.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": { "type": "string", "format": "uuid" }
///       },
///       {
///         "name": "key",
///         "in": "path",
///         "required": true,
///         "schema": { "type": "string", "format": "uuid" }
///       }
///     ],
///     "responses": {
///       "204": {
///         "description": "Key revoked"
///       }
///     }
///   }
/// }
/// ```
pub async fn revoke_key(
    State(state): State<AppState>,
    Path((workspace, key)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let (_, scope) =
        authorize_workspace(&state, &headers, workspace, AdminPermission::Write).await?;
    state
        .store
        .revoke_key(scope, key)
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

/// ```openapi
/// {
///   "path": "/api/v1/workspaces/{workspace}/keys/{key}/rotate",
///   "method": "post",
///   "operation": {
///     "operationId": "rotateWorkspaceKey",
///     "summary": "Rotate a workspace API key while preserving its policies and expiry",
///     "description": "Atomically revokes the existing key and issues a replacement key sharing the same model grants, expiration, and policy lineage.",
///     "x-niu-implementation": "implemented",
///     "security": [
///       {
///         "bearerAuth": []
///       }
///     ],
///     "parameters": [
///       {
///         "name": "workspace",
///         "in": "path",
///         "required": true,
///         "schema": { "type": "string", "format": "uuid" }
///       },
///       {
///         "name": "key",
///         "in": "path",
///         "required": true,
///         "schema": { "type": "string", "format": "uuid" }
///       }
///     ],
///     "responses": {
///       "201": {
///         "description": "Replacement key identity, one-time secret, and full key detail",
///         "content": {
///           "application/json": {
///             "schema": {
///               "type": "object",
///               "required": ["id", "token", "key"],
///               "properties": {
///                 "id": { "type": "string", "format": "uuid" },
///                 "token": { "type": "string" },
///                 "key": { "type": "object" }
///               }
///             }
///           }
///         }
///       }
///     }
///   }
/// }
/// ```
pub async fn rotate_key(
    State(state): State<AppState>,
    Path((workspace, key)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<(StatusCode, [(String, String); 1], Json<Value>), ApiError> {
    let (_, scope) =
        authorize_workspace(&state, &headers, workspace, AdminPermission::Write).await?;
    let issued = state
        .store
        .rotate_key(scope, key)
        .await
        .map_err(ApiError::from_store)?;
    let detail = state
        .store
        .key_detail(scope, issued.id)
        .await
        .map_err(ApiError::from_store)?
        .unwrap_or(Value::Null);
    Ok((
        StatusCode::CREATED,
        [("cache-control".into(), "no-store".into())],
        Json(serde_json::json!({
            "id": issued.id,
            "token": issued.token,
            "key": detail,
        })),
    ))
}
