//! Workspace content deletion; management credentials and procurement are never returned.
use crate::{admin::authorize_project, error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
};
use niu_storage::{AdminPermission, TenantScope};
use uuid::Uuid;

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ListQuery {
    after: Option<Uuid>,
    limit: Option<i64>,
}

pub async fn list(
    State(state): State<AppState>,
    Path((organization_id, project_id)): Path<(Uuid, Uuid)>,
    Query(query): Query<ListQuery>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<serde_json::Value>), ApiError> {
    authorize_project(
        &state,
        &headers,
        AdminPermission::Read,
        organization_id,
        project_id,
    )
    .await?;
    let limit = query.limit.unwrap_or(30);
    if !(1..=100).contains(&limit) {
        return Err(ApiError::invalid_request("limit must be between 1 and 100"));
    }
    let mut data = state
        .store
        .asset_group_request_summaries(
            TenantScope {
                organization_id,
                project_id,
            },
            query.after,
            limit + 1,
        )
        .await
        .map_err(ApiError::from_store)?;
    let has_more = data.len() > limit as usize;
    data.truncate(limit as usize);
    let next_cursor = has_more
        .then(|| data.last().and_then(|row| row.get("id")).cloned())
        .flatten();
    Ok((
        [("cache-control", "no-store")],
        Json(serde_json::json!({"data":data,"next_cursor":next_cursor})),
    ))
}

pub async fn delete(
    State(state): State<AppState>,
    Path((organization_id, project_id, intent)): Path<(Uuid, Uuid, Uuid)>,
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
        .delete_asset_group_request(
            TenantScope {
                organization_id,
                project_id,
            },
            intent,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn get(
    State(state): State<AppState>,
    Path((organization_id, project_id, intent)): Path<(Uuid, Uuid, Uuid)>,
    headers: HeaderMap,
) -> Result<([(&'static str, &'static str); 1], Json<serde_json::Value>), ApiError> {
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
        .asset_group_request_detail(
            TenantScope {
                organization_id,
                project_id,
            },
            intent,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok((
        [("cache-control", "no-store")],
        Json(serde_json::json!({"data":data})),
    ))
}
