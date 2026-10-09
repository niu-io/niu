//! Per-key customer spending management; secret rotations share one limit.
use super::{
    AdminPermission, ApiError, AppState, HeaderMap, Json, Path, Query, State, TenantScope, Uuid,
    Value, authorize_project, json,
};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LimitInput {
    #[serde(deserialize_with = "nullable_amount")]
    limit_nanos: Option<String>,
    expected_revision: String,
}
fn nullable_amount<'de, D: serde::Deserializer<'de>>(d: D) -> Result<Option<String>, D::Error> {
    Option::<String>::deserialize(d)
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
            "Use nonnegative decimal integer strings",
        ));
    }
    value
        .parse()
        .map_err(|_| ApiError::invalid_request("Amount or revision exceeds the supported range"))
}
fn currency(value: &str) -> Result<(), ApiError> {
    if value.len() != 3 || !value.bytes().all(|b| b.is_ascii_uppercase()) {
        return Err(ApiError::invalid_request(
            "A three-letter uppercase account currency is required",
        ));
    }
    Ok(())
}
pub async fn list(
    State(state): State<AppState>,
    Path((organization, workspace, key)): Path<(Uuid, Uuid, Uuid)>,
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
        json!({"data":state.store.customer_key_spending_limits(scope,key).await.map_err(ApiError::from_store)?}),
    ))
}
pub async fn write(
    State(state): State<AppState>,
    Path((organization, workspace, key, unit)): Path<(Uuid, Uuid, Uuid, String)>,
    headers: HeaderMap,
    Json(input): Json<LimitInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization,
        workspace,
    )
    .await?;
    if matches!(auth,crate::state::AdminAuthorization::Operator(ref operator) if operator.role!=niu_storage::OperatorRole::Owner)
    {
        return Err(ApiError::forbidden());
    }
    currency(&unit)?;
    let scope = TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    let revision = state
        .store
        .set_customer_key_spending_limit(
            scope,
            key,
            &unit,
            input.limit_nanos.as_deref().map(decimal).transpose()?,
            decimal(&input.expected_revision)?,
            super::audit_actor(auth),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":revision.to_string()}})))
}
pub async fn history(
    State(state): State<AppState>,
    Path((organization, workspace, key, unit)): Path<(Uuid, Uuid, Uuid, String)>,
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
    currency(&unit)?;
    let Query(query) =
        query.map_err(|_| ApiError::invalid_request("Invalid key-limit history query"))?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) || query.before_revision.is_some_and(|r| r <= 0) {
        return Err(ApiError::invalid_request(
            "Invalid history cursor or page size",
        ));
    }
    let scope = TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    Ok(Json(
        json!({"data":state.store.customer_key_limit_history(scope,key,&unit,query.before_revision,limit).await.map_err(ApiError::from_store)?}),
    ))
}
