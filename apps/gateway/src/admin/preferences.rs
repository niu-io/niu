use crate::{error::ApiError, state::AppState};
use axum::{
    Json,
    extract::{State, rejection::JsonRejection},
    http::HeaderMap,
};
use niu_storage::ColorMode;
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PreferencesInput {
    color_mode: ColorMode,
}

pub async fn preferences(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let member = super::profile::current_member(&state, &headers).await?;
    let mode = state
        .store
        .member_color_mode(member)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"color_mode":mode}})))
}

pub async fn update_preferences(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Json<PreferencesInput>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let member = super::profile::current_member(&state, &headers).await?;
    if let Some(runtime) = state.password_auth.as_ref() {
        let browser = !headers.contains_key("authorization")
            || headers
                .get("authorization")
                .and_then(|value| value.to_str().ok())
                == Some("Bearer niu-browser-member-session");
        if browser {
            runtime.require_origin(&headers)?;
        } else {
            runtime.check_origin(&headers)?;
        }
    }
    let Json(input) =
        input.map_err(|_| ApiError::invalid_request("Choose System, Light, or Dark"))?;
    state
        .store
        .set_member_color_mode(member, input.color_mode)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"color_mode":input.color_mode}})))
}
