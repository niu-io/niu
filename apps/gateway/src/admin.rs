//! Administrator endpoints. The configured token bootstraps installation ownership;
//! durable operator sessions carry role-based access after setup.
use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use niu_execution::observation::ExecutionRecord;
use niu_storage::{AdminPermission, TenantScope};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct Name {
    name: String,
}
#[derive(Deserialize)]
pub struct KeyInput {
    name: String,
    allowed_models: Vec<String>,
    ttl_seconds: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OperatorInput {
    name: String,
    role: niu_storage::OperatorRole,
    expires_in_seconds: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OperatorSessionInput {
    expires_in_seconds: i64,
}

#[derive(Deserialize)]
pub struct QuotaWindowQuery {
    window_key: String,
}

async fn authorize(
    state: &AppState,
    headers: &HeaderMap,
    permission: AdminPermission,
) -> Result<(), ApiError> {
    state
        .authorize_admin(
            headers.get("authorization").and_then(|h| h.to_str().ok()),
            permission,
        )
        .await
}
fn validate_name(name: &str) -> Result<(), ApiError> {
    if name.trim().is_empty() || name.len() > 200 {
        return Err(ApiError::invalid_request(
            "Name must contain 1 to 200 bytes",
        ));
    }
    Ok(())
}

pub async fn default_workspace(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers, AdminPermission::Write).await?;
    let scope = state
        .store
        .default_workspace()
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({ "organization_id": scope.organization_id, "project_id": scope.project_id }),
    ))
}

pub async fn organization(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<Name>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    authorize(&state, &headers, AdminPermission::Write).await?;
    validate_name(&input.name)?;
    let id = state
        .store
        .create_organization(&input.name)
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({"id": id, "name": input.name})),
    ))
}

pub async fn project(
    State(state): State<AppState>,
    Path(organization_id): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<Name>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    authorize(&state, &headers, AdminPermission::Write).await?;
    validate_name(&input.name)?;
    let scope = state
        .store
        .create_project(organization_id, &input.name)
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        Json(
            json!({"id": scope.project_id, "organization_id": organization_id, "name": input.name}),
        ),
    ))
}

pub async fn issue_key(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<KeyInput>,
) -> Result<(StatusCode, [(String, String); 1], Json<Value>), ApiError> {
    authorize(&state, &headers, AdminPermission::Write).await?;
    if input
        .allowed_models
        .iter()
        .any(|m| !state.config.models.contains_key(m))
    {
        return Err(ApiError::invalid_request("Every granted model must exist"));
    }
    let issued = state
        .store
        .issue_key(
            TenantScope {
                organization_id,
                project_id,
            },
            &input.name,
            &input.allowed_models,
            input.ttl_seconds,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        [("cache-control".into(), "no-store".into())],
        Json(json!({"id": issued.id, "token": issued.token})),
    ))
}

