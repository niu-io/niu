use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Query, State},
    http::HeaderMap,
};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PoolQuery {
    alias: String,
    before_revision: Option<i64>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PoolInput {
    alias: String,
    organization_id: Option<uuid::Uuid>,
    enabled: bool,
    expected_revision: i64,
    candidates: Vec<niu_storage::RoutePoolCandidate>,
}

pub async fn get(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<PoolQuery>,
) -> Result<Json<Value>, ApiError> {
    super::api::installation(&state, &headers).await?;
    let pool = state
        .store
        .model_route_pool(&query.alias)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data":pool})))
}
pub async fn put(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<PoolInput>,
) -> Result<Json<Value>, ApiError> {
    super::api::installation(&state, &headers).await?;
    let revision = state
        .store
        .set_model_route_pool(&niu_storage::ModelRoutePool {
            alias: input.alias,
            organization_id: input.organization_id,
            enabled: input.enabled,
            revision: input.expected_revision,
            candidates: input.candidates,
        })
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"revision":revision}})))
}
pub async fn history(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<PoolQuery>,
) -> Result<Json<Value>, ApiError> {
    super::api::installation(&state, &headers).await?;
    if state
        .store
        .model_route_pool(&query.alias)
        .await
        .map_err(ApiError::from_store)?
        .is_none()
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(
        json!({"data":state.store.model_route_pool_history(&query.alias,query.before_revision).await.map_err(ApiError::from_store)?}),
    ))
}
