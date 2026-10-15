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
    let authorization = super::authorize_operator_management(&state, &headers, operator_id).await?;
    let page = match state
        .store
        .operator_audit_events(operator_id, query.cursor, query.limit.unwrap_or(50))
        .await
    {
        Ok(page) => page,
        Err(err) => {
            if authorization.is_installation()
                && state
                    .store
                    .operator(operator_id)
                    .await
                    .map_err(ApiError::from_store)?
                    .is_none()
            {
                return Err(ApiError::not_found());
            }
            return Err(ApiError::from_store(err));
        }
    };
    if page.data.is_empty()
        && authorization.is_installation()
        && state
            .store
            .operator(operator_id)
            .await
            .map_err(ApiError::from_store)?
            .is_none()
    {
        return Err(ApiError::not_found());
    }
    Ok(Json(json!({
        "data": page.data,
        "next_cursor": page.next_cursor
    })))
}