pub async fn revoke_key(
    State(state): State<AppState>,
    Path((organization_id, project_id, key_id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    authorize(&state, &headers, AdminPermission::Write).await?;
    state
        .store
        .revoke_key(
            TenantScope {
                organization_id,
                project_id,
            },
            key_id,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn create_account(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<niu_storage::AccountInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    authorize(&state, &headers, AdminPermission::Write).await?;
    let id = state
        .store
        .create_account(
            TenantScope {
                organization_id,
                project_id,
            },
            &input,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({"id": id, "health": "unverified"})),
    ))
}

pub async fn accounts(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers, AdminPermission::Read).await?;
    let accounts = state
        .store
        .accounts(TenantScope {
            organization_id,
            project_id,
        })
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": accounts})))
}

pub async fn quota(
    State(state): State<AppState>,
    Path((organization_id, project_id, account)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers, AdminPermission::Read).await?;
    let windows = state
        .store
        .quota(
            TenantScope {
                organization_id,
                project_id,
            },
            account,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": windows})))
}

pub async fn account_executions(
    State(state): State<AppState>,
    Path((organization_id, project_id, account)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers, AdminPermission::Read).await?;
    let executions = state
        .store
        .executions_for_account(
            TenantScope {
                organization_id,
                project_id,
            },
            account,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": executions})))
}

/// Ingest an independently observed provider quota window. This endpoint only
/// records the sample; it never refreshes credentials or resets provider state.
pub async fn observe_quota(
    State(state): State<AppState>,
    Path((organization_id, project_id, account)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    body: Result<Json<niu_storage::QuotaInput>, axum::extract::rejection::JsonRejection>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let header = headers
        .get("authorization")
        .and_then(|value| value.to_str().ok());
    let token = header
        .and_then(|value| value.strip_prefix("Bearer "))
        .ok_or_else(ApiError::unauthorized)?;
    let Json(input) =
        body.map_err(|_| ApiError::invalid_request("Invalid quota observation JSON"))?;
    let result = if state.admin_tokens.matches(header) {
        state.store.observe_quota(scope, account, &input).await
    } else {
        match state.store.authenticate_operator(token).await {
            Ok(role) if role.permits(AdminPermission::Write) => {
                state.store.observe_quota(scope, account, &input).await
            }
            Ok(_) => return Err(ApiError::forbidden()),
            Err(_) => {
                state
                    .store
                    .observe_quota_as_collector(token, scope, account, &input)
                    .await
            }
        }
    };
    let id = result.map_err(ApiError::from_store)?;
    Ok((StatusCode::CREATED, Json(json!({"id": id}))))
}

/// Remove all imported quota samples for one account window. This does not
/// update the provider, subscription, account state, attempts or cost ledger.
pub async fn delete_quota_window(
    State(state): State<AppState>,
    Path((organization_id, project_id, account)): Path<(Uuid, Uuid, Uuid)>,
    Query(query): Query<QuotaWindowQuery>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers, AdminPermission::Write).await?;
    let deleted_count = state
        .store
        .delete_quota_window(
            TenantScope {
                organization_id,
                project_id,
            },
            account,
            &query.window_key,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({
        "window_key": query.window_key,
        "deleted_count": deleted_count,
    })))
}

pub async fn organizations(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers, AdminPermission::Read).await?;
    Ok(Json(
        json!({"data":state.store.organizations().await.map_err(ApiError::from_store)?}),
    ))
}

pub async fn operators(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers, AdminPermission::ManageOperators).await?;
    Ok(Json(
        json!({"data": state.store.operators().await.map_err(ApiError::from_store)?}),
    ))
}

pub async fn create_operator(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<OperatorInput>,
) -> Result<(StatusCode, [(String, String); 1], Json<Value>), ApiError> {
    authorize(&state, &headers, AdminPermission::ManageOperators).await?;
    let issued = state
        .store
        .create_operator(&input.name, input.role, input.expires_in_seconds)
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        [("cache-control".into(), "no-store".into())],
        Json(json!({
            "operator": {
                "id": issued.operator_id,
                "name": input.name.trim(),
                "role": input.role,
                "revoked": false
            },
            "session": issued.session,
            "token": issued.token
        })),
    ))
}

pub async fn operator_sessions(
    State(state): State<AppState>,
    Path(operator_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers, AdminPermission::ManageOperators).await?;
    Ok(Json(json!({
        "data": state.store.operator_sessions(operator_id).await.map_err(ApiError::from_store)?
    })))
}

pub async fn create_operator_session(
    State(state): State<AppState>,
    Path(operator_id): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<OperatorSessionInput>,
) -> Result<(StatusCode, [(String, String); 1], Json<Value>), ApiError> {
    authorize(&state, &headers, AdminPermission::ManageOperators).await?;
    let issued = state
        .store
        .create_operator_session(operator_id, input.expires_in_seconds)
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        [("cache-control".into(), "no-store".into())],
        Json(json!({"session": issued.session, "token": issued.token})),
    ))
}

