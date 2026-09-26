use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{error::ApiError, state::AppState};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OperatorEventsQuery {
    limit: Option<i64>,
    cursor: Option<Uuid>,
}

pub async fn operator_events(
    State(state): State<AppState>,
    Path(operator_id): Path<Uuid>,
    Query(query): Query<OperatorEventsQuery>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    super::authorize_operator_management(&state, &headers, operator_id).await?;
    if state
        .store
        .operator(operator_id)
        .await
        .map_err(ApiError::from_store)?
        .is_none()
    {
        return Err(ApiError::not_found());
    }
    let page = state
        .store
        .operator_audit_events(operator_id, query.cursor, query.limit.unwrap_or(50))
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({
        "data": page.data,
        "next_cursor": page.next_cursor
    })))
}
