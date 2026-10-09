use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{Json, extract::State, http::HeaderMap};
use niu_storage::{AdminPermission, BrandingSettings};
use serde::Deserialize;
use serde_json::{Value, json};

pub(crate) async fn public(State(state): State<AppState>) -> Result<Json<Value>, ApiError> {
    let (revision, settings) = state
        .store
        .branding_configuration()
        .await
        .map_err(ApiError::from_store)?;
    // Explicit projection: never include audit actors, credentials or commercial settings.
    Ok(Json(
        json!({"data":{"revision":revision.to_string(),"settings":settings}}),
    ))
}
pub(crate) async fn read(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    if !state
        .authorize_admin_headers(&headers, AdminPermission::Read)
        .await?
        .can_manage_platform()
    {
        return Err(ApiError::forbidden());
    }
    public(State(state)).await
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Write {
    expected_revision: String,
    settings: BrandingSettings,
}
pub(crate) async fn save(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<Write>,
) -> Result<Json<Value>, ApiError> {
    let auth = state
        .authorize_admin_headers(&headers, AdminPermission::Write)
        .await?;
    if !auth.can_manage_platform() {
        return Err(ApiError::forbidden());
    }
    let expected = input
        .expected_revision
        .parse::<i64>()
        .ok()
        .filter(|v| *v >= 0 && v.to_string() == input.expected_revision)
        .ok_or_else(|| ApiError::invalid_request("Provide the current branding revision"))?;
    input.settings.validate().map_err(|_| {
        ApiError::invalid_request(
            "Provide a bounded display name and supported hex colors with readable text contrast",
        )
    })?;
    let actor = match auth {
        AdminAuthorization::Operator(operator) => Some(operator.id),
        _ => None,
    };
    let (revision, settings) = state
        .store
        .save_branding_configuration_snapshot(expected, &input.settings, actor)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(
        json!({"data":{"revision":revision.to_string(),"settings":settings}}),
    ))
}
