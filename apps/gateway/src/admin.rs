//! Administrator endpoints. The configured token bootstraps installation ownership;
//! durable operator sessions carry role-based access after setup.
pub mod asset_requests;
pub mod chat_sessions;
pub mod guardrails;
pub mod key_ip;
pub mod key_spending;
mod operator_audit;
pub mod passwords;
pub mod preferences;
pub mod profile;
pub mod request_exports;
pub mod request_payloads;
mod session;
pub mod workspace_spending;
pub use operator_audit::operator_events;
pub use session::current_session;

use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use niu_storage::{AdminPermission, OperatorAuditActor, OperatorScope, TenantScope};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct Name {
    name: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OrganizationInput {
    name: String,
    #[serde(default = "default_billing_currency")]
    currency: String,
}

fn default_billing_currency() -> String {
    "USD".to_owned()
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct WorkspaceInput {
    name: String,
    organization_id: Option<Uuid>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct KeyInput {
    name: String,
    #[serde(default = "all_model_aliases")]
    allowed_models: Vec<String>,
    ttl_seconds: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct KeyMetadataInput {
    name: String,
    allowed_models: Vec<String>,
    expected_revision: i64,
}

fn all_model_aliases() -> Vec<String> {
    vec!["*".to_owned()]
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OperatorInput {
    organization_id: Uuid,
    project_id: Option<Uuid>,
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
) -> Result<crate::state::AdminAuthorization, ApiError> {
    state.authorize_admin_headers(headers, permission).await
}

fn audit_actor(authorization: crate::state::AdminAuthorization) -> OperatorAuditActor {
    match authorization {
        crate::state::AdminAuthorization::Installation => OperatorAuditActor::Installation,
        crate::state::AdminAuthorization::Operator(operator) => {
            OperatorAuditActor::Operator(operator.id)
        }
    }
}

async fn authorize_project(
    state: &AppState,
    headers: &HeaderMap,
    permission: AdminPermission,
    organization_id: Uuid,
    project_id: Uuid,
) -> Result<crate::state::AdminAuthorization, ApiError> {
    let authorization = authorize(state, headers, permission).await?;
    if authorization.permits_project(TenantScope {
        organization_id,
        project_id,
    }) {
        Ok(authorization)
    } else {
        Err(ApiError::not_found())
    }
}

// Wholesale costs are platform records, never customer or supplier entitlements.
async fn authorize_platform(state: &AppState, headers: &HeaderMap) -> Result<(), ApiError> {
    if !authorize(state, headers, AdminPermission::Read)
        .await?
        .can_manage_platform()
    {
        return Err(ApiError::forbidden());
    }
    Ok(())
}

async fn authorize_operator_management(
    state: &AppState,
    headers: &HeaderMap,
    operator_id: Uuid,
) -> Result<crate::state::AdminAuthorization, ApiError> {
    let authorization = authorize(state, headers, AdminPermission::ManageOperators).await?;
    if authorization.is_installation() {
        return Ok(authorization);
    }
    let operator = state
        .store
        .operator(operator_id)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    let Some(organization_id) = operator.organization_id else {
        return Err(ApiError::not_found());
    };
    let scope = OperatorScope {
        organization_id,
        project_id: operator.project_id,
    };
    if authorization.permits_operator_scope(scope) {
        Ok(authorization)
    } else {
        Err(ApiError::not_found())
    }
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
    if !authorize(&state, &headers, AdminPermission::Write)
        .await?
        .is_installation()
    {
        return Err(ApiError::forbidden());
    }
    let scope = state
        .store
        .default_prepaid_workspace()
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({ "organization_id": scope.organization_id, "project_id": scope.project_id }),
    ))
}

pub async fn workspaces(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let authorization = authorize(&state, &headers, AdminPermission::Read).await?;
    let (organization_id, project_id) = match authorization {
        crate::state::AdminAuthorization::Installation => (None, None),
        crate::state::AdminAuthorization::Operator(operator) => (
            Some(operator.scope.organization_id),
            operator.scope.project_id,
        ),
    };
    let workspaces = state
        .store
        .workspaces(organization_id, project_id)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": workspaces})))
}

pub async fn rename_workspace(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    Json(input): Json<Name>,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
    validate_name(&input.name)?;
    if !state
        .store
        .rename_workspace(
            TenantScope {
                organization_id,
                project_id,
            },
            &input.name,
        )
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({"id":project_id,"name":input.name.trim()})))
}

pub async fn delete_workspace(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, ApiError> {
    let authorization = authorize_project(
        &state,
        &headers,
        AdminPermission::ManageOperators,
        organization_id,
        project_id,
    )
    .await?;
    if let crate::state::AdminAuthorization::Operator(operator) = authorization
        && operator.scope.project_id.is_some()
    {
        return Err(ApiError::forbidden());
    }
    if !state
        .store
        .delete_empty_workspace(TenantScope {
            organization_id,
            project_id,
        })
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::not_found());
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn create_workspace(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<WorkspaceInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let authorization = authorize(&state, &headers, AdminPermission::Write).await?;
    validate_name(&input.name)?;
    let organization_id = match authorization {
        crate::state::AdminAuthorization::Installation => input.organization_id,
        crate::state::AdminAuthorization::Operator(operator) => {
            if operator.scope.project_id.is_some()
                || input
                    .organization_id
                    .is_some_and(|organization| organization != operator.scope.organization_id)
            {
                return Err(ApiError::not_found());
            }
            Some(operator.scope.organization_id)
        }
    };
    let organization_id = match organization_id {
        Some(organization) => organization,
        None => state
            .store
            .create_prepaid_organization("Personal workspace", "USD")
            .await
            .map_err(ApiError::from_store)?,
    };
    let scope = state
        .store
        .create_project(organization_id, &input.name)
        .await
        .map_err(ApiError::from_store)?;
    let workspace = state
        .store
        .workspaces(Some(scope.organization_id), Some(scope.project_id))
        .await
        .map_err(ApiError::from_store)?
        .into_iter()
        .next()
        .ok_or_else(ApiError::not_found)?;
    Ok((StatusCode::CREATED, Json(json!(workspace))))
}

pub async fn organization(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<OrganizationInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    if !authorize(&state, &headers, AdminPermission::Write)
        .await?
        .is_installation()
    {
        return Err(ApiError::forbidden());
    }
    validate_name(&input.name)?;
    if input.currency.len() != 3 || !input.currency.bytes().all(|b| b.is_ascii_uppercase()) {
        return Err(ApiError::invalid_request(
            "Currency must be a three-letter uppercase code",
        ));
    }
    let id = state
        .store
        .create_prepaid_organization(&input.name, &input.currency)
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        StatusCode::CREATED,
        Json(json!({"id": id, "name": input.name, "currency": input.currency})),
    ))
}

