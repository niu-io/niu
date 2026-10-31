use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};
use niu_storage::AdminPermission;
use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    error::ApiError,
    state::{AdminAuthorization, AppState},
};

/// Reauthenticate each request so the dashboard never treats cached role hints as authority.
pub async fn current_session(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<Value>, ApiError> {
    let authorization = super::authorize(&state, &headers, AdminPermission::Read).await?;
    let admin_mode_available = match authorization {
        AdminAuthorization::Installation => false,
        AdminAuthorization::Operator(principal) => state
            .store
            .browser_admin_mode_available(principal)
            .await
            .map_err(ApiError::from_store)?,
    };
    let (kind, operator, role) = match authorization {
        AdminAuthorization::Installation => ("installation", Value::Null, None),
        AdminAuthorization::Operator(principal) => (
            "operator",
            json!({
                "id": principal.id,
                "role": principal.role,
                "organization_id": principal.scope.organization_id,
                "project_id": principal.scope.project_id,
            }),
            Some(principal.role),
        ),
    };
    let profile = match authorization {
        AdminAuthorization::Installation => None,
        AdminAuthorization::Operator(principal) => Some(
            state
                .store
                .member_profile(principal.id)
                .await
                .map_err(ApiError::from_store)?,
        ),
    };
    let active_role = if authorization.can_manage_platform() {
        "admin"
    } else {
        "user"
    };
    let available_roles = if admin_mode_available {
        vec!["user", "admin"]
    } else {
        vec![active_role]
    };
    Ok(Json(json!({"data": {
        "kind": kind,
        "provider_memberships": [],
        "roles": { "available": available_roles, "active": active_role, "switchable": admin_mode_available },
        "profile": profile,
        "admin_mode": { "available": admin_mode_available, "enabled": admin_mode_available && authorization.can_manage_platform() },
        "operator": operator,
        "permissions": {
            "read": true,
            "write": role.is_none_or(|role| role.permits(AdminPermission::Write)),
            "manage_operators": role.is_none_or(|role| role.permits(AdminPermission::ManageOperators)),
            "platform_admin": authorization.can_manage_platform(),
        },
    }})))
}

#[derive(Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionRole {
    User,
    Admin,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SessionRoleInput {
    role: SessionRole,
}

pub async fn update_session_role(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<SessionRoleInput>,
) -> Result<Json<Value>, ApiError> {
    update_admin_mode(
        State(state),
        headers,
        Json(AdminModeInput {
            enabled: matches!(input.role, SessionRole::Admin),
        }),
    )
    .await
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AdminModeInput {
    enabled: bool,
}

pub async fn update_admin_mode(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<AdminModeInput>,
) -> Result<Json<Value>, ApiError> {
    let authorization = super::authorize(&state, &headers, AdminPermission::Read).await?;
    let AdminAuthorization::Operator(principal) = authorization else {
        return Err(ApiError::forbidden());
    };
    if input.enabled
        && !state
            .store
            .browser_admin_mode_available(principal)
            .await
            .map_err(ApiError::from_store)?
    {
        return Err(ApiError::forbidden());
    }
    state
        .store
        .set_browser_admin_mode(principal, input.enabled)
        .await
        .map_err(ApiError::from_store)?;
    current_session(State(state), headers).await
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct AdministrationInput {
    enabled: bool,
    expected_enabled: bool,
}

pub async fn member_administration(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(member): Path<uuid::Uuid>,
) -> Result<Json<Value>, ApiError> {
    if !super::authorize(&state, &headers, AdminPermission::Read)
        .await?
        .is_installation()
    {
        return Err(ApiError::forbidden());
    }
    let enabled = state
        .store
        .member_platform_administration(member)
        .await
        .map_err(ApiError::from_store)?
        .ok_or_else(ApiError::not_found)?;
    Ok(Json(json!({"data":{"enabled":enabled}})))
}

pub async fn set_member_administration(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(member): Path<uuid::Uuid>,
    Json(input): Json<AdministrationInput>,
) -> Result<Json<Value>, ApiError> {
    if !super::authorize(&state, &headers, AdminPermission::Read)
        .await?
        .is_installation()
    {
        return Err(ApiError::forbidden());
    }
    state
        .store
        .set_member_platform_administration(member, input.enabled, input.expected_enabled)
        .await
        .map_err(ApiError::from_store)?;
    Ok(Json(json!({"data":{"enabled":input.enabled}})))
}