pub async fn revoke_operator_session(
    State(state): State<AppState>,
    Path((operator_id, session_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    authorize(&state, &headers, AdminPermission::ManageOperators).await?;
    state
        .store
        .revoke_operator_session(operator_id, session_id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn revoke_operator(
    State(state): State<AppState>,
    Path(operator_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    authorize(&state, &headers, AdminPermission::ManageOperators).await?;
    state
        .store
        .revoke_operator(operator_id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn projects(
    State(state): State<AppState>,
    Path(organization): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers, AdminPermission::Read).await?;
    Ok(Json(
        json!({"data":state.store.projects(organization).await.map_err(ApiError::from_store)?}),
    ))
}

pub async fn keys(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers, AdminPermission::Read).await?;
    Ok(Json(
        json!({"data":state.store.list_keys(TenantScope { organization_id, project_id }).await.map_err(ApiError::from_store)?}),
    ))
}

pub async fn rotate_key(
    State(state): State<AppState>,
    Path((organization_id, project_id, key_id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<(StatusCode, [(String, String); 1], Json<Value>), ApiError> {
    authorize(&state, &headers, AdminPermission::Write).await?;
    let issued = state
        .store
        .rotate_key(
            TenantScope {
                organization_id,
                project_id,
            },
            key_id,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        [("cache-control".into(), "no-store".into())],
        Json(json!({"id":issued.id,"token":issued.token})),
    ))
}

/// Decimal strings preserve exact BIGINT values for JavaScript clients.
pub async fn budget(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers, AdminPermission::Read).await?;
    let budget = state
        .store
        .budget(TenantScope {
            organization_id,
            project_id,
        })
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": budget.map(|b| json!({
        "currency": b.currency,
        "limit_nanos": b.limit_nanos.to_string(),
        "reserved_nanos": b.reserved_nanos.to_string(),
        "spent_nanos": b.spent_nanos.to_string(),
        "period": "lifetime"
    }))})))
}

#[derive(Deserialize)]
pub struct CostQuery {
    after: Option<Uuid>,
    limit: Option<u16>,
}

pub async fn costs(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    axum::extract::Query(query): axum::extract::Query<CostQuery>,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers, AdminPermission::Read).await?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) {
        return Err(ApiError::invalid_request("Limit must be between 1 and 100"));
    }
    let mut entries = state
        .store
        .cost_entries(
            TenantScope {
                organization_id,
                project_id,
            },
            query.after,
            i64::from(limit) + 1,
        )
        .await
        .map_err(ApiError::from_store)?;
    let has_more = entries.len() > usize::from(limit);
    entries.truncate(usize::from(limit));
    let next_cursor = if has_more {
        entries.last().map(|e| e.attempt_id)
    } else {
        None
    };
    let data: Vec<Value> = entries.into_iter().map(cost_entry_json).collect();
    Ok(Json(json!({"data": data, "next_cursor": next_cursor})))
}

fn cost_entry_json(e: niu_storage::CostEntry) -> Value {
    json!({
        "attempt_id": e.attempt_id,
        "price_revision_id": e.price_revision_id,
        "currency": e.currency,
        "api_equivalent_nanos": e.api_equivalent_nanos.to_string(),
        "cash_nanos": e.cash_nanos.to_string(),
        "usage_prompt_tokens": e.usage_prompt_tokens.to_string(),
        "usage_completion_tokens": e.usage_completion_tokens.to_string(),
        "bound_exceeded": e.bound_exceeded
    })
}

#[derive(Deserialize)]
pub struct ExecutionImportQuery {
    after: Option<Uuid>,
    task_id: Option<String>,
    limit: Option<u16>,
}

pub async fn import_execution(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(record): Json<ExecutionRecord>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    authorize(&state, &headers, AdminPermission::Write).await?;
    let receipt = state
        .store
        .import_execution(
            TenantScope {
                organization_id,
                project_id,
            },
            &record,
        )
        .await
        .map_err(ApiError::from_store)?;
    let status = if receipt.created {
        StatusCode::CREATED
    } else {
        StatusCode::OK
    };
    Ok((
        status,
        Json(json!({"id": receipt.id, "created": receipt.created})),
    ))
}

pub async fn execution_imports(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Query(query): Query<ExecutionImportQuery>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    authorize(&state, &headers, AdminPermission::Read).await?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) {
        return Err(ApiError::invalid_request("Limit must be between 1 and 100"));
    }
    let mut entries = state
        .store
        .execution_imports(
            TenantScope {
                organization_id,
                project_id,
            },
            query.after,
            query.task_id.as_deref(),
            i64::from(limit) + 1,
        )
        .await
        .map_err(ApiError::from_store)?;
    let has_more = entries.len() > usize::from(limit);
    entries.truncate(usize::from(limit));
    let next_cursor = has_more
        .then(|| entries.last().map(|entry| entry.id))
        .flatten();
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"data": entries, "next_cursor": next_cursor})),
    ))
}