pub async fn project(
    State(state): State<AppState>,
    Path(organization_id): Path<Uuid>,
    headers: HeaderMap,
    Json(input): Json<Name>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    let authorization = authorize(&state, &headers, AdminPermission::Write).await?;
    if !authorization.permits_project_creation(organization_id) {
        return Err(ApiError::not_found());
    }
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
    input: Result<Json<KeyInput>, axum::extract::rejection::JsonRejection>,
) -> Result<(StatusCode, [(String, String); 1], Json<Value>), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
    let Json(input) = input.map_err(|_| {
        ApiError::invalid_request(
            "Provide only name, allowed_models and ttl_seconds when creating a workspace API key",
        )
    })?;
    let mut models = crate::vendors::scoped_models(&state, organization_id).await?;
    models.extend(
        crate::codex::private_models(
            &state,
            TenantScope {
                organization_id,
                project_id,
            },
        )
        .await?,
    );
    let all_models = input.allowed_models.len() == 1 && input.allowed_models[0] == "*";
    if (!all_models && input.allowed_models.iter().any(|m| !models.contains_key(m)))
        || (input.allowed_models.iter().any(|model| model == "*") && !all_models)
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
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
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

pub async fn update_key_metadata(
    State(state): State<AppState>,
    Path((organization_id, project_id, key_id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<KeyMetadataInput>,
) -> Result<Json<Value>, ApiError> {
    let authorization = authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let mut models = crate::vendors::scoped_models(&state, organization_id).await?;
    models.extend(crate::codex::private_models(&state, scope).await?);
    let all_models = input.allowed_models.len() == 1 && input.allowed_models[0] == "*";
    if (!all_models && input.allowed_models.iter().any(|m| !models.contains_key(m)))
        || (input.allowed_models.iter().any(|m| m == "*") && !all_models)
    {
        return Err(ApiError::invalid_request("Every granted model must exist"));
    }
    let actor = match authorization {
        crate::state::AdminAuthorization::Installation => "installation".to_owned(),
        crate::state::AdminAuthorization::Operator(operator) => format!("operator:{}", operator.id),
    };
    let revision = state
        .store
        .update_key_metadata(
            scope,
            key_id,
            &input.name,
            &input.allowed_models,
            input.expected_revision,
            &actor,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"revision": revision})))
}

