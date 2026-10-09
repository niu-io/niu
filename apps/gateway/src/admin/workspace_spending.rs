//! Customer retail workspace limits, separate from procurement administration.
use super::{
    AdminPermission, ApiError, AppState, HeaderMap, Json, Path, Query, State, TenantScope, Uuid,
    Value, authorize_project, json,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LimitInput {
    limit_nanos: String,
    expected_revision: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct HistoryQuery {
    before_revision: Option<i64>,
    limit: Option<i64>,
}

fn decimal(value: &str) -> Result<i64, ApiError> {
    if value.is_empty() || !value.bytes().all(|b| b.is_ascii_digit()) {
        return Err(ApiError::invalid_request(
            "Amounts and revisions must be nonnegative decimal integer strings",
        ));
    }
    value
        .parse()
        .map_err(|_| ApiError::invalid_request("Amount or revision exceeds the supported range"))
}

fn scope(organization_id: Uuid, project_id: Uuid, currency: &str) -> Result<TenantScope, ApiError> {
    if currency.len() != 3 || !currency.bytes().all(|b| b.is_ascii_uppercase()) {
        return Err(ApiError::invalid_request(
            "A three-letter uppercase account currency is required",
        ));
    }
    Ok(TenantScope {
        organization_id,
        project_id,
    })
}

/// Discover usable currencies without granting company-balance access.
pub async fn list(
    State(state): State<AppState>,
    Path((organization, workspace)): Path<(Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization,
        workspace,
    )
    .await?;
    let scope = TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    Ok(Json(
        json!({"data": state.store.customer_workspace_spending_limits(scope).await.map_err(ApiError::from_store)?}),
    ))
}

pub async fn read(
    State(state): State<AppState>,
    Path((organization, workspace, currency)): Path<(Uuid, Uuid, String)>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization,
        workspace,
    )
    .await?;
    let scope = scope(organization, workspace, &currency)?;
    Ok(Json(
        json!({"data":state.store.customer_workspace_spending_limit(scope,&currency).await.map_err(ApiError::from_store)?}),
    ))
}

pub async fn write(
    State(state): State<AppState>,
    Path((organization, workspace, currency)): Path<(Uuid, Uuid, String)>,
    headers: HeaderMap,
    Json(input): Json<LimitInput>,
) -> Result<Json<Value>, ApiError> {
    let authorization = authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization,
        workspace,
    )
    .await?;
    if matches!(authorization, crate::state::AdminAuthorization::Operator(ref operator) if operator.role != niu_storage::OperatorRole::Owner)
    {
        return Err(ApiError::forbidden());
    }
    let scope = scope(organization, workspace, &currency)?;
    let revision = state
        .store
        .set_customer_workspace_spending_limit_audited(
            scope,
            &currency,
            decimal(&input.limit_nanos)?,
            decimal(&input.expected_revision)?,
            super::audit_actor(authorization),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":revision.to_string()}})))
}

pub async fn history(
    State(state): State<AppState>,
    Path((organization, workspace, currency)): Path<(Uuid, Uuid, String)>,
    headers: HeaderMap,
    query: Result<Query<HistoryQuery>, axum::extract::rejection::QueryRejection>,
) -> Result<Json<Value>, ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization,
        workspace,
    )
    .await?;
    let scope = scope(organization, workspace, &currency)?;
    let Query(query) =
        query.map_err(|_| ApiError::invalid_request("Invalid spending-limit history query"))?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) || query.before_revision.is_some_and(|r| r <= 0) {
        return Err(ApiError::invalid_request(
            "Invalid spending-limit history cursor or page size",
        ));
    }
    let rows = state
        .store
        .customer_workspace_spending_limit_history(scope, &currency, query.before_revision, limit)
        .await
        .map_err(ApiError::from_store)?;
    // The last returned revision is a stable exclusive cursor; an empty next
    // page is valid when this page is exactly full.
    let next = if rows.len() == limit as usize {
        rows.last().and_then(|row| row.get("revision")).cloned()
    } else {
        None
    };
    Ok(Json(json!({"data":rows,"next_before_revision":next})))
}