pub async fn execution_cohort(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers, AdminPermission::Read).await?;
    let report = state
        .store
        .execution_cohort(TenantScope {
            organization_id,
            project_id,
        })
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": report})))
}

pub async fn execution_import(
    State(state): State<AppState>,
    Path((organization_id, project_id, execution_id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    authorize(&state, &headers, AdminPermission::Read).await?;
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let record = state
        .store
        .execution_import(scope, execution_id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let linked_accounts = state
        .store
        .execution_account_links(scope, &record)
        .await
        .map_err(ApiError::from_store)?;
    let charges = state
        .store
        .execution_charges(scope, &record)
        .await
        .map_err(ApiError::from_store)?;
    let entries: Vec<Value> = charges.entries.into_iter().map(cost_entry_json).collect();
    Ok((
        [("cache-control", "no-store")],
        Json(json!({
            "id": execution_id,
            "record": &record,
            "data": &record,
            "linked_accounts": linked_accounts,
            "charges": {
                "entries": entries,
                "unresolved": charges.unresolved,
                "attribution": "imported_reference",
                "task_total_complete": false
            }
        })),
    ))
}

pub async fn delete_execution_import(
    State(state): State<AppState>,
    Path((organization_id, project_id, execution_id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    authorize(&state, &headers, AdminPermission::Write).await?;
    let deleted = state
        .store
        .delete_execution_import(
            TenantScope {
                organization_id,
                project_id,
            },
            execution_id,
        )
        .await
        .map_err(ApiError::from_store)?;
    if !deleted {
        return Err(ApiError::not_found());
    }
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct BudgetInput {
    currency: String,
    limit_nanos: String,
}

pub async fn create_budget(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<BudgetInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    authorize(&state, &headers, AdminPermission::Write).await?;
    // No float, exponent, signed or whitespace-coerced financial inputs.
    if input.limit_nanos.is_empty() || !input.limit_nanos.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ApiError::invalid_request(
            "limit_nanos must be a nonnegative decimal integer string",
        ));
    }
    let limit = input.limit_nanos.parse::<i64>().map_err(|_| {
        ApiError::invalid_request("limit_nanos exceeds the supported integer range")
    })?;
    state
        .store
        .create_budget(
            TenantScope {
                organization_id,
                project_id,
            },
            &input.currency,
            limit,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({"data": {
            "currency": input.currency, "limit_nanos": limit.to_string(),
            "reserved_nanos": "0", "spent_nanos": "0", "period": "lifetime"
        }})),
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CollectorKeyInput {
    name: String,
    ttl_seconds: i64,
}

pub async fn issue_collector_key(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<CollectorKeyInput>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    authorize(&state, &headers, AdminPermission::Write).await?;
    let issued = state
        .store
        .issue_collector_key(
            TenantScope {
                organization_id,
                project_id,
            },
            &input.name,
            input.ttl_seconds,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"id": issued.id, "token": issued.token})),
    ))
}

pub async fn revoke_collector_key(
    State(state): State<AppState>,
    Path((organization_id, project_id, id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    authorize(&state, &headers, AdminPermission::Write).await?;
    state
        .store
        .revoke_collector_key(
            TenantScope {
                organization_id,
                project_id,
            },
            id,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

/// Analyze an already-collected paired dataset. This endpoint is stateless and
/// never dispatches inference or writes imported traces or cost entries.
pub async fn compare_benchmark(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(dataset): Json<niu_benchmark::PairedExperiment>,
) -> Result<Json<Value>, ApiError> {
    authorize(&state, &headers, AdminPermission::Read).await?;
    let report = dataset.evaluate().map_err(|_| {
        ApiError::invalid_request("Invalid paired benchmark dataset or incomplete cost evidence")
    })?;
    Ok(Json(json!({ "data": report })))
}
