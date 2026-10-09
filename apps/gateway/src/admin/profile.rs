use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};
use axum::{
    Json,
    extract::{State, rejection::JsonRejection},
    http::HeaderMap,
};
use base64::{Engine, engine::general_purpose::STANDARD};
use image::{ImageFormat, ImageReader, Limits};
use niu_storage::{AdminPermission, MemberProfile};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io::Cursor;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProfileInput {
    name: String,
    avatar_data_url: Option<String>,
    expected_revision: i64,
}

pub(super) async fn current_member(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<uuid::Uuid, ApiError> {
    match super::authorize(state, headers, AdminPermission::Read).await? {
        AdminAuthorization::Operator(member) => Ok(member.id),
        AdminAuthorization::Installation => Err(ApiError::forbidden()),
    }
}

pub async fn profile(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let member = current_member(&state, &headers).await?;
    let profile = state
        .store
        .member_profile(member)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": profile})))
}

fn normalize_avatar(value: &str) -> Result<String, ApiError> {
    let invalid = || {
        ApiError::invalid_request("Choose a PNG avatar no larger than 256 × 256 pixels and 128 KB")
    };
    if value.len() > 175000 {
        return Err(invalid());
    }
    let encoded = value
        .strip_prefix("data:image/png;base64,")
        .ok_or_else(invalid)?;
    let bytes = STANDARD.decode(encoded).map_err(|_| invalid())?;
    if bytes.len() > 131072 {
        return Err(invalid());
    }
    let mut reader = ImageReader::with_format(Cursor::new(bytes), ImageFormat::Png);
    let mut limits = Limits::default();
    limits.max_image_width = Some(256);
    limits.max_image_height = Some(256);
    limits.max_alloc = Some(4 * 1024 * 1024);
    reader.limits(limits);
    let image = reader.decode().map_err(|_| invalid())?;
    let mut output = Cursor::new(Vec::new());
    image
        .write_to(&mut output, ImageFormat::Png)
        .map_err(|_| invalid())?;
    if output.get_ref().len() > 131072 {
        return Err(invalid());
    }
    Ok(format!(
        "data:image/png;base64,{}",
        STANDARD.encode(output.into_inner())
    ))
}

pub async fn update_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    input: Result<Json<ProfileInput>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let member = current_member(&state, &headers).await?;
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
    let Json(input) = input.map_err(|_| ApiError::invalid_request("Invalid profile update"))?;
    let avatar = match input.avatar_data_url {
        Some(value) => Some(
            tokio::task::spawn_blocking(move || normalize_avatar(&value))
                .await
                .map_err(|_| ApiError::invalid_request("Could not process the avatar"))??,
        ),
        None => None,
    };
    let profile: MemberProfile = state
        .store
        .update_member_profile(
            member,
            &input.name,
            avatar.as_deref(),
            input.expected_revision,
        )
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data": profile})))
}