pub async fn create_account(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<niu_storage::AccountInput>,
) -> Result<(StatusCode, Json<Value>), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
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
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
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
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
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
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
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
    let local_installation = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await
        .is_ok_and(|authorization| authorization.is_installation());
    let result = if state.admin_tokens.matches(header) || local_installation {
        let Json(input) =
            body.map_err(|_| ApiError::invalid_request("Invalid quota observation JSON"))?;
        state.store.observe_quota(scope, account, &input).await
    } else {
        match state.store.authenticate_operator(token).await {
            Ok(operator) => {
                if !operator.scope.permits_project(scope) {
                    return Err(ApiError::not_found());
                }
                if !operator.role.permits(AdminPermission::Write) {
                    return Err(ApiError::forbidden());
                }
                let Json(input) =
                    body.map_err(|_| ApiError::invalid_request("Invalid quota observation JSON"))?;
                state.store.observe_quota(scope, account, &input).await
            }
            Err(niu_storage::StoreError::Unauthorized) => {
                let Json(input) =
                    body.map_err(|_| ApiError::invalid_request("Invalid quota observation JSON"))?;
                state
                    .store
                    .observe_quota_as_collector(token, scope, account, &input)
                    .await
            }
            Err(error) => return Err(ApiError::from_store(error)),
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
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
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
    let authorization = authorize(&state, &headers, AdminPermission::Read).await?;
    let organizations = match authorization {
        crate::state::AdminAuthorization::Installation => state.store.organizations().await,
        crate::state::AdminAuthorization::Operator(operator) => {
            state.store.organizations_for_scope(operator.scope).await
        }
    }
    .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": organizations})))
}

pub async fn operators(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let authorization = authorize(&state, &headers, AdminPermission::ManageOperators).await?;
    let operators = match authorization {
        crate::state::AdminAuthorization::Installation => state.store.operators().await,
        crate::state::AdminAuthorization::Operator(operator) => {
            state.store.operators_for_scope(operator.scope).await
        }
    }
    .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": operators})))
}

pub async fn create_operator(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<OperatorInput>,
) -> Result<(StatusCode, [(String, String); 1], Json<Value>), ApiError> {
    let scope = OperatorScope {
        organization_id: input.organization_id,
        project_id: input.project_id,
    };
    let authorization = authorize(&state, &headers, AdminPermission::ManageOperators).await?;
    if !authorization.permits_operator_scope(scope) {
        return Err(ApiError::not_found());
    }
    let issued = state
        .store
        .create_operator(
            scope,
            &input.name,
            input.role,
            input.expires_in_seconds,
            audit_actor(authorization),
        )
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
                "organization_id": scope.organization_id,
                "project_id": scope.project_id,
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
    authorize_operator_management(&state, &headers, operator_id).await?;
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
    let authorization = authorize_operator_management(&state, &headers, operator_id).await?;
    let issued = state
        .store
        .create_operator_session(
            operator_id,
            input.expires_in_seconds,
            audit_actor(authorization),
        )
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
    let authorization = authorize_operator_management(&state, &headers, operator_id).await?;
    state
        .store
        .revoke_operator_session(operator_id, session_id, audit_actor(authorization))
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn revoke_operator(
    State(state): State<AppState>,
    Path(operator_id): Path<Uuid>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let authorization = authorize_operator_management(&state, &headers, operator_id).await?;
    state
        .store
        .revoke_operator(operator_id, audit_actor(authorization))
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn projects(
    State(state): State<AppState>,
    Path(organization): Path<Uuid>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let authorization = authorize(&state, &headers, AdminPermission::Read).await?;
    if !authorization.permits_organization(organization) {
        return Err(ApiError::not_found());
    }
    let projects = match authorization {
        crate::state::AdminAuthorization::Installation => state.store.projects(organization).await,
        crate::state::AdminAuthorization::Operator(operator) => {
            state.store.projects_for_scope(operator.scope).await
        }
    }
    .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": projects})))
}

pub async fn keys(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    Ok(Json(
        json!({"data":state.store.list_keys(TenantScope { organization_id, project_id }).await.map_err(ApiError::from_store)?}),
    ))
}

pub async fn rotate_key(
    State(state): State<AppState>,
    Path((organization_id, project_id, key_id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<(StatusCode, [(String, String); 1], Json<Value>), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
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
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    authorize_platform(&state, &headers).await?;
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
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    authorize_platform(&state, &headers).await?;
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

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GatewayActivityQuery {
    http_status: Option<String>,
    sort: Option<String>,
    limit: Option<u16>,
    after: Option<Uuid>,
    from_ms: Option<i64>,
    to_ms: Option<i64>,
    model_alias: Option<String>,
    key_id: Option<Uuid>,
    status: Option<String>,
}

pub(super) fn gateway_activity_filter(
    query: &GatewayActivityQuery,
) -> Result<niu_storage::GatewayActivityFilter, ApiError> {
    if matches!((query.from_ms, query.to_ms), (Some(from), Some(to)) if from >= to) {
        return Err(ApiError::invalid_request(
            "from_ms must be earlier than to_ms",
        ));
    }
    const MIN_TIMESTAMP_MS: i64 = -62_135_596_800_000;
    const MAX_TIMESTAMP_MS: i64 = 253_402_300_799_999;
    if query
        .from_ms
        .is_some_and(|time| !(MIN_TIMESTAMP_MS..=MAX_TIMESTAMP_MS).contains(&time))
        || query
            .to_ms
            .is_some_and(|time| !(MIN_TIMESTAMP_MS..=MAX_TIMESTAMP_MS).contains(&time))
    {
        return Err(ApiError::invalid_request(
            "Date filters must be valid Unix epoch milliseconds",
        ));
    }
    if query
        .model_alias
        .as_ref()
        .is_some_and(|alias| alias.is_empty() || alias.len() > 200)
    {
        return Err(ApiError::invalid_request(
            "model_alias must contain 1 to 200 bytes",
        ));
    }
    if query.status.as_deref().is_some_and(|status| {
        !matches!(
            status,
            "not_sent"
                | "may_have_executed"
                | "confirmed_completed"
                | "confirmed_not_executed"
                | "output_withheld"
                | "delivery_failed"
        )
    }) {
        return Err(ApiError::invalid_request("Unsupported request status"));
    }
    let sort = match query.sort.as_deref().unwrap_or("time_desc") {
        "time_desc" => niu_storage::GatewayActivitySort::Newest,
        "time_asc" => niu_storage::GatewayActivitySort::Oldest,
        "latency_desc" => niu_storage::GatewayActivitySort::Latency,
        "input_desc" => niu_storage::GatewayActivitySort::InputTokens,
        "output_desc" => niu_storage::GatewayActivitySort::OutputTokens,
        _ => return Err(ApiError::invalid_request("Unsupported request sort")),
    };
    let delivery_status = match query.http_status.as_deref() {
        None => None,
        Some("unknown") => Some(niu_storage::GatewayDeliveryFilter::Unknown),
        Some(value) if value.len() == 3 && value.bytes().all(|c| c.is_ascii_digit()) => {
            let code = value
                .parse::<i32>()
                .map_err(|_| ApiError::invalid_request("Unsupported HTTP status"))?;
            if !(100..=599).contains(&code) {
                return Err(ApiError::invalid_request(
                    "HTTP status must be 100 to 599 or unknown",
                ));
            }
            Some(niu_storage::GatewayDeliveryFilter::HttpStatus(code))
        }
        Some(_) => {
            return Err(ApiError::invalid_request(
                "HTTP status must be 100 to 599 or unknown",
            ));
        }
    };
    Ok(niu_storage::GatewayActivityFilter {
        sort,
        delivery_status,
        from_ms: query.from_ms,
        to_ms: query.to_ms,
        model_alias: query.model_alias.clone(),
        api_key_id: query.key_id,
        execution: query.status.clone(),
    })
}

/// Read the request metadata that the gateway records automatically. Bodies,
/// prompts and model responses are never included.
pub async fn gateway_request(
    State(state): State<AppState>,
    Path((organization_id, project_id, attempt)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    let data = state
        .store
        .gateway_request(
            TenantScope {
                organization_id,
                project_id,
            },
            attempt,
        )
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(([("cache-control", "no-store")], Json(json!({"data": data}))))
}

pub async fn gateway_activity(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Query(query): Query<GatewayActivityQuery>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) {
        return Err(ApiError::invalid_request("Limit must be between 1 and 100"));
    }
    let filter = gateway_activity_filter(&query)?;
    let scope = TenantScope {
        organization_id,
        project_id,
    };
    let summary = state
        .store
        .gateway_activity_summary(scope, &filter)
        .await
        .map_err(ApiError::from_store)?;
    let mut data = state
        .store
        .gateway_activity(scope, query.after, i64::from(limit) + 1, &filter)
        .await
        .map_err(ApiError::from_store)?;
    let has_more = data.len() > usize::from(limit);
    data.truncate(usize::from(limit));
    let next_cursor = has_more
        .then(|| data.last().map(|entry| entry.attempt_id))
        .flatten();
    let data = serde_json::to_value(data)
        .map_err(|_| ApiError::invalid_request("Activity serialization failed"))?;
    let summary = serde_json::to_value(summary)
        .map_err(|_| ApiError::invalid_request("Activity serialization failed"))?;
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"data": data, "next_cursor": next_cursor, "summary": summary})),
    ))
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
    authorize_platform(&state, &headers).await?;
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
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
    #[serde(default = "default_collector_purpose")]
    purpose: String,
    name: String,
    ttl_seconds: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CollectorKeyQuery {
    purpose: Option<String>,
}

fn default_collector_purpose() -> String {
    "quota".into()
}

pub async fn issue_collector_key(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<CollectorKeyInput>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
    if input.purpose != "quota" {
        return Err(ApiError::invalid_request(
            "Only supplier quota collection is supported",
        ));
    }
    let issued = state
        .store
        .issue_collector_key_for(
            TenantScope {
                organization_id,
                project_id,
            },
            &input.name,
            input.ttl_seconds,
            &input.purpose,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        [("cache-control", "no-store")],
        Json(json!({"id": issued.id, "token": issued.token})),
    ))
}

pub async fn collector_keys(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
    Query(query): Query<CollectorKeyQuery>,
) -> Result<([(&'static str, &'static str); 1], Json<Value>), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    let data = state
        .store
        .list_collector_keys(
            TenantScope {
                organization_id,
                project_id,
            },
            query.purpose.as_deref(),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(([("cache-control", "no-store")], Json(json!({"data": data}))))
}

pub async fn revoke_collector_key(
    State(state): State<AppState>,
    Path((organization_id, project_id, id)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization_id,
        project_id,
    )
    .await?;
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
