use super::{
    AdminPermission, ApiError, AppState, HeaderMap, Json, Path, Query, State, TenantScope, Uuid,
    Value, authorize_project, json,
};
use serde::Deserialize;
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PolicyInput {
    #[serde(deserialize_with = "required_nullable_limit")]
    requests_per_minute: Option<i64>,
    expected_revision: String,
}
fn required_nullable_limit<'de, D: serde::Deserializer<'de>>(
    d: D,
) -> Result<Option<i64>, D::Error> {
    Option::<i64>::deserialize(d)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct History {
    before_revision: Option<i64>,
    limit: Option<i64>,
}
pub async fn read(
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
        json!({"data":state.store.key_request_rate_policy(scope,key).await.map_err(ApiError::from_store)?.ok_or_else(ApiError::not_found)?}),
    ))
}
pub async fn usage(
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
        json!({"data":state.store.key_token_usage_window(scope,key).await.map_err(ApiError::from_store)?.ok_or_else(ApiError::not_found)?}),
    ))
}
pub async fn write(
    State(state): State<AppState>,
    Path((organization, workspace, key)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    Json(input): Json<PolicyInput>,
) -> Result<Json<Value>, ApiError> {
    let auth = authorize_project(
        &state,
        &headers,
        AdminPermission::Write,
        organization,
        workspace,
    )
    .await?;
    if matches!(auth,crate::state::AdminAuthorization::Operator(ref op) if op.role!=niu_storage::OperatorRole::Owner)
    {
        return Err(ApiError::forbidden());
    }
    let scope = TenantScope {
        organization_id: organization,
        project_id: workspace,
    };
    if !state
        .store
        .key_spending_scope_exists(scope, key)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::not_found());
    }
    if input.expected_revision.is_empty()
        || !input.expected_revision.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(ApiError::invalid_request(
            "Use a nonnegative revision string",
        ));
    }
    let expected = input
        .expected_revision
        .parse()
        .map_err(|_| ApiError::invalid_request("Revision exceeds the supported range"))?;
    let revision = state
        .store
        .set_key_request_rate_policy(
            scope,
            key,
            input.requests_per_minute,
            expected,
            super::audit_actor(auth),
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":revision.to_string()}})))
}
pub async fn history(
    State(state): State<AppState>,
    Path((organization, workspace, key)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
    query: Result<Query<History>, axum::extract::rejection::QueryRejection>,
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
    if !state
        .store
        .key_spending_scope_exists(scope, key)
        .await
        .map_err(ApiError::from_store)?
    {
        return Err(ApiError::not_found());
    }
    let Query(query) =
        query.map_err(|_| ApiError::invalid_request("Invalid request-rate history query"))?;
    let limit = query.limit.unwrap_or(50);
    if !(1..=100).contains(&limit) || query.before_revision.is_some_and(|v| v <= 0) {
        return Err(ApiError::invalid_request(
            "Invalid history cursor or page size",
        ));
    }
    Ok(Json(
        json!({"data":state.store.key_request_rate_history(scope,key,query.before_revision,limit).await.map_err(ApiError::from_store)?}),
    ))
}
